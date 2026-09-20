import type { Request, Response, NextFunction } from 'express';
import { randomUUID } from 'node:crypto';
import { ZodError, z } from 'zod';
import { DomainError } from '../domain/policies.mjs';
import { appOrigin } from '../config.js';
import { isTrustedOrigin } from './security.mjs';
export const idSchema = z.uuid();
export const pagingSchema = z.object({
  page: z.coerce.number().int().min(1).max(10000).default(1),
  pageSize: z.coerce.number().int().min(1).max(100).default(30),
});
export function param(req: Request, name: string): string { return idSchema.parse(req.params[name]); }
export function requestMetadata(_req: Request, res: Response, next: NextFunction) {
  res.locals.requestId = randomUUID(); res.setHeader('X-Request-Id', res.locals.requestId); next();
}
export function originGuard(req: Request, _res: Response, next: NextFunction) {
  if (!['GET', 'HEAD', 'OPTIONS'].includes(req.method)) {
    if (!isTrustedOrigin(req.get('origin'), appOrigin)) throw new DomainError(403, 'Origem da requisição não permitida.', 'INVALID_ORIGIN');
    if (!req.is('application/json')) throw new DomainError(415, 'Use Content-Type: application/json.');
  }
  next();
}
export function errorHandler(error: unknown, _req: Request, res: Response, _next: NextFunction) {
  if (error instanceof DomainError) { res.status(error.status).json({ message: error.message, code: error.code, requestId: res.locals.requestId }); return; }
  if (error instanceof ZodError) { res.status(400).json({ message: 'Confira os dados informados.', issues: error.issues.map(i => ({ field: i.path.join('.'), message: i.message })) }); return; }
  const code = (error as { code?: string })?.code;
  if (code === 'P2002') { res.status(409).json({ message: 'Já existe um registro com esses dados.' }); return; }
  if (code === 'P2025') { res.status(404).json({ message: 'Registro não encontrado.' }); return; }
  if ((error as { status?: number })?.status === 413) { res.status(413).json({ message: 'Corpo da requisição excede o limite permitido.' }); return; }
  if ((error as { status?: number })?.status === 400) { res.status(400).json({ message: 'JSON inválido.' }); return; }
  console.error(JSON.stringify({ level: 'error', event: 'request.failed', requestId: res.locals.requestId, code: code || 'UNEXPECTED' }));
  res.status(500).json({ message: 'Não foi possível concluir a operação.', requestId: res.locals.requestId });
}
