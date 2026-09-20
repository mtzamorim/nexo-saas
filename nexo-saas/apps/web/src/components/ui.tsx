import type { ReactNode, ButtonHTMLAttributes } from 'react';
import * as Dialog from '@radix-ui/react-dialog';
import { X, FolderOpen, ChevronLeft, ChevronRight } from 'lucide-react';
import type { Status, Priority } from '../lib/types';
import { statusLabel, priorityLabel, initials } from '../lib/format';
export function Button({ children, variant = 'primary', busy, className = '', disabled, ...props }: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: 'primary' | 'secondary' | 'ghost' | 'danger'; busy?: boolean }) {
  return <button className={`button ${variant} ${className}`} disabled={busy || disabled} {...props}>{busy && <span className="spinner" />}{children}</button>;
}
export function Field({ label, children, hint }: { label: string; children: ReactNode; hint?: string }) { return <label className="field"><span>{label}</span>{children}{hint && <small>{hint}</small>}</label>; }
export function Modal({ open, onOpenChange, title, description, children }: { open: boolean; onOpenChange(open: boolean): void; title: string; description?: string; children: ReactNode }) {
  return <Dialog.Root open={open} onOpenChange={onOpenChange}><Dialog.Portal><Dialog.Overlay className="dialog-overlay" /><Dialog.Content className="dialog-content"><div className="dialog-heading"><div><Dialog.Title>{title}</Dialog.Title><Dialog.Description>{description || 'Preencha os campos abaixo.'}</Dialog.Description></div><Dialog.Close className="icon-button" aria-label="Fechar janela"><X size={20} /></Dialog.Close></div>{children}</Dialog.Content></Dialog.Portal></Dialog.Root>;
}
export function PageHeading({ eyebrow, title, description, children }: { eyebrow?: string; title: string; description: string; children?: ReactNode }) { return <div className="page-heading"><div>{eyebrow && <span className="eyebrow">{eyebrow}</span>}<h1>{title}</h1><p>{description}</p></div>{children}</div>; }
export function EmptyState({ title, description, children }: { title: string; description: string; children?: ReactNode }) { return <div className="empty-state"><div className="empty-icon"><FolderOpen size={28} /></div><h3>{title}</h3><p>{description}</p>{children}</div>; }
export function Loading() { return <div className="loading-block" role="status"><span className="spinner" />Carregando...</div>; }
export function ErrorState({ error, retry }: { error: Error; retry(): unknown }) { return <div className="error-state" role="alert"><h3>Não foi possível carregar.</h3><p>{error.message}</p><Button variant="secondary" onClick={() => retry()}>Tentar novamente</Button></div>; }
export function StatusBadge({ status }: { status: Status }) { return <span className={`badge status-${status}`}><span className="status-dot" />{statusLabel[status]}</span>; }
export function PriorityBadge({ priority }: { priority: Priority }) { return <span className={`priority priority-${priority}`}>{priorityLabel[priority]}</span>; }
export function Avatar({ name, small = false }: { name: string; small?: boolean }) { return <span title={name} className={`avatar ${small ? 'small' : ''}`}>{initials(name)}</span>; }
export function Pagination({ page, total, pageSize, onChange }: { page: number; total: number; pageSize: number; onChange(page: number): void }) {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  return <div className="pagination"><span>{total} registro{total !== 1 ? 's' : ''} · Página {page} de {pages}</span><div><Button variant="secondary" aria-label="Página anterior" disabled={page <= 1} onClick={() => onChange(page - 1)}><ChevronLeft size={16} /></Button><Button variant="secondary" aria-label="Próxima página" disabled={page >= pages} onClick={() => onChange(page + 1)}><ChevronRight size={16} /></Button></div></div>;
}
