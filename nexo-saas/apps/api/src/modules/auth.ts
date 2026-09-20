import { Router } from 'express';
import { rateLimit } from 'express-rate-limit';
import { z } from 'zod';
import { db } from '../db.js';
import { appOrigin, config } from '../config.js';
import { DomainError } from '../domain/policies.mjs';
import { hashPassword, verifyPassword, randomToken, sha256, csrfToken } from '../core/security.mjs';
import { auth, requireAuth, requireCsrf, publicUser, createSession, clearSessionCookie } from '../core/auth.js';
import { queueEmail } from '../core/mail.js';
import { audit, type Transaction } from '../core/tenant.js';
export const authRoutes = Router();
const email = z.email().max(254).transform(v => v.trim().toLowerCase());
const password = z.string().min(12, 'Use pelo menos 12 caracteres.').max(128);
const publicLimiter = rateLimit({ windowMs: 15 * 60000, limit: config.NODE_ENV === 'test' ? 1000 : 15, standardHeaders: 'draft-8', legacyHeaders: false, message: { message: 'Muitas tentativas. Tente novamente mais tarde.' } });
async function issueToken(tx: Transaction, userId: string, recipient: string, kind: 'VERIFY' | 'RESET') {
  await tx.$queryRaw`SELECT "id" FROM "User" WHERE "id" = ${userId}::uuid FOR UPDATE`;
  const raw = randomToken();
  await tx.authToken.updateMany({ where: { userId, kind, consumedAt: null }, data: { consumedAt: new Date() } });
  await tx.authToken.create({ data: { userId, kind, tokenHash: sha256(raw), expiresAt: new Date(Date.now() + (kind === 'RESET' ? 3600000 : 86400000)) } });
  const path = kind === 'RESET' ? 'redefinir-senha' : 'confirmar-email';
  const subject = kind === 'RESET' ? 'Redefina sua senha no Nexo' : 'Confirme seu e-mail no Nexo';
  await queueEmail(tx, recipient, subject, `${subject}\n\n${appOrigin}/${path}?token=${raw}\n\nSe você não solicitou esta ação, ignore esta mensagem.`);
}
authRoutes.post('/register', publicLimiter, async (req, res) => {
  const input = z.object({ name: z.string().trim().min(2).max(80), email, password, workspaceName: z.string().trim().min(2).max(80) }).strict().parse(req.body);
  const passwordHash = await hashPassword(input.password);
  const user = await db.$transaction(async tx => {
    const created = await tx.user.create({ data: { name: input.name, email: input.email, passwordHash } });
    const workspace = await tx.workspace.create({ data: { name: input.workspaceName, memberships: { create: { userId: created.id, role: 'OWNER' } } } });
    await audit(tx, workspace.id, created.id, 'WORKSPACE_CREATED', 'Equipe criada', workspace.id);
    await issueToken(tx, created.id, created.email, 'VERIFY');
    return created;
  });
  await createSession(res, user.id, user.passwordHash);
  res.status(201).json({ user: publicUser(user) });
});
// A fixed valid dummy hash prevents skipping the password work for unknown users.
const dummyHash = 'scrypt$32768$8$3$' + '00'.repeat(16) + '$' + '00'.repeat(64);
authRoutes.post('/login', publicLimiter, async (req, res) => {
  const input = z.object({ email, password: z.string().min(1).max(128) }).strict().parse(req.body);
  const user = await db.user.findUnique({ where: { email: input.email } });
  const valid = await verifyPassword(input.password, user?.passwordHash || dummyHash);
  if (!user || !valid) throw new DomainError(401, 'E-mail ou senha incorretos.');
  await createSession(res, user.id, user.passwordHash); res.json({ user: publicUser(user) });
});
authRoutes.post('/forgot-password', publicLimiter, async (req, res) => {
  const input = z.object({ email }).strict().parse(req.body);
  const user = await db.user.findUnique({ where: { email: input.email } });
  if (user) await db.$transaction(tx => issueToken(tx, user.id, user.email, 'RESET'));
  res.json({ message: 'Se houver uma conta, enviaremos as instruções para esse e-mail.' });
});
authRoutes.post('/reset-password', publicLimiter, async (req, res) => {
  const input = z.object({ token: z.string().length(43), password }).strict().parse(req.body);
  const passwordHash = await hashPassword(input.password);
  await db.$transaction(async tx => {
    const token = await tx.authToken.findUnique({ where: { tokenHash: sha256(input.token) } });
    if (!token || token.kind !== 'RESET') throw new DomainError(400, 'Link inválido ou expirado.');
    await tx.$queryRaw`SELECT "id" FROM "User" WHERE "id" = ${token.userId}::uuid FOR UPDATE`;
    const used = await tx.authToken.updateMany({ where: { id: token.id, kind: 'RESET', consumedAt: null, expiresAt: { gt: new Date() } }, data: { consumedAt: new Date() } });
    if (used.count !== 1) throw new DomainError(400, 'Link inválido ou expirado.');
    await tx.user.update({ where: { id: token.userId }, data: { passwordHash } });
    await tx.session.deleteMany({ where: { userId: token.userId } });
    await tx.authToken.updateMany({ where: { userId: token.userId, kind: 'RESET', consumedAt: null }, data: { consumedAt: new Date() } });
  });
  clearSessionCookie(res); res.json({ message: 'Senha atualizada. Entre novamente.' });
});
authRoutes.post('/verify-email', publicLimiter, async (req, res) => {
  const { token: raw } = z.object({ token: z.string().length(43) }).strict().parse(req.body);
  await db.$transaction(async tx => {
    const token = await tx.authToken.findUnique({ where: { tokenHash: sha256(raw) } });
    if (!token || token.kind !== 'VERIFY') throw new DomainError(400, 'Link inválido ou expirado.');
    await tx.$queryRaw`SELECT "id" FROM "User" WHERE "id" = ${token.userId}::uuid FOR UPDATE`;
    const used = await tx.authToken.updateMany({ where: { id: token.id, consumedAt: null, expiresAt: { gt: new Date() } }, data: { consumedAt: new Date() } });
    if (used.count !== 1) throw new DomainError(400, 'Link inválido ou expirado.');
    await tx.user.update({ where: { id: token.userId }, data: { emailVerifiedAt: new Date() } });
  });
  res.json({ message: 'E-mail confirmado.' });
});
authRoutes.use(requireAuth, requireCsrf);
authRoutes.get('/session', async (_req, res) => {
  const context = auth(res);
  const memberships = await db.membership.findMany({ where: { userId: context.user.id }, include: { workspace: true }, orderBy: { createdAt: 'asc' } });
  res.json({ user: publicUser(context.user), csrfToken: csrfToken(context.rawToken), workspaces: memberships.map(m => ({ id: m.workspace.id, name: m.workspace.name, role: m.role, membershipId: m.id, plan: m.workspace.plan })) });
});
authRoutes.post('/logout', async (_req, res) => {
  await db.session.deleteMany({ where: { tokenHash: auth(res).tokenHash } }); clearSessionCookie(res); res.json({ ok: true });
});
authRoutes.post('/logout-all', async (_req, res) => {
  await db.session.deleteMany({ where: { userId: auth(res).user.id } }); clearSessionCookie(res); res.json({ ok: true });
});
authRoutes.post('/resend-verification', publicLimiter, async (_req, res) => {
  const user = auth(res).user;
  if (!user.emailVerifiedAt) await db.$transaction(tx => issueToken(tx, user.id, user.email, 'VERIFY'));
  res.json({ message: 'Confira sua caixa de entrada.' });
});
