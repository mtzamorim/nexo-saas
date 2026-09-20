import express from 'express';
import cookieParser from 'cookie-parser';
import helmet from 'helmet';
import { rateLimit } from 'express-rate-limit';
import { resolve } from 'node:path';
import { config, production } from './config.js';
import { db } from './db.js';
import { requestMetadata, originGuard, errorHandler } from './core/http.js';
import { requireAuth, requireCsrf } from './core/auth.js';
import { authRoutes } from './modules/auth.js';
import { workspaceRoutes } from './modules/workspaces.js';
import { projectRoutes } from './modules/projects.js';
import { taskRoutes } from './modules/tasks.js';
import { billingRoutes, stripeWebhook } from './modules/billing.js';
export const app = express();
app.disable('x-powered-by');
app.set('trust proxy', config.TRUST_PROXY_HOPS || false);
app.use(helmet({ contentSecurityPolicy: production ? undefined : false, strictTransportSecurity: production ? undefined : false }));
app.use(requestMetadata);
// Raw body BEFORE express.json is required for Stripe signature verification.
app.post('/api/billing/webhook', express.raw({ type: 'application/json', limit: '512kb' }), stripeWebhook);
app.use('/api', (_req, res, next) => { res.setHeader('Cache-Control', 'no-store'); next(); });
app.use('/api', rateLimit({ windowMs: 60000, limit: 300, standardHeaders: 'draft-8', legacyHeaders: false, message: { message: 'Limite de requisições atingido. Aguarde um pouco.' } }));
app.use(express.json({ limit: '64kb' }), cookieParser());
app.get('/api/health', async (_req, res) => { await db.$queryRaw`SELECT 1`; res.json({ status: 'ok' }); });
app.use('/api', originGuard);
app.use('/api/auth', authRoutes);
app.use('/api', requireAuth, requireCsrf, workspaceRoutes, projectRoutes, taskRoutes, billingRoutes);
app.use('/api', (_req, res) => { res.status(404).json({ message: 'Rota não encontrada.' }); });
if (production) {
  app.use(express.static(resolve('build/web'), { index: false, maxAge: '1h' }));
  app.get('/{*path}', (_req, res) => { res.setHeader('Cache-Control', 'no-cache'); res.sendFile(resolve('build/web/index.html')); });
}
app.use(errorHandler);
