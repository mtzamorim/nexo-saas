import { randomUUID } from 'node:crypto';
import { db } from './db.js';
import { config, stripeEnabled, appOrigin } from './config.js';
import { mailer } from './core/mail.js';
import { syncBillingCustomer } from './modules/billing.js';
const MAX_ATTEMPTS = 6;
function eligible() {
  const now = new Date();
  return { attempts: { lt: MAX_ATTEMPTS }, OR: [{ status: 'PENDING' as const, availableAt: { lte: now } }, { status: 'PROCESSING' as const, lockedAt: { lt: new Date(Date.now() - 120000) } }] };
}
function retryData(attempts: number, error: unknown) {
  return {
    status: attempts >= MAX_ATTEMPTS ? 'FAILED' as const : 'PENDING' as const,
    availableAt: new Date(Date.now() + Math.min(3600000, 30000 * 2 ** attempts)),
    lockedAt: null, leaseId: null,
    lastError: String((error as { code?: string })?.code || 'DELIVERY_FAILED').slice(0, 80),
  };
}
async function emailTick() {
  const job = await db.emailJob.findFirst({ where: eligible(), orderBy: { createdAt: 'asc' } }); if (!job) return;
  const leaseId = randomUUID();
  const claim = await db.emailJob.updateMany({ where: { id: job.id, ...eligible() }, data: { status: 'PROCESSING', leaseId, lockedAt: new Date(), attempts: { increment: 1 } } });
  if (claim.count !== 1) return;
  try {
    await mailer.sendMail({ from: config.MAIL_FROM, to: job.recipient, subject: job.subject, text: job.text, messageId: `<${job.id}@${new URL(appOrigin).hostname}>` });
    await db.emailJob.updateMany({ where: { id: job.id, leaseId }, data: { status: 'DONE', text: '', lockedAt: null, leaseId: null, lastError: null } });
  } catch (error) {
    await db.emailJob.updateMany({ where: { id: job.id, leaseId }, data: retryData(job.attempts + 1, error) });
  }
}
async function stripeTick() {
  if (!stripeEnabled) return;
  const job = await db.stripeEvent.findFirst({ where: eligible(), orderBy: { createdAt: 'asc' } }); if (!job) return;
  const leaseId = randomUUID();
  const claim = await db.stripeEvent.updateMany({ where: { id: job.id, ...eligible() }, data: { status: 'PROCESSING', leaseId, lockedAt: new Date(), attempts: { increment: 1 } } });
  if (claim.count !== 1) return;
  try {
    if (job.customerId) await syncBillingCustomer(job.customerId);
    await db.stripeEvent.updateMany({ where: { id: job.id, leaseId }, data: { status: 'DONE', lockedAt: null, leaseId: null, lastError: null } });
  } catch (error) {
    await db.stripeEvent.updateMany({ where: { id: job.id, leaseId }, data: retryData(job.attempts + 1, error) });
  }
}
async function reconcile() {
  // Recover abandoned last attempts instead of leaving permanent PROCESSING rows.
  const stale = { status: 'PROCESSING' as const, attempts: { gte: MAX_ATTEMPTS }, lockedAt: { lt: new Date(Date.now() - 120000) } };
  await db.emailJob.updateMany({ where: stale, data: { status: 'FAILED', leaseId: null, lockedAt: null, lastError: 'LEASE_EXPIRED' } });
  await db.stripeEvent.updateMany({ where: stale, data: { status: 'FAILED', leaseId: null, lockedAt: null, lastError: 'LEASE_EXPIRED' } });
  if (!stripeEnabled) return;
  const workspaces = await db.workspace.findMany({ where: { stripeCustomerId: { not: null }, OR: [{ billingSyncedAt: null }, { billingSyncedAt: { lt: new Date(Date.now() - 86400000) } }] }, take: 100, orderBy: { billingSyncedAt: { sort: 'asc', nulls: 'first' } } });
  for (const workspace of workspaces) {
    const id = `reconcile:${workspace.id}:${Math.floor(Date.now() / 86400000)}`;
    await db.stripeEvent.upsert({ where: { id }, create: { id, type: 'internal.reconcile', customerId: workspace.stripeCustomerId }, update: {} });
  }
}
export function startWorker() {
  let stopped = false; let timer: NodeJS.Timeout | undefined; let lastReconcile = 0;
  let running: Promise<void> = Promise.resolve();
  async function tick() {
    try {
      await Promise.all([emailTick(), stripeTick()]);
      if (Date.now() - lastReconcile > 300000) { await reconcile(); lastReconcile = Date.now(); }
    } catch { console.error(JSON.stringify({ level: 'error', event: 'worker.tick.failed' })); }
    if (!stopped) timer = setTimeout(() => { running = tick(); }, 2000);
  }
  if (config.WORKER_ENABLED) running = tick();
  return async () => { stopped = true; clearTimeout(timer); await running; mailer.close(); };
}
