import 'dotenv/config';
import { db } from '../apps/api/src/db.js';
import { config } from '../apps/api/src/config.js';
import { hashPassword } from '../apps/api/src/core/security.mjs';
const localHosts = ['localhost', '127.0.0.1', '[::1]'];
if (config.NODE_ENV !== 'development' || !localHosts.includes(new URL(config.DATABASE_URL).hostname)) throw new Error('O seed fictício só pode ser usado em desenvolvimento com banco local.');
const email = process.env.DEMO_EMAIL?.trim().toLowerCase(); const password = process.env.DEMO_PASSWORD;
if (!email || !password) throw new Error('Defina DEMO_EMAIL e DEMO_PASSWORD no .env. Não há credenciais padrão.');
try {
  if (await db.user.findUnique({ where: { email } })) { console.log('A conta já existe. Nenhum dado ou senha foi sobrescrito.'); }
  else {
    const passwordHash = await hashPassword(password);
    await db.$transaction(async tx => {
      const user = await tx.user.create({ data: { name: 'Conta de demonstração', email, passwordHash, emailVerifiedAt: new Date() } });
      const workspace = await tx.workspace.create({ data: { name: 'Estúdio Aurora (exemplo)' } });
      const member = await tx.membership.create({ data: { userId: user.id, workspaceId: workspace.id, role: 'OWNER' } });
      const examples = [
        { name: 'Novo site institucional', description: 'Apresentar a equipe e simplificar o contato com novos clientes.', color: 'violet', tasks: ['Definir objetivos do site', 'Organizar o mapa de páginas', 'Criar a primeira proposta visual', 'Validar os textos com a equipe'] },
        { name: 'Experiência do cliente', description: 'Desenhar uma jornada de atendimento clara e acolhedora.', color: 'emerald', tasks: ['Mapear a jornada atual', 'Ouvir clientes recentes', 'Organizar os principais aprendizados', 'Planejar melhorias do atendimento'] },
        { name: 'Planejamento da equipe', description: 'Transformar prioridades do trimestre em entregas realizáveis.', color: 'blue', tasks: ['Revisar prioridades', 'Definir responsáveis', 'Preparar o encontro de planejamento', 'Documentar decisões'] },
      ];
      let index = 0;
      for (const example of examples) {
        const project = await tx.project.create({ data: { workspaceId: workspace.id, name: example.name, description: example.description, color: example.color } });
        for (const title of example.tasks) {
          const dueDate = new Date(); dueDate.setUTCDate(dueDate.getUTCDate() + index - 3); dueDate.setUTCHours(0, 0, 0, 0);
          await tx.task.create({ data: { title, description: 'Tarefa fictícia para explorar os recursos do produto.', workspaceId: workspace.id, projectId: project.id, assigneeMembershipId: member.id, status: index % 4 === 0 ? 'DONE' : index % 3 === 0 ? 'IN_PROGRESS' : 'TODO', priority: index % 3 === 0 ? 'HIGH' : 'MEDIUM', dueDate } }); index++;
        }
      }
      await tx.auditLog.create({ data: { workspaceId: workspace.id, actorId: user.id, action: 'DEMO_CREATED', summary: 'Dados fictícios de demonstração criados' } });
    });
    console.log('Demonstração criada. Use as credenciais que você definiu no .env.');
  }
} finally { await db.$disconnect(); }
