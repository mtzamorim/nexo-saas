import { createContext, useContext, useState, type ReactNode } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Navigate, Outlet, useLocation } from 'react-router-dom';
import { api, ApiError, setCsrf } from './api';
import type { Session, Workspace } from './types';
async function loadSession() {
  try { const value = await api<Session>('/auth/session'); setCsrf(value.csrfToken); return value; }
  catch (error) { if (error instanceof ApiError && error.status === 401) { setCsrf(''); return null; } throw error; }
}
const SessionContext = createContext<{ session: Session | null | undefined; pending: boolean; error: Error | null; refresh(): Promise<unknown> }>({ session: undefined, pending: true, error: null, refresh: async () => {} });
export function SessionProvider({ children }: { children: ReactNode }) {
  const query = useQuery({ queryKey: ['session'], queryFn: loadSession, retry: false, staleTime: 30000 });
  return <SessionContext.Provider value={{ session: query.data, pending: query.isPending, error: query.error, refresh: () => query.refetch() }}>{children}</SessionContext.Provider>;
}
export const useSession = () => useContext(SessionContext);
const WorkspaceContext = createContext<{ workspace: Workspace; select(id: string): void } | null>(null);
export function ProtectedLayout() {
  const { session, pending, error } = useSession(); const location = useLocation();
  const [selected, setSelected] = useState(() => localStorage.getItem('nexo.workspace') || '');
  if (pending) return <div className="full-loading"><span className="spinner" />Conectando seu espaço...</div>;
  if (error) return <div className="full-loading"><h1>Não foi possível conectar.</h1><p>{error.message}</p><button className="button" onClick={() => window.location.reload()}>Tentar novamente</button></div>;
  if (!session) return <Navigate to={`/entrar?next=${encodeURIComponent(location.pathname + location.search)}`} replace />;
  const workspace = session.workspaces.find(w => w.id === selected) || session.workspaces[0];
  if (!workspace) return <div className="full-loading">Sua conta não possui equipes disponíveis. Recarregue a sessão ou aceite um convite.</div>;
  return <WorkspaceContext.Provider value={{ workspace, select: id => { localStorage.setItem('nexo.workspace', id); setSelected(id); } }}><Outlet /></WorkspaceContext.Provider>;
}
export function useWorkspace() { const value = useContext(WorkspaceContext); if (!value) throw new Error('Workspace ausente.'); return value; }
export function useWorkspaceQuery<T>(key: string, suffix: string, query = '', poll = false) {
  const { workspace } = useWorkspace();
  return useQuery({ queryKey: ['workspace', workspace.id, key, query], queryFn: ({ signal }) => api<T>(`/workspaces/${workspace.id}${suffix}${query}`, { signal }), refetchInterval: poll ? 10000 : false });
}
export function useRefreshWorkspace() {
  const client = useQueryClient(); const { workspace } = useWorkspace();
  return async () => { await Promise.all([client.invalidateQueries({ queryKey: ['workspace', workspace.id] }), client.invalidateQueries({ queryKey: ['session'] })]); };
}
export function useWorkspacePath() { const { workspace } = useWorkspace(); return (suffix: string) => `/workspaces/${workspace.id}${suffix}`; }
