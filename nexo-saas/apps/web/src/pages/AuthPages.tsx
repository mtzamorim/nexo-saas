import { useState, type FormEvent, type ReactNode } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { ArrowRight, Check, Layers, ShieldCheck } from 'lucide-react';
import { api } from '../lib/api';
import { useSession } from '../lib/session';
import { Button, Field } from '../components/ui';
function AuthFrame({ title, description, children }: { title: string; description: string; children: ReactNode }) {
  return <div className="auth-layout"><aside className="auth-story"><Link to="/" className="brand light"><span className="brand-mark">n</span>nexo.</Link><div><span className="eyebrow">CLAREZA PARA IR ALÉM</span><h1>Boas ideias.<br />Grandes entregas.<br /><em>Um só lugar.</em></h1><p>Conecte as pessoas certas ao que precisa ser feito. Sem perder de vista o próximo passo.</p><div className="auth-benefits"><span><Layers size={19} />Projetos e tarefas conectados</span><span><ShieldCheck size={19} />Espaços separados por equipe</span></div></div><small>Organize o trabalho. Abra espaço para criar.</small></aside><main className="auth-main"><div className="auth-card"><Link to="/" className="auth-back">← Voltar ao início</Link><h1>{title}</h1><p className="muted">{description}</p>{children}</div></main></div>;
}
function safeNext(value: string | null) {
  if (!value?.startsWith('/') || /[\\\u0000-\u001f\u007f]/.test(value)) return '/app';
  try {
    const next = new URL(value, 'https://nexo.invalid');
    const allowed = next.pathname === '/app' || next.pathname.startsWith('/app/') || next.pathname === '/convite';
    return next.origin === 'https://nexo.invalid' && allowed ? `${next.pathname}${next.search}${next.hash}` : '/app';
  } catch { return '/app'; }
}
export function LoginPage() {
  const navigate = useNavigate(); const { refresh } = useSession(); const [search] = useSearchParams(); const client = useQueryClient();
  const login = useMutation({ mutationFn: (body: unknown) => api('/auth/login', { method: 'POST', body }), onSuccess: async () => { client.removeQueries({ queryKey: ['workspace'] }); await refresh(); navigate(safeNext(search.get('next'))); } });
  function submit(event: FormEvent<HTMLFormElement>) { event.preventDefault(); const data = new FormData(event.currentTarget); login.mutate({ email: data.get('email'), password: data.get('password') }); }
  return <AuthFrame title="Bom ter você de volta." description="Entre para continuar de onde parou."><form onSubmit={submit}><Field label="E-mail"><input type="email" name="email" autoComplete="username" required maxLength={254} placeholder="voce@empresa.com" /></Field><Field label="Senha"><input type="password" name="password" autoComplete="current-password" required maxLength={128} /></Field><div className="form-link"><Link to="/esqueci-senha">Esqueci minha senha</Link></div>{login.error && <p role="alert" className="form-error">{login.error.message}</p>}<Button className="full-width" busy={login.isPending}>Entrar no Nexo <ArrowRight size={17} /></Button></form><p className="auth-switch">Ainda não tem conta? <Link to={`/criar-conta${search.get('next') ? `?next=${encodeURIComponent(safeNext(search.get('next')))}` : ''}`}>Comece grátis</Link></p></AuthFrame>;
}
export function RegisterPage() {
  const navigate = useNavigate(); const { refresh } = useSession(); const [search] = useSearchParams(); const client = useQueryClient();
  const register = useMutation({ mutationFn: (body: unknown) => api('/auth/register', { method: 'POST', body }), onSuccess: async () => { client.removeQueries({ queryKey: ['workspace'] }); await refresh(); navigate(safeNext(search.get('next'))); } });
  function submit(event: FormEvent<HTMLFormElement>) { event.preventDefault(); register.mutate(Object.fromEntries(new FormData(event.currentTarget))); }
  return <AuthFrame title="Seu próximo capítulo." description="Crie sua conta e organize seu primeiro projeto."><form onSubmit={submit}><Field label="Seu nome"><input name="name" autoComplete="name" required minLength={2} maxLength={80} placeholder="Como podemos chamar você?" /></Field><Field label="Nome da equipe"><input name="workspaceName" required minLength={2} maxLength={80} placeholder="Ex.: Estúdio Aurora" /></Field><Field label="E-mail"><input name="email" type="email" autoComplete="email" required maxLength={254} placeholder="voce@empresa.com" /></Field><Field label="Senha" hint="Use entre 12 e 128 caracteres. Frases longas também funcionam."><input name="password" type="password" autoComplete="new-password" required minLength={12} maxLength={128} /></Field>{register.error && <p role="alert" className="form-error">{register.error.message}</p>}<Button className="full-width" busy={register.isPending}>Criar conta gratuita <ArrowRight size={17} /></Button></form><p className="auth-switch">Já tem uma conta? <Link to={`/entrar${search.get('next') ? `?next=${encodeURIComponent(safeNext(search.get('next')))}` : ''}`}>Entrar</Link></p></AuthFrame>;
}
export function ForgotPasswordPage() {
  const request = useMutation({ mutationFn: (email: string) => api<{ message: string }>('/auth/forgot-password', { method: 'POST', body: { email } }) });
  return <AuthFrame title="Vamos recuperar seu acesso." description="Enviaremos um link para redefinir sua senha.">{request.isSuccess ? <div className="success-box">{request.data.message}</div> : <form onSubmit={e => { e.preventDefault(); request.mutate(String(new FormData(e.currentTarget).get('email'))); }}><Field label="E-mail da conta"><input name="email" type="email" autoComplete="email" required /></Field>{request.error && <p className="form-error" role="alert">{request.error.message}</p>}<Button busy={request.isPending} className="full-width">Enviar instruções</Button></form>}<p className="auth-switch"><Link to="/entrar">Voltar para o login</Link></p></AuthFrame>;
}
export function ResetPasswordPage() {
  const [search] = useSearchParams(); const { refresh } = useSession(); const token = search.get('token');
  const reset = useMutation({ mutationFn: (password: string) => api('/auth/reset-password', { method: 'POST', body: { token, password } }), onSuccess: () => refresh() });
  return <AuthFrame title="Uma nova senha." description="Escolha uma senha longa que você ainda não usa em outros serviços.">{reset.isSuccess ? <div className="success-box"><Check /> Senha atualizada. <Link to="/entrar">Entrar novamente</Link></div> : <form onSubmit={e => { e.preventDefault(); reset.mutate(String(new FormData(e.currentTarget).get('password'))); }}><Field label="Nova senha"><input type="password" name="password" required minLength={12} maxLength={128} autoComplete="new-password" /></Field>{reset.error && <p className="form-error" role="alert">{reset.error.message}</p>}<Button disabled={!token} busy={reset.isPending}>Redefinir senha</Button>{!token && <p className="form-error">O link está incompleto.</p>}</form>}</AuthFrame>;
}
export function VerifyEmailPage() {
  const [search] = useSearchParams(); const { refresh } = useSession();
  const verify = useMutation({ mutationFn: () => api('/auth/verify-email', { method: 'POST', body: { token: search.get('token') } }), onSuccess: () => refresh() });
  return <AuthFrame title="Confirme seu e-mail." description="Este passo libera convites e a contratação de planos.">{verify.isSuccess ? <div className="success-box">E-mail confirmado. <Link to="/app">Ir para o workspace</Link></div> : <><Button disabled={!search.get('token')} busy={verify.isPending} onClick={() => verify.mutate()}>Confirmar meu e-mail</Button>{verify.error && <p role="alert" className="form-error">{verify.error.message}</p>}</>}</AuthFrame>;
}
export function InvitationPage() {
  const [search] = useSearchParams(); const token = search.get('token'); const { session, pending, refresh } = useSession(); const navigate = useNavigate();
  const [accepted, setAccepted] = useState(false);
  const accept = useMutation({ mutationFn: () => api<{ workspaceId: string }>('/invitations/accept', { method: 'POST', body: { token } }), onSuccess: async data => { localStorage.setItem('nexo.workspace', data.workspaceId); await refresh(); setAccepted(true); navigate('/app'); } });
  const next = encodeURIComponent(`/convite?token=${encodeURIComponent(token || '')}`);
  return <AuthFrame title="Vamos trabalhar juntos?" description="Aceite seu convite e faça parte de uma equipe.">{pending ? <p>Verificando sua sessão...</p> : !session ? <><p>Entre ou crie uma conta com o e-mail que recebeu o convite.</p><Link className="button primary full-width" to={`/entrar?next=${next}`}>Entrar para aceitar</Link><p className="auth-switch"><Link to={`/criar-conta?next=${next}`}>Criar minha conta</Link></p></> : <><p>Você está conectado como <strong>{session.user.email}</strong>.</p><Button disabled={!token || accepted} busy={accept.isPending} onClick={() => accept.mutate()}>Aceitar convite</Button>{accept.error && <p className="form-error" role="alert">{accept.error.message}</p>}</>}</AuthFrame>;
}
