import { StrictMode, Component, type ReactNode, type ErrorInfo } from 'react';
import { createRoot } from 'react-dom/client';
import { BrowserRouter, Routes, Route, Link } from 'react-router-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Toaster } from 'sonner';
import { ApiError } from './lib/api';
import { SessionProvider, ProtectedLayout } from './lib/session';
import { Shell } from './components/Shell';
import { LandingPage } from './pages/LandingPage';
import { LoginPage, RegisterPage, ForgotPasswordPage, ResetPasswordPage, VerifyEmailPage, InvitationPage } from './pages/AuthPages';
import { DashboardPage } from './pages/DashboardPage';
import { ProjectsPage } from './pages/ProjectsPage';
import { TasksPage } from './pages/TasksPage';
import { TeamPage } from './pages/TeamPage';
import { BillingPage } from './pages/BillingPage';
import { SettingsPage } from './pages/SettingsPage';
import { ActivityPage } from './pages/ActivityPage';
import './styles.css';
class ErrorBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() { return { failed: true }; }
  componentDidCatch(_error: Error, _info: ErrorInfo) { console.error('A interface encontrou um erro inesperado.'); }
  render() { return this.state.failed ? <div className="full-loading"><h1>Algo não saiu como esperado.</h1><button className="button primary" onClick={() => window.location.reload()}>Recarregar aplicação</button></div> : this.props.children; }
}
const client = new QueryClient({ defaultOptions: { queries: { staleTime: 15000, retry: (attempt, error) => !(error instanceof ApiError && error.status < 500) && attempt < 1, refetchOnWindowFocus: true }, mutations: { retry: false } } });
createRoot(document.getElementById('root')!).render(<StrictMode><ErrorBoundary><QueryClientProvider client={client}><BrowserRouter><SessionProvider><Routes>
  <Route path="/" element={<LandingPage />} /><Route path="/entrar" element={<LoginPage />} /><Route path="/criar-conta" element={<RegisterPage />} />
  <Route path="/esqueci-senha" element={<ForgotPasswordPage />} /><Route path="/redefinir-senha" element={<ResetPasswordPage />} /><Route path="/confirmar-email" element={<VerifyEmailPage />} /><Route path="/convite" element={<InvitationPage />} />
  <Route element={<ProtectedLayout />}><Route path="/app" element={<Shell />}><Route index element={<DashboardPage />} /><Route path="projetos" element={<ProjectsPage />} /><Route path="tarefas" element={<TasksPage />} /><Route path="equipe" element={<TeamPage />} /><Route path="billing" element={<BillingPage />} /><Route path="configuracoes" element={<SettingsPage />} /><Route path="atividade" element={<ActivityPage />} /></Route></Route>
  <Route path="*" element={<div className="full-loading"><h1>Essa página não foi encontrada.</h1><Link className="button primary" to="/app">Voltar ao workspace</Link></div>} />
</Routes><Toaster richColors closeButton position="bottom-right" /></SessionProvider></BrowserRouter></QueryClientProvider></ErrorBoundary></StrictMode>);
