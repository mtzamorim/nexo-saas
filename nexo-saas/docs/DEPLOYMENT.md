# Publicação e operação

**Nenhum deploy foi feito nesta entrega.** Dockerfile e workflow estão incluídos como infraestrutura a validar, não como comprovacao de que a imagem foi compilada ou publicada.

## Antes da imagem

Instale dependências, revise/audite as versões, gere e versione o lockfile. Execute os testes, Prisma validate, typecheck, migrations em banco descartável e build. Troque npm install por npm ci no Dockerfile/workflow após incluir o lockfile. Fixe imagens por digest no ambiente de produção. O compose fornecido e somente de desenvolvimento, com PostgreSQL e Mailpit; Mailpit não e um servico de envio de e-mail de produção.

## Configuração externa

Use um arquivo protegido `.env.production` ou um gestor de segredos. Esse arquivo não está no pacote e não deve ser commitado. Configure NODE_ENV=production, APP_URL com a origem HTTPS exata, DATABASE_URL, SMTP autenticado, remetente validado e WORKER_ENABLED=true. Configure todas as tres variáveis Stripe ou deixe todas vazias.

Use TLS nas conexões externas ao banco e SMTP. O transporte exige autenticação SMTP em produção; SMTP_SECURE=true atende conexões TLS imediatas, normalmente na porta 465. Para STARTTLS use a configuração adequada ao seu provedor. Configure o dominio remetente e valide a entrega real. Não use Mailpit para dados de clientes.

O servidor exposto ao navegador deve oferecer HTTPS. O backend pode permanecer na rede interna atras de um proxy. Configure TRUST_PROXY_HOPS somente para a topologia real, sem permitir acesso que ignore o proxy confiavel. O rate limit desta base usa memoria do processo; antes de replicas, adote armazenamento compartilhado e revise o tratamento do IP de origem.

## Sequencia de deploy sugerida, ainda não executada

```bash
docker build -t nexo-saas:0.1.0 .
# Execute migration uma vez, com acesso ao banco correto:
docker run --rm --env-file .env.production nexo-saas:0.1.0 npx prisma migrate deploy
# Inicie atras de um proxy HTTPS:
docker run -d --name nexo --restart unless-stopped --env-file .env.production -p 127.0.0.1:4000:4000 nexo-saas:0.1.0
```

Dentro do container, localhost não aponta para o PostgreSQL do host. DATABASE_URL deve usar um endereço acessível pela rede do container. Defina a rede e DNS conforme sua infraestrutura. A API serve os assets de `build/web`; o processo de build depende de internet para instalar pacotes, mas não deve precisar de um banco com dados de produção.

Migrations não são executadas automaticamente no boot do servidor. A migration inicial SQL foi escrita junto do schema, mas ainda não foi aplicada aqui. Confira ambos com `npx prisma validate`, `npm run db:deploy` e testes em banco descartável. Em produção, revise o SQL, faca backup e planeje restauração antes de mudar schema. Não use migrate dev, migrate reset ou db push no banco de clientes.

## Worker, falhas e retenção

O worker roda junto da API e usa leases persistidas para reivindicar jobs. Existe recuperação de processamento abandonado e limite de seis tentativas. Isso não substitui alertas e um processo de atendimento a falhas. Mensagens SMTP podem ser duplicadas após queda entre envio e confirmação no banco.

No código-fonte instalado:

```bash
npm run maintenance
npm run maintenance -- --retry-email <id-do-job>
npm run maintenance -- --retry-stripe <id-do-evento>
```

Na imagem compilada:

```bash
docker exec nexo node build/api/maintenance.js
docker exec nexo node build/api/maintenance.js --retry-stripe <id-do-evento>
```

Sem argumentos, a manutencao remove sessões/tokens expirados, e-mails DONE/FAILED com mais de 14 dias e eventos Stripe DONE com mais de 90 dias. Também relata contagens de falhas. **A limpeza não possui agendamento automatico.** Defina frequencia e retenção coerentes com o negocio; investigue falhas antes de remove-las. Para links já expirados, gere novo convite ou nova recuperação em vez de reenviar um e-mail antigo.

Auditoria de negocio não possui politica automatica de expurgo. O log HTTP registra requestId e código generico de falha, não o payload. Configure o proxy e observabilidade para não gravar cookies, senhas, tokens de links ou query strings sensiveis. Restrinja o acesso aos logs.

## Homologacao de billing

Teste o ciclo real em sandbox: checkout, repetição de clique, webhook duplicado/fora de ordem, assinatura ativa, trial, falha de pagamento, cancelamento, reativação, downgrade acima da cota e retorno do portal. Teste queda do banco, timeout Stripe, worker desligado e recuperação posterior. A politica atual libera Pro apenas para active/trialing com o preço configurado; ajuste a politica comercial antes de vender.

Configure eventos de assinatura e checkout com payload snapshot compativel com o SDK instalado. Não use o recebimento isolado de um evento sintetico como prova de conciliacao correta. Verifique o estado no provedor e no banco da mesma equipe.
