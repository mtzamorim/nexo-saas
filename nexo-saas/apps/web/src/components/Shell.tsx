import { useState, type FormEvent } from 'react';
import { NavLink, Outlet, Link, useNavigate } from 'react-router-dom';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { LayoutDashboard, FolderKanban, ListTodo, Users, CreditCard, Settings, Activity, ArrowUpRight, LogOut, Menu, X, Plus, Mail } from 'lucide-react';
import { toast } from 'sonner';
import { api, setCsrf } from '../lib/api';
import { useSession, useWorkspace } from '../lib/session';
import { roleLabel } from '../lib/format';
import { Avatar, Button, Field, Modal } from './ui';
export function Shell() {
  const [menu, setMenu] = useState(false); const [newWorkspace, setNewWorkspace] = useState(false);
  const { session, refresh } = useSession(); const { workspace, select } = useWorkspace(); const navigate = useNavigate(); const client = useQueryClient();
  const logout = useMutation({ mutationFn: () => api('/auth/logout', { method: 'POST' }), onSuccess: async () => { setCsrf(''); client.removeQueries({ queryKey: ['workspace'] }); await refresh(); navigate('/entrar'); }, onError: (error: Error) => toast.error(error.message) });
  const resend = useMutation({ mutationFn: () => api('/auth/resend-verification', { method: 'POST' }), onSuccess: () => toast.success('Confira seu e-mail. A mensagem foi colocada na fila.'), onError: (error: Error) => toast.error(error.message) });
  const create = useMutation({ mutationFn: (name: string) => api<{ id: string }>('/workspaces', { method: 'POST', body: { name } }), onSuccess: async result => { await refresh(); select(result.id); setNewWorkspace(false); navigate('/app'); toast.success('Equipe criada.'); }, onError: (error: Error) => toast.error(error.message) });
  const navigation = [
    { to: '/app', label: 'Visão geral', icon: LayoutDashboard, end: true }, { to: '/app/projetos', label: 'Projetos', icon: FolderKanban },
    { to: '/app/tarefas', label: 'Tarefas', icon: ListTodo }, { to: '/app/equipe', label: 'Equipe', icon: Users },
    ...(['OWNER', 'ADMIN'].includes(workspace.role) ? [{ to: '/app/atividade', label: 'Atividade', icon: Activity }] : []),
  ];
  function submitWorkspace(event: FormEvent<HTMLFormElement>) { event.preventDefault(); create.mutate(String(new FormData(event.currentTarget).get('name'))); }
  return <div className="app-shell">
    {menu && <button className="mobile-overlay" aria-label="Fechar menu" onClick={() => setMenu(false)} />}
    <aside className={`sidebar ${menu ? 'open' : ''}`}>
      <div className="brand-row"><Link className="brand" to="/app"><span className="brand-mark">n</span>nexo<span className="brand-point">.</span></Link><button className="icon-button mobile-only" onClick={() => setMenu(false)} aria-label="Fechar menu"><X size={20} /></button></div>
      <label className="workspace-select"><span className="workspace-monogram">{workspace.name.slice(0, 1).toUpperCase()}</span><div><small>SEU ESPAÇO</small><select aria-label="Equipe ativa" value={workspace.id} onChange={e => select(e.target.value)}>{session?.workspaces.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}</select></div></label>
      <button className="new-workspace" onClick={() => setNewWorkspace(true)}><Plus size={14} /> Criar outra equipe</button>
      <span className="nav-label">WORKSPACE</span>
      <nav className="main-nav">{navigation.map(item => <NavLink key={item.to} end={item.end} to={item.to} onClick={() => setMenu(false)} className={({ isActive }) => isActive ? 'active' : ''}><item.icon size={19} /><span>{item.label}</span></NavLink>)}</nav>
      <div className="sidebar-bottom"><div className="plan-mini"><div><span className="plan-spark">✦</span><strong>Plano {workspace.plan === 'PRO' ? 'Pro' : 'Free'}</strong></div><p>{workspace.plan === 'PRO' ? 'Mais espaço para sua equipe crescer.' : 'Seu próximo projeto começa aqui.'}</p><Link to="/app/billing" onClick={() => setMenu(false)}>Gerenciar plano <ArrowUpRight size={16} /></Link></div><nav className="main-nav"><NavLink to="/app/configuracoes" onClick={() => setMenu(false)}><Settings size={19} />Configurações</NavLink><button onClick={() => logout.mutate()} disabled={logout.isPending}><LogOut size={19} />Sair da conta</button></nav><div className="sidebar-footnote">UM LUGAR PARA FAZER ACONTECER</div></div>
    </aside>
    <div className="app-body"><header className="topbar"><div className="topbar-left"><button className="icon-button mobile-only" aria-label="Abrir menu" onClick={() => setMenu(true)}><Menu size={22} /></button><span className="breadcrumb">Workspace <span>/</span> <strong>{workspace.name}</strong></span></div><div className="profile-chip"><div><strong>{session?.user.name}</strong><small>{roleLabel[workspace.role]}</small></div><Avatar name={session?.user.name || 'Nexo'} /></div></header>
      {!session?.user.emailVerified && <div className="verification-banner"><Mail size={16} /><span>Confirme seu e-mail para convidar pessoas e contratar um plano.</span><button disabled={resend.isPending} onClick={() => resend.mutate()}>Reenviar e-mail</button></div>}
      <main className="page-content" key={workspace.id}><Outlet /></main>
    </div>
    <Modal open={newWorkspace} onOpenChange={setNewWorkspace} title="Uma nova equipe" description="Cada equipe tem seus próprios projetos, integrantes e assinatura."><form onSubmit={submitWorkspace}><Field label="Nome da equipe"><input name="name" required minLength={2} maxLength={80} placeholder="Ex.: Estúdio Aurora" /></Field><div className="dialog-actions"><Button type="button" variant="secondary" onClick={() => setNewWorkspace(false)}>Cancelar</Button><Button busy={create.isPending}>Criar equipe</Button></div></form></Modal>
  </div>;
}
