# Contrato HTTP resumido

Base: `/api`. A interface e a API compartilham origem por proxy no desenvolvimento e pelo mesmo servidor em produção. Não há autenticação por API key publica nesta versão.

## Protocolo

Toda escrita, inclusive DELETE, exige `Origin` igual a `APP_URL` e `Content-Type: application/json`. Operações sem campos usam `{}`. Escritas autenticadas exigem cookie de sessão e `X-CSRF-Token`, retornado por `GET /api/auth/session`. O webhook Stripe e a excecao: usa corpo bruto e `Stripe-Signature`, sem cookie, Origin ou CSRF de usuário.

Erros usam `{ "message": "..." }`, podendo incluir `code`, `requestId` ou `issues`. Codigos principais: 400 dados inválidos; 401 sessão ausente/expirada; 403 permissao, origem ou CSRF; 404 recurso inacessivel/inexistente; 409 conflito, cota ou versão; 413 corpo excessivo; 429 limite de requisições; 503 billing desabilitado. Não exponha mensagens internas de banco ao usuário.

Paginacao de tarefas e auditoria: `page=1&pageSize=30`, com pageSize de 1 a 100. Retorno `{ items, total, page, pageSize }`. A lista de projetos não e paginada nesta base.

## Conta

| Metodo e caminho | Contrato |
| --- | --- |
| POST `/auth/register` | name, email, password, workspaceName; cria conta/equipe/sessão. |
| POST `/auth/login` | email, password; cria sessão. |
| POST `/auth/forgot-password` | email; resposta generica. |
| POST `/auth/reset-password` | token, password; revoga sessões. |
| POST `/auth/verify-email` | token; consumo de uso único. |
| GET `/auth/session` | Usuário público, workspaces e csrfToken. |
| POST `/auth/logout` | Revoga a sessão atual. |
| POST `/auth/logout-all` | Revoga sessões do usuário. |
| POST `/auth/resend-verification` | Reemite confirmação para usuário autenticado. |

## Equipes

Use `W=/workspaces/:workspaceId` como abreviacao apenas nesta tabela.

| Metodo e caminho | Permissao e campos |
| --- | --- |
| POST `/workspaces` | Usuário autenticado; name. |
| PATCH `W` | OWNER/ADMIN; name e timeZone obrigatorios. |
| GET `W/dashboard` | Qualquer integrante; inclui resumo recente de atividades. |
| GET `W/members` | Qualquer integrante; convites pendentes somente para OWNER/ADMIN. |
| POST `W/invitations` | OWNER/ADMIN com e-mail confirmado; email, role. Apenas OWNER convida ADMIN. |
| DELETE `W/invitations/:id` | OWNER/ADMIN; ADMIN não revoga convite de ADMIN. |
| POST `/invitations/accept` | Usuário autenticado com o e-mail do convite; token. |
| PATCH `W/members/:id` | OWNER; role ADMIN, MEMBER ou VIEWER. |
| DELETE `W/members/:id` | OWNER; não remove o proprietário. |
| POST `W/members/:id/transfer-ownership` | OWNER com e-mail confirmado; troca o proprietário por outro integrante. |
| GET `W/audit` | OWNER/ADMIN; paginado. |

## Projetos e tarefas

`GET W/projects` lista projetos; `POST W/projects` cria; `PATCH W/projects/:id` altera; `DELETE W/projects/:id` exclui com cascata de tarefas. Escritas de projetos exigem OWNER/ADMIN. Campos de cadastro: name, description opcional e color opcional. PATCH aceita também status ACTIVE/ARCHIVED, sem preencher campos omitidos.

`GET W/tasks` aceita search, status, projectId, mine e paginacao. `GET W/tasks/:id` consulta uma tarefa. Escritas exigem OWNER/ADMIN/MEMBER. Cadastro de exemplo:

```json
{
  "projectId": "<UUID-do-projeto-da-equipe>",
  "title": "Entregar primeira versao",
  "description": "Conferir os criterios de aceite",
  "status": "TODO",
  "priority": "MEDIUM",
  "assigneeMembershipId": null,
  "dueDate": "2028-02-29"
}
```

Status: TODO, IN_PROGRESS, DONE. Prioridade: LOW, MEDIUM, HIGH. O UUID e ilustrativo; substitua-o por um ID real retornado pela API. O responsável usa o ID da membership, não o ID do usuário. Para atualizar somente o status:

```http
PATCH /api/workspaces/<workspaceId>/tasks/<taskId>
Content-Type: application/json
Origin: http://localhost:5173
X-CSRF-Token: <csrfToken-da-sessao>

{"status":"DONE","version":0}
```

Envie também o cookie da sessão. Use a version retornada pela última leitura, não sempre zero. DELETE exige `{ "version": 0 }` com a versão correspondente. A API rejeita workspaceId e campos desconhecidos no corpo. Tarefas de projetos arquivados não podem ser editadas; a rota DELETE permanece disponível para integrantes com permissao, respeitando a versão.

## Assinatura e saúde

`GET W/billing` retorna plano, uso, limites, disponibilidade da integração e estado de sincronizacao. POST `W/billing/checkout` e POST `W/billing/portal` exigem OWNER com e-mail confirmado e retornam URL fornecida pela Stripe. Não aceitam preço ou URL de retorno arbitrarios.

POST `/billing/webhook` recebe somente eventos Stripe assinados. GET `/health` verifica uma consulta simples ao banco; não atesta saúde de SMTP, worker ou Stripe. Contratos devem ser conferidos com os testes de integração antes de publicar SDK ou documentação externa definitiva.
