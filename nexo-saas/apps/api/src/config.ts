import 'dotenv/config';
import { z } from 'zod';
const optional = z.string().optional().transform(value => value?.trim() || undefined);
const schema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  APP_URL: z.url().default('http://localhost:5173'),
  API_PORT: z.coerce.number().int().min(1).max(65535).default(4000),
  DATABASE_URL: z.string().min(1),
  TRUST_PROXY_HOPS: z.coerce.number().int().min(0).max(5).default(0),
  SMTP_HOST: z.string().min(1).default('localhost'),
  SMTP_PORT: z.coerce.number().int().min(1).max(65535).default(1025),
  SMTP_SECURE: z.enum(['true', 'false']).default('false').transform(v => v === 'true'),
  SMTP_USER: optional, SMTP_PASS: optional,
  MAIL_FROM: z.string().default('Nexo <no-reply@nexo.local>'),
  WORKER_ENABLED: z.enum(['true', 'false']).default('true').transform(v => v === 'true'),
  STRIPE_SECRET_KEY: optional, STRIPE_WEBHOOK_SECRET: optional, STRIPE_PRICE_PRO: optional,
});
export const config = schema.parse(process.env);
export const production = config.NODE_ENV === 'production';
if (new URL(config.APP_URL).pathname !== '/' || new URL(config.APP_URL).search || new URL(config.APP_URL).hash) throw new Error('APP_URL deve conter somente a origem, sem caminho, query ou fragmento.');
if (production && new URL(config.APP_URL).protocol !== 'https:') throw new Error('APP_URL deve usar HTTPS em produção.');
if (production && (!config.SMTP_USER || !config.SMTP_PASS)) throw new Error('Configure SMTP autenticado em produção.');
const stripeParts = [config.STRIPE_SECRET_KEY, config.STRIPE_WEBHOOK_SECRET, config.STRIPE_PRICE_PRO];
if (stripeParts.some(Boolean) && !stripeParts.every(Boolean)) throw new Error('Configure as três variáveis STRIPE_* ou deixe todas vazias.');
export const stripeEnabled = stripeParts.every(Boolean);
export const appOrigin = new URL(config.APP_URL).origin;
