import { test, expect, request as requestFactory, type APIRequestContext } from '@playwright/test';
import { randomUUID } from 'node:crypto';
import { db } from '../../apps/api/src/db.js';
const origin = 'http://127.0.0.1:5175';
const password = 'Only-for-local-E2E-123!';
type Account = { context: APIRequestContext; id: string; userId: string; email: string; csrf: string; memberId: string };
const contexts: APIRequestContext[] = [];
async function account(): Promise<Account> {
  const email = `qa-${randomUUID()}@example.test`;
  const context = await requestFactory.newContext({ baseURL: origin, extraHTTPHeaders: { Origin: origin } }); contexts.push(context);
  const register = await context.post('/api/auth/register', { data: { name: 'QA Teste', workspaceName: 'Equipe de teste', email, password } }); expect(register.status()).toBe(201);
  const session = await (await context.get('/api/auth/session')).json();
  return { context, id: session.workspaces[0].id, memberId: session.workspaces[0].membershipId, userId: session.user.id, csrf: session.csrfToken, email };
}
const headers = (actor: Account) => ({ 'X-CSRF-Token': actor.csrf });
async function project(actor: Account, name = 'Projeto teste') {
  const response = await actor.context.post(`/api/workspaces/${actor.id}/projects`, { headers: headers(actor), data: { name, description: 'Preservar esta descrição', color: 'emerald' } }); expect(response.status()).toBe(201); return response.json();
}
async function verifyEmail(actor: Account) {
  const job = await db.emailJob.findFirstOrThrow({ where: { recipient: actor.email, text: { contains: '/confirmar-email?' } }, orderBy: { createdAt: 'desc' } });
  const token = job.text.match(/confirmar-email\?token=([A-Za-z0-9_-]+)/)?.[1]; expect(token).toBeTruthy();
  const response = await actor.context.post('/api/auth/verify-email', { data: { token } }); expect(response.status()).toBe(200);
}
test.afterEach(async () => { for (const context of contexts.splice(0)) await context.dispose(); });
test.afterAll(async () => { await db.$disconnect(); });
test('isolates reads and writes across workspaces', async () => {
  const a = await account(); const b = await account(); const record = await project(a);
  expect((await b.context.get(`/api/workspaces/${a.id}/projects`)).status()).toBe(404);
  expect((await b.context.patch(`/api/workspaces/${b.id}/projects/${record.id}`, { headers: headers(b), data: { name: 'Tentativa externa' } })).status()).toBe(404);
  expect((await b.context.post(`/api/workspaces/${b.id}/tasks`, { headers: headers(b), data: { title: 'Tarefa externa', projectId: record.id } })).status()).toBe(404);
});
test('requires CSRF and a trusted Origin', async () => {
  const actor = await account(); const url = `/api/workspaces/${actor.id}/projects`;
  expect((await actor.context.post(url, { data: { name: 'Sem CSRF' } })).status()).toBe(403);
  expect((await actor.context.post(url, { headers: { ...headers(actor), Origin: 'https://evil.example.test' }, data: { name: 'Origem externa' } })).status()).toBe(403);
});
test('project quota survives concurrent creation', async () => {
  const actor = await account();
  const responses = await Promise.all([1, 2, 3, 4].map(n => actor.context.post(`/api/workspaces/${actor.id}/projects`, { headers: headers(actor), data: { name: `Projeto concorrente ${n}` } })));
  expect(responses.map(r => r.status()).sort()).toEqual([201, 201, 201, 409]);
});
test('task PATCH preserves fields and rejects stale versions', async () => {
  const actor = await account(); const parent = await project(actor);
  const response = await actor.context.post(`/api/workspaces/${actor.id}/tasks`, { headers: headers(actor), data: { title: 'Tarefa completa', description: 'Não apagar', projectId: parent.id, priority: 'HIGH', dueDate: '2028-02-29', assigneeMembershipId: actor.memberId } }); expect(response.status()).toBe(201);
  const task = await response.json();
  const changed = await actor.context.patch(`/api/workspaces/${actor.id}/tasks/${task.id}`, { headers: headers(actor), data: { status: 'DONE', version: 0 } }); expect(changed.status()).toBe(200);
  expect(await changed.json()).toMatchObject({ status: 'DONE', version: 1, description: 'Não apagar', priority: 'HIGH', assigneeMembershipId: actor.memberId, dueDate: '2028-02-29T00:00:00.000Z' });
  expect((await actor.context.patch(`/api/workspaces/${actor.id}/tasks/${task.id}`, { headers: headers(actor), data: { status: 'TODO', version: 0 } })).status()).toBe(409);
});
test('archiving does not reset description or color', async () => {
  const actor = await account(); const parent = await project(actor);
  const response = await actor.context.patch(`/api/workspaces/${actor.id}/projects/${parent.id}`, { headers: headers(actor), data: { status: 'ARCHIVED' } });
  expect(response.status()).toBe(200); expect(await response.json()).toMatchObject({ description: 'Preservar esta descrição', color: 'emerald', status: 'ARCHIVED' });
});
test('VIEWER cannot create tasks or projects', async () => {
  const owner = await account(); const viewer = await account(); const parent = await project(owner);
  // Fixture setup only; this database must be the dedicated *_e2e database.
  await db.membership.create({ data: { workspaceId: owner.id, userId: viewer.userId, role: 'VIEWER' } });
  expect((await viewer.context.get(`/api/workspaces/${owner.id}/projects`)).status()).toBe(200);
  expect((await viewer.context.post(`/api/workspaces/${owner.id}/tasks`, { headers: headers(viewer), data: { title: 'Sem permissão', projectId: parent.id } })).status()).toBe(403);
  expect((await viewer.context.post(`/api/workspaces/${owner.id}/projects`, { headers: headers(viewer), data: { name: 'Sem permissão' } })).status()).toBe(403);
});
test('invitation belongs to its email and is single use', async () => {
  const owner = await account(); const guest = await account(); const wrong = await account(); await verifyEmail(owner);
  const response = await owner.context.post(`/api/workspaces/${owner.id}/invitations`, { headers: headers(owner), data: { email: guest.email, role: 'MEMBER' } }); expect(response.status()).toBe(201);
  const job = await db.emailJob.findFirstOrThrow({ where: { recipient: guest.email, text: { contains: '/convite?' } }, orderBy: { createdAt: 'desc' } });
  const token = job.text.match(/convite\?token=([A-Za-z0-9_-]+)/)?.[1]; expect(token).toBeTruthy();
  expect((await wrong.context.post('/api/invitations/accept', { headers: headers(wrong), data: { token } })).status()).toBe(403);
  expect((await guest.context.post('/api/invitations/accept', { headers: headers(guest), data: { token } })).status()).toBe(200);
  expect((await guest.context.post('/api/invitations/accept', { headers: headers(guest), data: { token } })).status()).toBe(400);
});
test('logout invalidates the server-side session', async () => {
  const actor = await account();
  expect((await actor.context.post('/api/auth/logout', { headers: headers(actor), data: {} })).status()).toBe(200);
  expect((await actor.context.get('/api/auth/session')).status()).toBe(401);
});
test('billing disabled does not simulate a successful purchase', async () => {
  const actor = await account(); await verifyEmail(actor);
  const response = await actor.context.post(`/api/workspaces/${actor.id}/billing/checkout`, { headers: headers(actor), data: {} });
  expect(response.status()).toBe(503); expect((await response.json()).code).toBe('BILLING_DISABLED');
});
