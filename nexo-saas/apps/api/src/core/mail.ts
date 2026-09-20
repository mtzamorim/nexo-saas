import nodemailer from 'nodemailer';
import { config } from '../config.js';
import type { Transaction } from './tenant.js';
export async function queueEmail(tx: Transaction, recipient: string, subject: string, text: string) {
  await tx.emailJob.create({ data: { recipient, subject, text } });
}
export const mailer = nodemailer.createTransport({
  host: config.SMTP_HOST, port: config.SMTP_PORT, secure: config.SMTP_SECURE,
  requireTLS: config.NODE_ENV === 'production' && !config.SMTP_SECURE,
  auth: config.SMTP_USER ? { user: config.SMTP_USER, pass: config.SMTP_PASS } : undefined,
  pool: true, maxConnections: 1, maxMessages: 50,
  connectionTimeout: 8000, greetingTimeout: 8000, socketTimeout: 15000,
});
