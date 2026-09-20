/** Domain rules are dependency-free and exercised with node:test. */
export class DomainError extends Error {
  /** @param {number} status @param {string} message @param {string} [code] */
  constructor(status, message, code = 'DOMAIN_ERROR') {
    super(message); this.name = 'DomainError'; this.status = status; this.code = code;
  }
}
export const PLANS = Object.freeze({
  FREE: Object.freeze({ name: 'Free', projects: 3, members: 3, tasks: 100 }),
  PRO: Object.freeze({ name: 'Pro', projects: 30, members: 20, tasks: 5000 }),
});
export const ROLES = Object.freeze(['OWNER', 'ADMIN', 'MEMBER', 'VIEWER']);
/** @param {string} role @param {string[]} allowed */
export function requireRole(role, allowed) {
  if (!ROLES.includes(role) || !allowed.includes(role)) throw new DomainError(403, 'Você não tem permissão para esta ação.', 'FORBIDDEN');
}
/** @param {{workspaceId:string}|null|undefined} resource @param {string} workspaceId */
export function assertTenant(resource, workspaceId) {
  if (!resource || resource.workspaceId !== workspaceId) throw new DomainError(404, 'Registro não encontrado.', 'NOT_FOUND');
}
/** @param {string} plan @param {'projects'|'members'|'tasks'} resource @param {number} used @param {number} [additional] */
export function requireCapacity(plan, resource, used, additional = 1) {
  const limits = plan === 'PRO' ? PLANS.PRO : PLANS.FREE;
  if (!Number.isSafeInteger(used) || used < 0 || !Number.isSafeInteger(additional) || additional < 1) throw new DomainError(400, 'Contagem inválida.');
  if (used + additional > limits[resource]) throw new DomainError(409, `Limite do plano ${limits.name} atingido. Libere espaço ou altere o plano.`, 'PLAN_LIMIT');
}
/** @param {string} actorRole @param {string} targetRole @param {string} nextRole @param {boolean} self */
export function assertRoleChange(actorRole, targetRole, nextRole, self) {
  requireRole(actorRole, ['OWNER']);
  if (self || targetRole === 'OWNER' || !['ADMIN', 'MEMBER', 'VIEWER'].includes(nextRole)) throw new DomainError(400, 'Use a transferência de propriedade para alterar o proprietário.');
}
/** Parse calendar dates without timezone shifts or silent day rollover. @param {string|null|undefined} value */
export function calendarDate(value) {
  if (value == null || value === '') return null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new DomainError(400, 'Data deve estar no formato AAAA-MM-DD.');
  const date = new Date(`${value}T00:00:00.000Z`);
  if (!Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== value || Number(value.slice(0, 4)) < 1900) throw new DomainError(400, 'Data inválida.');
  return date;
}
/** @param {string} status @param {boolean} hasConfiguredPrice */
export function subscriptionPlan(status, hasConfiguredPrice) {
  return hasConfiguredPrice && ['active', 'trialing'].includes(status) ? 'PRO' : 'FREE';
}
/** @param {number} expected @param {number} actual */
export function assertVersion(expected, actual) {
  if (expected !== actual) throw new DomainError(409, 'Este registro foi alterado. Atualize a página e tente novamente.', 'STALE_VERSION');
}
/** @param {string} invitationEmail @param {string} userEmail */
export function assertInvitationEmail(invitationEmail, userEmail) {
  if (invitationEmail.trim().toLowerCase() !== userEmail.trim().toLowerCase()) throw new DomainError(403, 'Entre com o e-mail que recebeu o convite.');
}
