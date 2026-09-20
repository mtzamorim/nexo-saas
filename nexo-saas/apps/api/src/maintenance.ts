import { db } from './db.js';
const [operation, id] = process.argv.slice(2);
try {
  if (operation) {
    if (!id || !['--retry-email', '--retry-stripe'].includes(operation)) throw new Error('Use --retry-email ID ou --retry-stripe ID. Sem argumentos, executa limpeza e relata falhas.');
    const data = { status: 'PENDING' as const, attempts: 0, availableAt: new Date(), lockedAt: null, leaseId: null, lastError: null };
    const result = operation === '--retry-email' ? await db.emailJob.updateMany({ where: { id, status: 'FAILED' }, data }) : await db.stripeEvent.updateMany({ where: { id, status: 'FAILED' }, data });
    console.log(JSON.stringify({ requeued: result.count }));
  } else {
    const now = new Date();
    const [sessions, tokens, emails, events, failedEmails, failedStripe] = await Promise.all([
      db.session.deleteMany({ where: { expiresAt: { lt: now } } }),
      db.authToken.deleteMany({ where: { expiresAt: { lt: now } } }),
      db.emailJob.deleteMany({ where: { status: { in: ['DONE', 'FAILED'] }, createdAt: { lt: new Date(Date.now() - 14 * 86400000) } } }),
      db.stripeEvent.deleteMany({ where: { status: 'DONE', createdAt: { lt: new Date(Date.now() - 90 * 86400000) } } }),
      db.emailJob.count({ where: { status: 'FAILED' } }), db.stripeEvent.count({ where: { status: 'FAILED' } }),
    ]);
    console.log(JSON.stringify({ deleted: { sessions: sessions.count, tokens: tokens.count, emails: emails.count, events: events.count }, failedEmails, failedStripe }, null, 2));
  }
} finally { await db.$disconnect(); }
