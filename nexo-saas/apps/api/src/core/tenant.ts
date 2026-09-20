import { db } from '../db.js';
import type { Prisma, Membership, Workspace } from '../generated/prisma/client.js';
import { DomainError, requireRole } from '../domain/policies.mjs';
export type Transaction = Prisma.TransactionClient;
export async function readMembership(workspaceId: string, userId: string) {
  const membership = await db.membership.findUnique({ where: { workspaceId_userId: { workspaceId, userId } }, include: { workspace: true } });
  if (!membership) throw new DomainError(404, 'Equipe não encontrada.', 'NOT_FOUND');
  return membership;
}
/** All workspace writes share a row lock: quotas and role changes cannot race. */
export async function withWorkspace<T>(workspaceId: string, userId: string, roles: string[], work: (tx: Transaction, membership: Membership & { workspace: Workspace }) => Promise<T>) {
  return db.$transaction(async tx => {
    await tx.$queryRaw`SELECT "id" FROM "Workspace" WHERE "id" = ${workspaceId}::uuid FOR UPDATE`;
    const membership = await tx.membership.findUnique({ where: { workspaceId_userId: { workspaceId, userId } }, include: { workspace: true } });
    if (!membership) throw new DomainError(404, 'Equipe não encontrada.');
    requireRole(membership.role, roles);
    return work(tx, membership);
  }, { maxWait: 5000, timeout: 20000 });
}
export async function audit(tx: Transaction, workspaceId: string, actorId: string | null, action: string, summary: string, entityId?: string) {
  await tx.auditLog.create({ data: { workspaceId, actorId, action, summary, entityId } });
}
export async function occupiedSeats(tx: Transaction, workspaceId: string) {
  const [members, invites] = await Promise.all([
    tx.membership.count({ where: { workspaceId } }),
    tx.invitation.count({ where: { workspaceId, acceptedAt: null, revokedAt: null, expiresAt: { gt: new Date() } } }),
  ]);
  return members + invites;
}
