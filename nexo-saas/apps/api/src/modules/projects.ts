import { Router } from 'express';
import { projectCreateSchema, projectPatchSchema } from './schemas.js';
import { db } from '../db.js';
import { auth } from '../core/auth.js';
import { param } from '../core/http.js';
import { audit, withWorkspace, readMembership } from '../core/tenant.js';
import { DomainError, requireCapacity } from '../domain/policies.mjs';
export const projectRoutes = Router();
projectRoutes.get('/workspaces/:workspaceId/projects', async (req, res) => {
  const workspaceId = param(req, 'workspaceId'); await readMembership(workspaceId, auth(res).user.id);
  const [projects, counts] = await Promise.all([
    db.project.findMany({ where: { workspaceId }, orderBy: [{ status: 'asc' }, { createdAt: 'desc' }], include: { _count: { select: { tasks: true } } } }),
    db.task.groupBy({ by: ['projectId'], where: { workspaceId, status: 'DONE' }, _count: { _all: true } }),
  ]);
  res.json(projects.map(p => ({ ...p, totalTasks: p._count.tasks, doneTasks: counts.find(c => c.projectId === p.id)?._count._all || 0 })));
});
projectRoutes.post('/workspaces/:workspaceId/projects', async (req, res) => {
  const workspaceId = param(req, 'workspaceId'); const input = projectCreateSchema.parse(req.body);
  const result = await withWorkspace(workspaceId, auth(res).user.id, ['OWNER', 'ADMIN'], async (tx, actor) => {
    requireCapacity(actor.workspace.plan, 'projects', await tx.project.count({ where: { workspaceId, status: 'ACTIVE' } }));
    const project = await tx.project.create({ data: { ...input, workspaceId } });
    await audit(tx, workspaceId, auth(res).user.id, 'PROJECT_CREATED', 'Projeto criado', project.id); return project;
  }); res.status(201).json(result);
});
projectRoutes.patch('/workspaces/:workspaceId/projects/:id', async (req, res) => {
  const workspaceId = param(req, 'workspaceId'); const id = param(req, 'id');
  const input = projectPatchSchema.parse(req.body);
  const result = await withWorkspace(workspaceId, auth(res).user.id, ['OWNER', 'ADMIN'], async (tx, actor) => {
    const project = await tx.project.findFirst({ where: { id, workspaceId } });
    if (!project) throw new DomainError(404, 'Projeto não encontrado.');
    if (input.status === 'ACTIVE' && project.status === 'ARCHIVED') requireCapacity(actor.workspace.plan, 'projects', await tx.project.count({ where: { workspaceId, status: 'ACTIVE' } }));
    const updated = await tx.project.update({ where: { id_workspaceId: { id, workspaceId } }, data: input });
    await audit(tx, workspaceId, auth(res).user.id, 'PROJECT_UPDATED', 'Projeto atualizado', id); return updated;
  }); res.json(result);
});
projectRoutes.delete('/workspaces/:workspaceId/projects/:id', async (req, res) => {
  const workspaceId = param(req, 'workspaceId'); const id = param(req, 'id');
  await withWorkspace(workspaceId, auth(res).user.id, ['OWNER', 'ADMIN'], async tx => {
    const deleted = await tx.project.deleteMany({ where: { id, workspaceId } });
    if (deleted.count !== 1) throw new DomainError(404, 'Projeto não encontrado.');
    await audit(tx, workspaceId, auth(res).user.id, 'PROJECT_DELETED', 'Projeto e suas tarefas excluídos', id);
  }); res.json({ ok: true });
});
