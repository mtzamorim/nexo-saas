import type { Request, Response, NextFunction } from 'express';
import { db } from '../db.js';
import { production } from '../config.js';
import { randomToken, sha256, csrfToken, safeEqual } from './security.mjs';
import { DomainError } from '../domain/policies.mjs';
import type { User } from '../generated/prisma/client.js';
const cookieName = production ? '__Host-nexo_session' : 'nexo_session';
const cookieOptions = { httpOnly: true, secure: production, sameSite: 'lax' as const, path: '/' };
export type AuthContext = { user: User; tokenHash: string; rawToken: string };
export function auth(res: Response): AuthContext { return res.locals.auth as AuthContext; }
export function publicUser(user: User) { return { id: user.id, name: user.name, email: user.email, emailVerified: Boolean(user.emailVerifiedAt) }; }
export async function createSession(res: Response, userId: string, expectedPasswordHash?: string) {
  const raw = randomToken(); const expiresAt = new Date(Date.now() + 14 * 86400000);
  await db.$transaction(async tx => {
    // Serialize against resets: an in-flight login with the old password must
    // not create a fresh session after a successful password reset.
    await tx.$queryRaw`SELECT "id" FROM "User" WHERE "id" = ${userId}::uuid FOR UPDATE`;
    const current = await tx.user.findUnique({ where: { id: userId } });
    if (!current || (expectedPasswordHash && current.passwordHash !== expectedPasswordHash)) throw new DomainError(401, 'Credenciais alteradas. Entre novamente.');
    await tx.session.create({ data: { tokenHash: sha256(raw), userId, expiresAt } });
  });
  res.cookie(cookieName, raw, { ...cookieOptions, expires: expiresAt });
}
export function clearSessionCookie(res: Response) { res.clearCookie(cookieName, cookieOptions); }
export async function requireAuth(req: Request, res: Response, next: NextFunction) {
  const raw: unknown = req.cookies?.[cookieName];
  if (typeof raw !== 'string' || raw.length !== 43) throw new DomainError(401, 'Entre para continuar.', 'UNAUTHENTICATED');
  const tokenHash = sha256(raw);
  const session = await db.session.findUnique({ where: { tokenHash }, include: { user: true } });
  if (!session || session.expiresAt <= new Date() || Date.now() - session.lastSeenAt.getTime() > 86400000) {
    if (session) await db.session.deleteMany({ where: { tokenHash } });
    clearSessionCookie(res); throw new DomainError(401, 'Sua sessão expirou. Entre novamente.', 'UNAUTHENTICATED');
  }
  if (Date.now() - session.lastSeenAt.getTime() > 300000) await db.session.updateMany({ where: { tokenHash }, data: { lastSeenAt: new Date() } });
  res.locals.auth = { user: session.user, rawToken: raw, tokenHash } satisfies AuthContext;
  res.setHeader('Cache-Control', 'no-store'); next();
}
export function requireCsrf(req: Request, res: Response, next: NextFunction) {
  if (!['GET', 'HEAD', 'OPTIONS'].includes(req.method) && !safeEqual(req.get('x-csrf-token'), csrfToken(auth(res).rawToken))) throw new DomainError(403, 'Token de segurança inválido. Recarregue a página.', 'INVALID_CSRF');
  next();
}
export function requireVerified(res: Response) { if (!auth(res).user.emailVerifiedAt) throw new DomainError(403, 'Confirme seu e-mail para continuar.', 'EMAIL_NOT_VERIFIED'); }
