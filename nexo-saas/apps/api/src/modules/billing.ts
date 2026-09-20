import { Router, type Request, type Response } from 'express';
import Stripe from 'stripe';
import { config, appOrigin, stripeEnabled } from '../config.js';
import { db } from '../db.js';
import { auth, requireVerified } from '../core/auth.js';
import { param } from '../core/http.js';
import { audit, withWorkspace, readMembership } from '../core/tenant.js';
import { DomainError, PLANS, subscriptionPlan } from '../domain/policies.mjs';
export const stripe = stripeEnabled ? new Stripe(config.STRIPE_SECRET_KEY!, { timeout: 8000, maxNetworkRetries: 0 }) : null;
export const billingRoutes = Router();
function client(): Stripe { if (!stripe) throw new DomainError(503, 'Cobrança ainda não configurada. O plano Free continua disponível.', 'BILLING_DISABLED'); return stripe; }
const supportedEvents = new Set(['checkout.session.completed', 'customer.subscription.created', 'customer.subscription.updated', 'customer.subscription.deleted']);
export async function stripeWebhook(req: Request, res: Response) {
  const sdk = client(); const signature = req.get('stripe-signature');
  if (!signature) throw new DomainError(400, 'Assinatura do webhook ausente.');
  let event: Stripe.Event;
  try { event = sdk.webhooks.constructEvent(req.body, signature, config.STRIPE_WEBHOOK_SECRET!); }
  catch { throw new DomainError(400, 'Assinatura do webhook inválida.'); }
  if (supportedEvents.has(event.type)) {
    const object = event.data.object as { customer?: string | { id: string } | null };
    const customerId = typeof object.customer === 'string' ? object.customer : object.customer?.id;
    // Durable inbox: acknowledge only after the event is committed. Never store card data.
    await db.stripeEvent.upsert({ where: { id: event.id }, create: { id: event.id, type: event.type, customerId }, update: {} });
  }
  res.json({ received: true });
}
billingRoutes.get('/workspaces/:workspaceId/billing', async (req, res) => {
  const workspaceId = param(req, 'workspaceId'); const actor = await readMembership(workspaceId, auth(res).user.id);
  const [projects, members, invitations, tasks] = await Promise.all([
    db.project.count({ where: { workspaceId, status: 'ACTIVE' } }), db.membership.count({ where: { workspaceId } }),
    db.invitation.count({ where: { workspaceId, acceptedAt: null, revokedAt: null, expiresAt: { gt: new Date() } } }),
    db.task.count({ where: { workspaceId } }),
  ]);
  res.json({ plan: actor.workspace.plan, limits: PLANS[actor.workspace.plan], plans: PLANS, usage: { projects, members: members + invitations, tasks }, billingStatus: actor.workspace.billingStatus, syncedAt: actor.workspace.billingSyncedAt, configured: stripeEnabled, hasCustomer: Boolean(actor.workspace.stripeCustomerId) });
});
billingRoutes.post('/workspaces/:workspaceId/billing/checkout', async (req, res) => {
  requireVerified(res); const sdk = client(); const workspaceId = param(req, 'workspaceId');
  const result = await withWorkspace(workspaceId, auth(res).user.id, ['OWNER'], async (tx, actor) => {
    let customerId = actor.workspace.stripeCustomerId;
    if (!customerId) {
      const customer = await sdk.customers.create({ email: auth(res).user.email, name: actor.workspace.name, metadata: { workspaceId } }, { idempotencyKey: `nexo-customer:${workspaceId}` });
      customerId = customer.id;
      await tx.workspace.update({ where: { id: workspaceId }, data: { stripeCustomerId: customerId } });
    }
    const subscriptions = await sdk.subscriptions.list({ customer: customerId, status: 'all', limit: 100 });
    if (subscriptions.data.some(s => !['canceled', 'incomplete_expired'].includes(s.status))) {
      const portal = await sdk.billingPortal.sessions.create({ customer: customerId, return_url: `${appOrigin}/app/billing` }); return { url: portal.url };
    }
    let generation = actor.workspace.checkoutGeneration;
    if (actor.workspace.stripeCheckoutSessionId) {
      const previous = await sdk.checkout.sessions.retrieve(actor.workspace.stripeCheckoutSessionId);
      if (previous.status === 'open' && previous.url) return { url: previous.url };
      generation += 1;
    }
    const session = await sdk.checkout.sessions.create({
      mode: 'subscription', customer: customerId, client_reference_id: workspaceId,
      line_items: [{ price: config.STRIPE_PRICE_PRO!, quantity: 1 }],
      subscription_data: { metadata: { workspaceId } },
      success_url: `${appOrigin}/app/billing?checkout=success`, cancel_url: `${appOrigin}/app/billing?checkout=canceled`,
    }, { idempotencyKey: `nexo-checkout:${workspaceId}:${generation}` });
    if (!session.url) throw new DomainError(502, 'A Stripe não retornou o endereço do checkout.');
    await tx.workspace.update({ where: { id: workspaceId }, data: { stripeCheckoutSessionId: session.id, checkoutGeneration: generation } });
    await audit(tx, workspaceId, auth(res).user.id, 'BILLING_CHECKOUT_CREATED', 'Checkout de assinatura iniciado');
    return { url: session.url };
  }); res.json(result);
});
billingRoutes.post('/workspaces/:workspaceId/billing/portal', async (req, res) => {
  requireVerified(res); const sdk = client(); const workspaceId = param(req, 'workspaceId');
  const result = await withWorkspace(workspaceId, auth(res).user.id, ['OWNER'], async (tx, actor) => {
    if (!actor.workspace.stripeCustomerId) throw new DomainError(409, 'Esta equipe ainda não possui cadastro de cobrança.');
    const session = await sdk.billingPortal.sessions.create({ customer: actor.workspace.stripeCustomerId, return_url: `${appOrigin}/app/billing` });
    await audit(tx, workspaceId, auth(res).user.id, 'BILLING_PORTAL_OPENED', 'Portal de assinatura acessado');
    return { url: session.url };
  }); res.json(result);
});
/** Fetch current provider state instead of applying possibly reordered event snapshots. */
export async function syncBillingCustomer(customerId: string) {
  const sdk = client();
  const hint = await db.workspace.findUnique({ where: { stripeCustomerId: customerId }, select: { id: true } });
  if (!hint) return;
  await db.$transaction(async tx => {
    await tx.$queryRaw`SELECT "id" FROM "Workspace" WHERE "id" = ${hint.id}::uuid FOR UPDATE`;
    const workspace = await tx.workspace.findUniqueOrThrow({ where: { id: hint.id } });
    const subscriptions = await sdk.subscriptions.list({ customer: customerId, status: 'all', limit: 100 });
    if (subscriptions.has_more) throw new Error('SUBSCRIPTION_RECONCILIATION_REQUIRES_REVIEW');
    const matching = subscriptions.data.filter(s => s.items.data.some(item => item.price.id === config.STRIPE_PRICE_PRO));
    const current = matching.find(s => subscriptionPlan(s.status, true) === 'PRO') || matching[0];
    const plan = subscriptionPlan(current?.status || 'none', Boolean(current));
    await tx.workspace.update({ where: { id: hint.id }, data: { plan, stripeSubscriptionId: current?.id || null, billingStatus: current?.status || 'none', billingSyncedAt: new Date() } });
    if (workspace.plan !== plan || workspace.billingStatus !== (current?.status || 'none')) await audit(tx, hint.id, null, 'BILLING_SYNCED', `Assinatura sincronizada: ${plan}`);
  }, { maxWait: 5000, timeout: 20000 });
}
