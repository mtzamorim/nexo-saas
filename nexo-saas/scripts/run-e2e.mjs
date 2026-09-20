import 'dotenv/config';
import { spawnSync } from 'node:child_process';
const url = process.env.E2E_DATABASE_URL;
if (!url || !new URL(url).pathname.slice(1).endsWith('_e2e')) throw new Error('E2E_DATABASE_URL deve apontar para um banco descartável cujo nome termina em _e2e.');
if (process.env.NODE_ENV === 'production') throw new Error('Os testes E2E não podem rodar com NODE_ENV=production.');
const env = { ...process.env, NODE_ENV: 'test', DATABASE_URL: url, APP_URL: 'http://127.0.0.1:5175', API_PORT: '4010', WEB_PORT: '5175', VITE_API_PROXY_TARGET: 'http://127.0.0.1:4010', WORKER_ENABLED: 'false', STRIPE_SECRET_KEY: '', STRIPE_WEBHOOK_SECRET: '', STRIPE_PRICE_PRO: '' };
for (const args of [['prisma', 'generate'], ['prisma', 'migrate', 'deploy'], ['playwright', 'test']]) {
  const result = spawnSync('npx', args, { stdio: 'inherit', env, shell: process.platform === 'win32' });
  if (result.status !== 0) process.exit(result.status || 1);
}
