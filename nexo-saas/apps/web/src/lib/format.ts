import type { Role, Status, Priority } from './types';
export const roleLabel: Record<Role, string> = { OWNER: 'Proprietário', ADMIN: 'Administrador', MEMBER: 'Integrante', VIEWER: 'Leitor' };
export const statusLabel: Record<Status, string> = { TODO: 'A fazer', IN_PROGRESS: 'Em andamento', DONE: 'Concluída' };
export const priorityLabel: Record<Priority, string> = { LOW: 'Baixa', MEDIUM: 'Média', HIGH: 'Alta' };
export function initials(name: string) { return name.trim().split(/\s+/).slice(0, 2).map(part => part[0]).join('').toUpperCase(); }
// Calendar dates are strings, not timestamps. Never apply timezone conversion.
export function dateOnly(value: string | null) { if (!value) return 'Sem prazo'; const [y, m, d] = value.slice(0, 10).split('-'); return `${d}/${m}/${y}`; }
export function dateTime(value: string) { return new Intl.DateTimeFormat('pt-BR', { dateStyle: 'short', timeStyle: 'short' }).format(new Date(value)); }
