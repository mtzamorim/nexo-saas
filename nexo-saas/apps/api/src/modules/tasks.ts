import { Router } from 'express';
import { z } from 'zod';
import { taskCreateSchema, taskPatchSchema } from './schemas.js';
import type { Prisma } from '../generated/prisma/client.js';
import { db } from '../db.js';
import { auth } from '../core/auth.js';
import { param, pagingSchema } from '../core/http.js';
import { audit, withWorkspace, readMembership, type Transaction } from '../core/tenant.js';
import { DomainError, requireCapacity, calendarDate, assertVersion } from '../domain/policies.mjs';
export const taskRoutes = Router();
const include = { project: { select: { id: true, name: true, color: true, status: true } }, assignee: { include: { user: { select: { id: true, name: true } } } } } satisfies Prisma.TaskInclude;
async function checkRelations(tx: Transaction, workspaceId: string, projectId: string, assigneeMembershipId: string | null) {
  const project = await tx.project.findFirst({ where: { id: projectId, workspaceId } });
  if (!project) throw new DomainError(404, 'Projeto não encontrado.');
  if (project.status !== 'ACTIVE') throw new DomainError(409, 'Reative o projeto antes de alterar suas tarefas.');
  if (assigneeMembershipId && !await tx.membership.findFirst({ where: { id: assigneeMembershipId, workspaceId, role: { not: 'VIEWER' } } })) throw new DomainError(400, 'Responsável inválido para esta equipe.');
}
taskRoutes.get('/workspaces/:workspaceId/tasks', async (req, res) => {
  const workspaceId = param(req, 'workspaceId'); const actor = await readMembership(workspaceId, auth(res).user.id);
  const query = pagingSchema.extend({ search: z.string().trim().max(160).optional(), status: z.enum(['TODO', 'IN_PROGRESS', 'DONE']).optional(), projectId: z.uuid().optional(), mine: z.enum(['true', 'false']).optional() }).parse(req.query);
  const where: Prisma.TaskWhereInput = { workspaceId, project: { status: 'ACTIVE' }, ...(query.search ? { title: { contains: query.search, mode: 'insensitive' } } : {}), ...(query.status ? { status: query.status } : {}), ...(query.projectId ? { projectId: query.projectId } : {}), ...(query.mine === 'true' ? { assigneeMembershipId: actor.id } : {}) };
  const [items, total] = await Promise.all([
    db.task.findMany({ where, include, orderBy: [{ createdAt: 'desc' }, { id: 'desc' }], skip: (query.page - 1) * query.pageSize, take: query.pageSize }),
    db.task.count({ where }),
  ]); res.json({ items, total, page: query.page, pageSize: query.pageSize });
});
taskRoutes.get('/workspaces/:workspaceId/tasks/:id', async (req, res) => {
  const workspaceId = param(req, 'workspaceId'); await readMembership(workspaceId, auth(res).user.id);
  const task = await db.task.findFirst({ where: { id: param(req, 'id'), workspaceId }, include });
  if (!task) throw new DomainError(404, 'Tarefa não encontrada.'); res.json(task);
});
taskRoutes.post('/workspaces/:workspaceId/tasks', async (req, res) => {
  const workspaceId = param(req, 'workspaceId'); const input = taskCreateSchema.parse(req.body);
  const dueDate = calendarDate(input.dueDate);
  const task = await withWorkspace(workspaceId, auth(res).user.id, ['OWNER', 'ADMIN', 'MEMBER'], async (tx, actor) => {
    await checkRelations(tx, workspaceId, input.projectId, input.assigneeMembershipId);
    requireCapacity(actor.workspace.plan, 'tasks', await tx.task.count({ where: { workspaceId } }));
    const created = await tx.task.create({ data: { ...input, dueDate, workspaceId }, include });
    await audit(tx, workspaceId, auth(res).user.id, 'TASK_CREATED', 'Tarefa criada', created.id); return created;
  }); res.status(201).json(task);
});
taskRoutes.patch('/workspaces/:workspaceId/tasks/:id', async (req, res) => {
  const workspaceId = param(req, 'workspaceId'); const id = param(req, 'id');
  const { version, ...input } = taskPatchSchema.parse(req.body);
  const task = await withWorkspace(workspaceId, auth(res).user.id, ['OWNER', 'ADMIN', 'MEMBER'], async tx => {
    const current = await tx.task.findFirst({ where: { id, workspaceId } });
    if (!current) throw new DomainError(404, 'Tarefa não encontrada.');
    assertVersion(version, current.version);
    await checkRelations(tx, workspaceId, current.projectId, null);
    await checkRelations(tx, workspaceId, input.projectId ?? current.projectId, input.assigneeMembershipId !== undefined ? input.assigneeMembershipId : current.assigneeMembershipId);
    const updated = await tx.task.update({ where: { id }, data: { ...input, ...(input.dueDate !== undefined ? { dueDate: calendarDate(input.dueDate) } : { dueDate: current.dueDate }), version: { increment: 1 } }, include });
    await audit(tx, workspaceId, auth(res).user.id, 'TASK_UPDATED', 'Tarefa atualizada', id); return updated;
  }); res.json(task);
});
taskRoutes.delete('/workspaces/:workspaceId/tasks/:id', async (req, res) => {
  const workspaceId = param(req, 'workspaceId'); const id = param(req, 'id');
  const { version } = z.object({ version: z.number().int().nonnegative() }).strict().parse(req.body);
  await withWorkspace(workspaceId, auth(res).user.id, ['OWNER', 'ADMIN', 'MEMBER'], async tx => {
    const current = await tx.task.findFirst({ where: { id, workspaceId } });
    if (!current) throw new DomainError(404, 'Tarefa não encontrada.');
    assertVersion(version, current.version);
    await tx.task.delete({ where: { id } });
    await audit(tx, workspaceId, auth(res).user.id, 'TASK_DELETED', 'Tarefa excluída', id);
  }); res.json({ ok: true });
});
