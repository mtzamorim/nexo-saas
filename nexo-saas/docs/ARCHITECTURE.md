# Arquitetura e decisões

## Limites da entrega

Monolito modular com interface separada no desenvolvimento e servida pela API em produção. A escolha reduz componentes de operação para o MVP. Não representa escala ou segurança demonstradas por teste de carga. Os módulos utilizam Prisma diretamente dentro da fronteira transacional; não foi criada uma camada de repositorios que apenas repetisse o cliente ORM.

## Identidade e sessão

Sessões aleatorias de 32 bytes são enviadas por cookie HttpOnly, SameSite=Lax e Secure em produção. O cookie de produção usa prefixo `__Host-`. O banco guarda o SHA-256 do token de sessão. A validade absoluta e de 14 dias, com expiração após 24 horas sem atividade; a última atividade e atualizada em intervalos de cinco minutos.

As senhas usam scrypt assincrono do Node com salt aleatorio, N=32768, r=8 e p=3. O formato inclui os parametros. Não foi introduzido um algoritmo de hash próprio. O login executa a verificacao de um hash fictício para e-mails inexistentes. Isso não certifica resistencia a todos os canais laterais; o cadastro ainda pode revelar duplicação de e-mail por resposta de conflito.

Escritas exigem origem exata e JSON. Escritas autenticadas exigem também `X-CSRF-Token`, obtido em `/api/auth/session`. O token de sessão não e salvo em localStorage. No navegador, localStorage guarda somente a escolha de equipe, validada novamente contra as memberships da sessão.

Recuperação de senha e confirmação de e-mail usam tokens de uso único, com hash persistido, expiração e consumo transacional. Reset revoga as sessões. Bloqueios por usuário serializam emissao/consumo e criação de sessão contra alteracao de senha. O processo de entrega de e-mail precisa conter o link original: o texto da outbox inclui esse segredo até o envio, quando e limpo. Restrinja acesso ao banco, criptografe armazenamento/backups e aplique retenção. Não considere o hash do AuthToken proteção para uma copia integral da outbox pendente.

## Isolamento de equipes

A membership e consultada no backend, e não inferida de um identificador enviado pelo cliente. Consultas de trabalho incluem `workspaceId`. Mutacoes passam por `withWorkspace`, que bloqueia a equipe com `SELECT ... FOR UPDATE`, rele a membership e aplica o papel permitido dentro da mesma transação.

FKs compostas ligam Task a Project e a Membership usando também workspaceId. Isso impede, no banco, associar uma tarefa ao projeto ou responsável de outra equipe. O papel VIEWER não pode receber atribuicoes. As permissões são de equipe, não por tarefa: um MEMBER pode alterar tarefas de outros integrantes da mesma equipe.

Não há PostgreSQL Row Level Security nesta versão. O isolamento depende da aplicacao, das FKs e das credenciais restritas de acesso ao banco. Os cenários HTTP de isolamento estão escritos, mas ainda precisam ser executados.

## Concorrência e capacidade

O bloqueio por equipe serializa criacoes e alteracoes críticas, mantendo a contagem de limites junto da gravacao. E uma escolha simples para este tamanho de produto; pode se tornar gargalo em equipes muito ativas.

Tarefas incluem `version`. PATCH e DELETE exigem a versão conhecida pelo cliente e retornam 409 em conflito. Projetos e configurações não possuem esse controle otimista: alteracoes completas concorrentes podem seguir a regra de última gravacao. PATCH de projetos e tarefas possui schema sem defaults, separado do cadastro, para não sobrescrever campos omitidos.

As cotas são exemplificativas: Free 3 projetos ativos/3 vagas/100 tarefas; Pro 30/20/5000. Convites pendentes reservam vagas. Projetos arquivados liberam cota de projetos ativos, mas suas tarefas continuam na cota total. Downgrade preserva dados. Restricoes de capacidade não equivalem a armazenamento ilimitado nem a um plano comercial validado.

## Datas

Prazos são datas de calendario, recebidas como `AAAA-MM-DD`, validadas contra dias impossiveis e persistidas como PostgreSQL DATE. O cliente formata a parte de data, sem converter o prazo para horario local. Timestamps de auditoria são instantes; o calculo de atraso do dashboard usa a data atual no fuso da equipe.

## E-mail e eventos Stripe

A outbox grava a solicitação de e-mail na transação do negocio. O worker reivindica jobs com lease, tenta novamente com espera progressiva e registra falha após seis tentativas. A entrega e pelo menos uma vez: uma queda após o SMTP aceitar a mensagem pode causar duplicação. O Message-ID estavel auxilia rastreio, mas não garante deduplicacao pelo provedor.

O endpoint Stripe valida assinatura sobre o corpo bruto, persiste o ID do evento com chave unica e responde depois da persistencia. O worker consulta as assinaturas atuais do cliente conhecido no banco; não confia no redirecionamento do navegador para liberar o plano. Somente assinatura active/trialing com o preço configurado concede Pro. Demais estados reduzem para Free, sem apagar dados. Essa politica de acesso, inclusive para inadimplencia, precisa de decisao comercial antes de cobrar clientes.

A reconciliação periodica enfileira clientes sem sincronizacao recente. Existe reprocessamento operacional de falhas. Chamadas Stripe ocorrem dentro de algumas transações com lock e timeout: esse compromisso simplifica serializacao/idempotencia, mas precisa de testes de latencia e falha. Para maior volume, evolua para comandos persistidos e efeitos externos fora de locks longos.

## Interface e manutencao

TanStack Query agrupa chaves por workspace; troca de equipe reinicia o estado local das páginas e evita reaproveitar cache de outra equipe. Modais, botoes, campos, erros, paginacao e formatadores são compartilhados. Radix Dialog fornece a estrutura de foco dos modais, sem substituir uma auditoria de acessibilidade.

A lista/quadro mostra uma página por vez, com aviso quando representa apenas parte do total. Não há atualização websocket. O painel de billing consulta periodicamente o servidor. Sem build e renderizacao executados, o layout e o comportamento visual ainda precisam de verificacao real.
