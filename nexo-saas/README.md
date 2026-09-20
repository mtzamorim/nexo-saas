# Nexo - SaaS de projetos e tarefas

Base de produto com frontend, API, banco de dados, autenticação, equipes e integração de assinatura. Produto de referência: gestão de projetos e tarefas para pequenas equipes. Não utiliza código, dados ou regras internas do SIGIT/SISCON.

> **Estado da entrega:** código-fonte de um MVP, ainda não homologado para produção. Foram executados 57 testes unitários de funções isoladas. Não foi possível instalar as dependências por indisponibilidade de rede neste ambiente. Build, checagem completa de tipos, migrations, integração, interface no navegador, Stripe, SMTP e Docker permanecem pendentes. Leia [VALIDATION](docs/VALIDATION.md).

## Iniciar localmente

Requisitos: Node.js 22.16 ou superior dentro da serie 22, ou Node.js 24; npm; Docker com Compose. Execute tudo na pasta raiz `nexo-saas`.

```bash
npm run setup
docker compose up -d
npm install
npm run db:generate
npm run db:deploy
npm run dev
```

`setup` cria `.env` com senha aleatória para o PostgreSQL local. Não sobrescreve um `.env` existente. Confira se o banco está saudável com `docker compose ps` antes da migration. Não use essas configurações locais em produção.

| Servico | Endereço local |
| --- | --- |
| Interface | http://localhost:5173 |
| Saúde da API e conexão com banco | http://localhost:4000/api/health |
| E-mails locais capturados pelo Mailpit | http://localhost:8025 |

Crie sua conta na interface. Não há credenciais padrão. A senha deve ter entre 12 e 128 caracteres. O cadastro cria uma equipe com você como proprietário. Abra o Mailpit para obter o link de confirmação do e-mail; a mensagem local não será entregue na sua caixa real.

Use exatamente o endereço de `APP_URL`. Trocar `localhost` por `127.0.0.1`, ou acessar pelo IP da rede, exige ajustar essa configuração. A API valida a origem das operações de escrita. O Vite encaminha `/api` ao backend, sem necessidade de CORS neste desenho.

**Instalação reproduzível:** não há `package-lock.json` porque o registro npm não estava acessível. Depois da primeira instalação bem-sucedida, revise as versões resolvidas e os alertas de segurança, versione o lockfile e substitua `npm install` por `npm ci` no Dockerfile e no workflow. As faixas declaradas não representam uma auditoria das dependências.

## O que o código inclui

| Area | Implementacao |
| --- | --- |
| Conta | Cadastro, login, confirmação de e-mail, recuperação de senha e revogação de sessões. |
| Equipes | Multiplos espacos de trabalho, convites por e-mail, papéis e transferência de propriedade. |
| Projetos | Criação, edição, busca, cores, arquivamento, reativação e exclusão. |
| Tarefas | Quadro e lista, filtros, responsável, prioridade, prazo, status e controle de versão para edições concorrentes. |
| Dashboard | Contagens consultadas no banco, tarefas recentes, atrasos e resumo de atividades. |
| Assinatura | Free/Pro, limites no backend, Stripe Checkout, portal do cliente e processamento de webhooks. |
| Operação | Fila persistente de e-mail, tentativas, auditoria, SQL inicial, Dockerfile e workflow de CI. |
| Interface | Landing page, navegação responsiva, formulários e modais compartilhados. |

O quadro altera status por seleção, não por arrastar e soltar. As configurações permitem editar nome e fuso da equipe; os dados do perfil pessoal são somente leitura. A landing page identifica seus dados ilustrativos como exemplo.

### Regras adotadas neste produto de referência

| Plano | Projetos ativos | Vagas da equipe | Tarefas totais |
| --- | ---: | ---: | ---: |
| Free | 3 | 3 | 100 |
| Pro | 30 | 20 | 5.000 |

O proprietário conta como integrante; convites pendentes e válidos reservam vagas. Tarefas arquivadas também contam para a cota. Arquivar não apaga tarefas, mas as retira das listas de trabalho ativo. **Excluir um projeto apaga suas tarefas**, com confirmação na interface. Um downgrade não remove dados: novas criacoes acima dos limites ficam bloqueadas.

OWNER administra propriedade, integrantes e cobrança. ADMIN administra projetos, configurações e convites de MEMBER/VIEWER. MEMBER escreve tarefas e consulta a equipe. VIEWER apenas consulta os recursos de trabalho. O endpoint de criação permite até cinco equipes de propriedade do usuário. Essa restricao de criação não se aplica ao recebimento de propriedade por transferência.

## Estrutura e stack

```text
apps/
  api/
    prisma/            # Schema e migration SQL
    src/
      core/            # Sessoes, HTTP, escopo de equipe e e-mail
      domain/          # Politicas independentes de framework
      modules/         # Auth, equipes, projetos, tarefas e billing
      worker.ts        # Outbox de e-mail e eventos Stripe
      maintenance.ts   # Limpeza e reprocessamento
  web/
    src/
      components/      # Interface compartilhada e layout
      lib/             # HTTP, sessao, tipos e formatadores
      pages/           # Telas do produto
scripts/               # Setup, seed e runner de E2E
tests/                 # Unitarios, schemas e Playwright
docs/                  # Arquitetura, API, publicacao e validacao
```

React 19, TypeScript, Vite, Tailwind CSS 4, Radix Dialog e TanStack Query no frontend. Node.js, Express 5, Zod 4, Prisma 7 com adaptador PostgreSQL, Nodemailer e Stripe no backend. Um único `package.json` organiza as duas aplicacoes, sem dependencia do framework interno de outro projeto. Em produção a API serve também o build estático da interface.

## Dados de demonstração opcionais

Defina `DEMO_EMAIL` e `DEMO_PASSWORD` no `.env`, usando um e-mail ainda não cadastrado:

```bash
npm run db:seed
```

O seed cria a equipe ficticia Estudio Aurora com projetos e tarefas. Não sobrescreve uma conta existente; só funciona em desenvolvimento com banco local. A confirmação do e-mail da conta de demonstração e marcada pelo próprio seed.

## Testes

```bash
npm test
npm run test:schemas
npm run typecheck
npm run build
```

A suíte unitaria usa somente Node.js. Os demais comandos exigem dependências. Para E2E, crie uma vez o banco descartável:

```bash
docker compose exec db createdb -U nexo nexo_e2e
npx playwright install chromium
npm run test:e2e
```

`E2E_DATABASE_URL` vem no `.env` gerado. O runner rejeita nomes de banco sem sufixo `_e2e`, bloqueia ambiente production, usa portas separadas, desativa o worker e esvazia as credenciais Stripe. **Confira o host e as credenciais mesmo assim.** Os cenários criam dados e não os removem automaticamente. Recrie somente o banco descartável quando precisar limpar resultados. O banco do job de CI e temporário.

Há 11 testes de schemas e 11 cenários Playwright incluídos, ainda não executados nesta entrega. Veja `docs/VALIDATION.md` e a saída real dos testes executados em `docs/unit-test-output.txt`.

## Stripe opcional

Sem `STRIPE_*`, a aplicacao opera com o plano Free e retorna indisponibilidade no checkout; **não simula pagamento aprovado**. Para habilitar em sandbox, configure um produto com preço recorrente e o portal do cliente na sua conta. Preencha todas as variáveis:

```dotenv
STRIPE_SECRET_KEY=<chave-de-teste-da-sua-conta>
STRIPE_WEBHOOK_SECRET=<segredo-do-endpoint-ou-listener>
STRIPE_PRICE_PRO=<id-do-preco-recorrente>
```

```bash
stripe login
stripe listen --forward-to localhost:4000/api/billing/webhook
```

Copie o segredo do listener para o `.env` e reinicie a API. Em produção registre o endpoint HTTPS `/api/billing/webhook` para os eventos `checkout.session.completed`, `customer.subscription.created`, `customer.subscription.updated` e `customer.subscription.deleted`. O segredo de produção não e o segredo do listener local.

Somente o proprietário com e-mail confirmado acessa checkout/portal. O preço vem do servidor. O plano e atualizado pelo processamento dos eventos e pela reconciliação com a Stripe, nunca pelo parâmetro de sucesso da URL. Não foi definido um preço comercial: ele será o preço que você configurar na Stripe.

## Documentação adicional

[Arquitetura](docs/ARCHITECTURE.md) | [Contrato HTTP](docs/API.md) | [Publicação e operação](docs/DEPLOYMENT.md) | [Checklist de produção](docs/PRODUCTION-CHECKLIST.md) | [Validação](docs/VALIDATION.md) | [Referências oficiais](docs/REFERENCES.md).

Antes de vender, defina público, problema e diferenciação. Está base resolve parte da infraestrutura e dos fluxos comuns de um SaaS; não comprova demanda comercial, segurança de produção ou adequação regulatória.
