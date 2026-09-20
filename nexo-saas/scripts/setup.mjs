import { randomBytes } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
if (existsSync('.env')) {
  console.log('.env já existe; nenhuma configuração foi sobrescrita.');
} else {
  const password = randomBytes(24).toString('hex');
  const content = readFileSync('.env.example', 'utf8').replaceAll('__LOCAL_DB_PASSWORD__', password);
  writeFileSync('.env', content, { mode: 0o600 });
  console.log('.env criado com senha aleatória para o PostgreSQL local.');
}
