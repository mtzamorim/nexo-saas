import { app } from './app.js';
import { config } from './config.js';
import { db } from './db.js';
import { startWorker } from './worker.js';
await db.$connect();
const stopWorker = startWorker();
const server = app.listen(config.API_PORT, '0.0.0.0', () => console.log(JSON.stringify({ event: 'server.started', port: config.API_PORT })));
let shuttingDown = false;
async function shutdown() {
  if (shuttingDown) return; shuttingDown = true;
  const force = setTimeout(() => process.exit(1), 30000); force.unref();
  await Promise.all([stopWorker(), new Promise<void>(resolve => server.close(() => resolve()))]);
  await db.$disconnect(); clearTimeout(force); process.exit(0);
}
process.on('SIGTERM', shutdown); process.on('SIGINT', shutdown);
