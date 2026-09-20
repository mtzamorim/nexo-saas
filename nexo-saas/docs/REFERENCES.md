# Referências oficiais consultadas

Consulta para está entrega: 20/09/2026. As referências orientam decisões tecnicas, mas não substituem os testes da implementacao. O projeto fixa faixas principais de versão; não afirma utilizar sempre a última versão disponível.

| Documentação | Aplicacao no projeto |
| --- | --- |
| [Prisma 7 + PostgreSQL](https://www.prisma.io/docs/v7/prisma-orm/quickstart/postgresql) | Cliente gerado e driver adapter PostgreSQL. |
| [Prisma PostgreSQL](https://www.prisma.io/docs/orm/v7/core-concepts/supported-databases/postgresql) | Conexão e tipos do banco. |
| [Vite](https://vite.dev/guide/) | Build e servidor de desenvolvimento; requisitos de Node. |
| [Express - produção](https://expressjs.com/en/advanced/best-practice-security/) | Cabecalhos, transporte e reducao da exposicao de detalhes. |
| [OWASP - sessões](https://cheatsheetseries.owasp.org/cheatsheets/Session_Management_Cheat_Sheet.html) | Cookies, tokens e expiração de sessão. |
| [OWASP - CSRF](https://cheatsheetseries.owasp.org/cheatsheets/Cross-Site_Request_Forgery_Prevention_Cheat_Sheet.html) | Origem e token de proteção de escritas autenticadas. |
| [OWASP - senhas](https://cheatsheetseries.owasp.org/cheatsheets/Password_Storage_Cheat_Sheet.html) | Uso de scrypt como alternativa suportada, com parametros explicitos. |
| [Zod 4 - migração](https://zod.dev/v4/changelog?id=defaults-applied-within-optional-fields) | Defaults em campos opcionais; separacao dos schemas de criação e PATCH. |
| [Stripe - webhooks](https://docs.stripe.com/webhooks) | Corpo bruto, assinatura, duplicação e resposta após persistencia. |
| [Stripe - assinaturas](https://docs.stripe.com/billing/subscriptions/webhooks) | Eventos e estados do ciclo de assinatura. |

Os parametros scrypt são uma escolha explicita desta base; a referência OWASP prioriza Argon2id e descreve scrypt como alternativa. Nenhuma referência certifica a segurança desta implementacao ou sua adequação legal.
