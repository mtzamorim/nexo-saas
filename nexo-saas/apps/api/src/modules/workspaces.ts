import { Router } from 'express';
import { z } from 'zod';
import { db } from '../db.js';
import { appOrigin } from '../config.js';
import { auth, requireVerified } from '../core/auth.js';
import { param, pagingSchema } from '../core/http.js';
import { audit, withWorkspace, readMembership, occupiedSeats } from '../core/tenant.js';
import { randomToken, sha256 } from '../core/security.mjs';
import { queueEmail } from '../core/mail.js';
import { DomainError, requireCapacity, requireRole, assertRoleChange, assertInvitationEmail, calendarDate } from '../domain/policies.mjs';
export const workspaceRoutes = Router();
const nameSchema = z.string().trim().min(2).max(80);
const timeZoneSchema = z.string().refine(value => { try { new Intl.DateTimeFormat('en', { timeZone: value }); return true; } catch { return false; } }, 'Fuso horário inválido.');
workspaceRoutes.post('/workspaces', async (req, res) => {
  const input = z.object({ name: nameSchema }).strict().parse(req.body);
  const userId = auth(res).user.id;
  const result = await db.$transaction(async tx => {
    await tx.$queryRaw`SELECT "id" FROM "User" WHERE "id" = ${userId}::uuid FOR UPDATE`;
    if (await tx.membership.count({ where: { userId, role: 'OWNER' } }) >= 5) throw new DomainError(409, 'Você já possui cinco equipes.');
    const workspace = await tx.workspace.create({ data: { name: input.name, memberships: { create: { userId, role: 'OWNER' } } } });
    await audit(tx, workspace.id, userId, 'WORKSPACE_CREATED', 'Equipe criada', workspace.id);
    return { id: workspace.id, name: workspace.name };
  });
  res.status(201).json(result);
});
workspaceRoutes.patch('/workspaces/:workspaceId', async (req, res) => {
  const input = z.object({ name: nameSchema, timeZone: timeZoneSchema }).strict().parse(req.body);
  const workspaceId = param(req, 'workspaceId');
  const result = await withWorkspace(workspaceId, auth(res).user.id, ['OWNER', 'ADMIN'], async tx => {
    const changed = await tx.workspace.update({ where: { id: workspaceId }, data: input });
    await audit(tx, workspaceId, auth(res).user.id, 'WORKSPACE_UPDATED', 'Configurações da equipe atualizadas', workspaceId);
    return { id: changed.id, name: changed.name, timeZone: changed.timeZone };
  }); res.json(result);
});
workspaceRoutes.get('/workspaces/:workspaceId/dashboard', async (req, res) => {
  const workspaceId = param(req, 'workspaceId');
  const membership = await readMembership(workspaceId, auth(res).user.id);
  const parts = new Intl.DateTimeFormat('en', { timeZone: membership.workspace.timeZone, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date());
  const part = (type: string) => parts.find(p => p.type === type)?.value;
  const today = calendarDate(`${part('year')}-${part('month')}-${part('day')}`)!;
  const where = { workspaceId, project: { status: 'ACTIVE' as const } };
  const [groups, projects, members, overdue, recentTasks, activity] = await Promise.all([
    db.task.groupBy({ by: ['status'], where, _count: { _all: true } }),
    db.project.count({ where: { workspaceId, status: 'ACTIVE' } }),
    db.membership.count({ where: { workspaceId } }),
    db.task.count({ where: { ...where, status: { not: 'DONE' }, dueDate: { lt: today } } }),
    db.task.findMany({ where: { ...where, status: { not: 'DONE' } }, orderBy: [{ dueDate: { sort: 'asc', nulls: 'last' } }, { createdAt: 'desc' }], take: 6, include: { project: { select: { id: true, name: true, color: true } }, assignee: { include: { user: { select: { name: true } } } } } }),
    db.auditLog.findMany({ where: { workspaceId }, orderBy: { createdAt: 'desc' }, take: 6, include: { actor: { select: { name: true } } } }),
  ]);
  const counts = { TODO: 0, IN_PROGRESS: 0, DONE: 0 };
  for (const group of groups) counts[group.status] = group._count._all;
  res.json({ counts, projects, members, overdue, recentTasks, activity, timeZone: membership.workspace.timeZone });
});
workspaceRoutes.get('/workspaces/:workspaceId/members', async (req, res) => {
  const workspaceId = param(req, 'workspaceId');
  const actor = await readMembership(workspaceId, auth(res).user.id);
  const members = await db.membership.findMany({ where: { workspaceId }, orderBy: { createdAt: 'asc' }, include: { user: { select: { id: true, name: true, email: true } } } });
  const invitations = ['OWNER', 'ADMIN'].includes(actor.role) ? await db.invitation.findMany({ where: { workspaceId, acceptedAt: null, revokedAt: null, expiresAt: { gt: new Date() } }, select: { id: true, email: true, role: true, expiresAt: true }, orderBy: { createdAt: 'desc' } }) : [];
  res.json({ members, invitations });
});
workspaceRoutes.post('/workspaces/:workspaceId/invitations', async (req, res) => {
  requireVerified(res);
  const workspaceId = param(req, 'workspaceId');
  const input = z.object({ email: z.email().max(254).transform(v => v.toLowerCase()), role: z.enum(['ADMIN', 'MEMBER', 'VIEWER']).default('MEMBER') }).strict().parse(req.body);
  await withWorkspace(workspaceId, auth(res).user.id, ['OWNER', 'ADMIN'], async (tx, actor) => {
    if (input.role === 'ADMIN') requireRole(actor.role, ['OWNER']);
    const existing = await tx.membership.findFirst({ where: { workspaceId, user: { email: input.email } } });
    if (existing) throw new DomainError(409, 'Esse usuário já faz parte da equipe.');
    const pending = await tx.invitation.findFirst({ where: { workspaceId, email: input.email, acceptedAt: null, revokedAt: null, expiresAt: { gt: new Date() } } });
    if (pending) throw new DomainError(409, 'Já existe um convite pendente para esse e-mail.');
    requireCapacity(actor.workspace.plan, 'members', await occupiedSeats(tx, workspaceId));
    const raw = randomToken();
    const invitation = await tx.invitation.create({ data: { workspaceId, inviterId: auth(res).user.id, email: input.email, role: input.role, tokenHash: sha256(raw), expiresAt: new Date(Date.now() + 7 * 86400000) } });
    await queueEmail(tx, input.email, 'Convite para uma equipe no Nexo', `Você recebeu um convite para a equipe ${actor.workspace.name}.\n\nEntre ou crie sua conta com este e-mail e aceite em:\n${appOrigin}/convite?token=${raw}\n\nO convite expira em sete dias.`);
    await audit(tx, workspaceId, auth(res).user.id, 'INVITATION_CREATED', 'Convite de equipe enviado', invitation.id);
  }); res.status(201).json({ message: 'Convite colocado na fila de envio.' });
});
workspaceRoutes.delete('/workspaces/:workspaceId/invitations/:id', async (req, res) => {
  const workspaceId = param(req, 'workspaceId'); const id = param(req, 'id');
  await withWorkspace(workspaceId, auth(res).user.id, ['OWNER', 'ADMIN'], async (tx, actor) => {
    const invitation = await tx.invitation.findFirst({ where: { id, workspaceId, acceptedAt: null, revokedAt: null } });
    if (!invitation) throw new DomainError(404, 'Convite não encontrado.');
    if (invitation.role === 'ADMIN') requireRole(actor.role, ['OWNER']);
    await tx.invitation.update({ where: { id }, data: { revokedAt: new Date() } });
    await audit(tx, workspaceId, auth(res).user.id, 'INVITATION_REVOKED', 'Convite revogado', id);
  }); res.json({ ok: true });
});
workspaceRoutes.post('/invitations/accept', async (req, res) => {
  const { token } = z.object({ token: z.string().length(43) }).strict().parse(req.body);
  const result = await db.$transaction(async tx => {
    const hint = await tx.invitation.findUnique({ where: { tokenHash: sha256(token) } });
    if (!hint) throw new DomainError(400, 'Convite inválido ou expirado.');
    await tx.$queryRaw`SELECT "id" FROM "Workspace" WHERE "id" = ${hint.workspaceId}::uuid FOR UPDATE`;
    const invitation = await tx.invitation.findUnique({ where: { id: hint.id }, include: { workspace: true } });
    if (!invitation || invitation.acceptedAt || invitation.revokedAt || invitation.expiresAt <= new Date()) throw new DomainError(400, 'Convite inválido ou expirado.');
    assertInvitationEmail(invitation.email, auth(res).user.email);
    const existing = await tx.membership.findUnique({ where: { workspaceId_userId: { workspaceId: invitation.workspaceId, userId: auth(res).user.id } } });
    if (!existing) {
      requireCapacity(invitation.workspace.plan, 'members', await tx.membership.count({ where: { workspaceId: invitation.workspaceId } }));
      await tx.membership.create({ data: { workspaceId: invitation.workspaceId, userId: auth(res).user.id, role: invitation.role } });
    }
    await tx.invitation.update({ where: { id: invitation.id }, data: { acceptedAt: new Date() } });
    await tx.user.update({ where: { id: auth(res).user.id }, data: { emailVerifiedAt: new Date() } });
    await audit(tx, invitation.workspaceId, auth(res).user.id, 'INVITATION_ACCEPTED', 'Novo integrante entrou na equipe', invitation.id);
    return { workspaceId: invitation.workspaceId };
  }); res.json(result);
});
workspaceRoutes.patch('/workspaces/:workspaceId/members/:id', async (req, res) => {
  const workspaceId = param(req, 'workspaceId'); const id = param(req, 'id');
  const { role } = z.object({ role: z.enum(['ADMIN', 'MEMBER', 'VIEWER']) }).strict().parse(req.body);
  await withWorkspace(workspaceId, auth(res).user.id, ['OWNER'], async (tx, actor) => {
    const target = await tx.membership.findFirst({ where: { id, workspaceId } });
    if (!target) throw new DomainError(404, 'Integrante não encontrado.');
    assertRoleChange(actor.role, target.role, role, actor.id === target.id);
    if (role === 'VIEWER') await tx.task.updateMany({ where: { workspaceId, assigneeMembershipId: id }, data: { assigneeMembershipId: null, version: { increment: 1 } } });
    await tx.membership.update({ where: { id }, data: { role } });
    await audit(tx, workspaceId, auth(res).user.id, 'MEMBER_ROLE_CHANGED', 'Permissão de integrante alterada', id);
  }); res.json({ ok: true });
});
workspaceRoutes.delete('/workspaces/:workspaceId/members/:id', async (req, res) => {
  const workspaceId = param(req, 'workspaceId'); const id = param(req, 'id');
  await withWorkspace(workspaceId, auth(res).user.id, ['OWNER'], async tx => {
    const member = await tx.membership.findFirst({ where: { id, workspaceId } });
    if (!member) throw new DomainError(404, 'Integrante não encontrado.');
    if (member.role === 'OWNER') throw new DomainError(400, 'Transfira a propriedade antes de remover o proprietário.');
    await tx.task.updateMany({ where: { workspaceId, assigneeMembershipId: id }, data: { assigneeMembershipId: null, version: { increment: 1 } } });
    await tx.membership.delete({ where: { id } });
    await audit(tx, workspaceId, auth(res).user.id, 'MEMBER_REMOVED', 'Integrante removido', id);
  }); res.json({ ok: true });
});
workspaceRoutes.post('/workspaces/:workspaceId/members/:id/transfer-ownership', async (req, res) => {
  requireVerified(res);
  const workspaceId = param(req, 'workspaceId'); const id = param(req, 'id');
  await withWorkspace(workspaceId, auth(res).user.id, ['OWNER'], async (tx, actor) => {
    const target = await tx.membership.findFirst({ where: { id, workspaceId } });
    if (!target || target.id === actor.id) throw new DomainError(400, 'Selecione outro integrante.');
    await tx.membership.update({ where: { id: actor.id }, data: { role: 'ADMIN' } });
    await tx.membership.update({ where: { id: target.id }, data: { role: 'OWNER' } });
    await audit(tx, workspaceId, auth(res).user.id, 'OWNERSHIP_TRANSFERRED', 'Propriedade da equipe transferida', id);
  }); res.json({ ok: true });
});
workspaceRoutes.get('/workspaces/:workspaceId/audit', async (req, res) => {
  const workspaceId = param(req, 'workspaceId');
  const actor = await readMembership(workspaceId, auth(res).user.id); requireRole(actor.role, ['OWNER', 'ADMIN']);
  const { page, pageSize } = pagingSchema.parse(req.query);
  const [items, total] = await Promise.all([
    db.auditLog.findMany({ where: { workspaceId }, skip: (page - 1) * pageSize, take: pageSize, orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], include: { actor: { select: { name: true } } } }),
    db.auditLog.count({ where: { workspaceId } }),
  ]); res.json({ items, total, page, pageSize });
});
