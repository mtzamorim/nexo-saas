import { z } from 'zod';
// PATCH schemas intentionally have NO defaults. In Zod 4 a default nested in
// an optional field can still populate an omitted key, overwriting stored data.
const projectFields = z.strictObject({
  name: z.string().trim().min(2).max(100),
  description: z.string().trim().max(2000),
  color: z.enum(['violet', 'blue', 'emerald', 'amber', 'rose']),
});
export const projectCreateSchema = projectFields.extend({
  description: projectFields.shape.description.default(''),
  color: projectFields.shape.color.default('violet'),
});
export const projectPatchSchema = projectFields.partial().extend({ status: z.enum(['ACTIVE', 'ARCHIVED']).optional() }).refine(v => Object.keys(v).length > 0, 'Informe ao menos um campo.');
const taskFields = z.strictObject({
  title: z.string().trim().min(2).max(160),
  description: z.string().trim().max(5000),
  projectId: z.uuid(),
  assigneeMembershipId: z.uuid().nullable(),
  status: z.enum(['TODO', 'IN_PROGRESS', 'DONE']),
  priority: z.enum(['LOW', 'MEDIUM', 'HIGH']),
  dueDate: z.string().max(10).nullable(),
});
export const taskCreateSchema = taskFields.extend({
  description: taskFields.shape.description.default(''),
  assigneeMembershipId: taskFields.shape.assigneeMembershipId.default(null),
  status: taskFields.shape.status.default('TODO'),
  priority: taskFields.shape.priority.default('MEDIUM'),
  dueDate: taskFields.shape.dueDate.default(null),
});
export const taskPatchSchema = taskFields.partial().extend({ version: z.number().int().nonnegative() }).refine(v => Object.keys(v).length > 1, 'Informe ao menos um campo para atualizar.');
