# Checklist antes de clientes reais

Todos os itens abaixo estão **pendentes**, salvo quando houver evidencia de homologacao produzida fora desta entrega.

## Produto

- [ ] Definir público, problema, marca, diferenciação, preço e regras dos planos.
- [ ] Confirmar se membros podem editar todas as tarefas da equipe e excluir tarefas arquivadas.
- [ ] Definir efeitos comerciais de inadimplencia, trial e downgrade.
- [ ] Definir atendimento, exportacao, exclusão de conta/equipe e retenção de dados.

## Engenharia

- [ ] Instalar e auditar dependências; versionar lockfile; tornar Docker/CI reproduziveis.
- [ ] Executar typecheck, build, validação do Prisma e migration em PostgreSQL real.
- [ ] Executar testes de schemas, os 11 cenários Playwright e testes adicionais de billing/SMTP.
- [ ] Validar desktop/mobile, teclado, leitores de tela, erros de formulários e navegação.
- [ ] Medir limites, concorrência, scrypt, pool de conexões e locks sob carga.
- [ ] Testar isolamento de todas as rotas, alteracao/revogação de papéis e acessos diretos por IDs.

## Infraestrutura e operação

- [ ] Configurar dominio, HTTPS, banco privado, TLS, SMTP real e segredos separados.
- [ ] Realizar backup e restauração testada; definir disponibilidade e recuperação.
- [ ] Monitorar saúde, falhas de jobs, backlog, indisponibilidade de provedores e erros de billing.
- [ ] Configurar alertas, limpeza periodica, reprocessamento e procedimentos de incidente.
- [ ] Corrigir armazenamento de rate limit antes de multiplas replicas.
- [ ] Revisar permissões de banco, volumes, logs, rede e imagem do container.

## Segurança e privacidade

- [ ] Revisar autenticação, sessões, CSRF, abuse prevention e necessidade de MFA/SSO.
- [ ] Testar restauração de acesso e revogação, inclusive operações concorrentes.
- [ ] Revisar termos, privacidade, retenção e procedimentos para dados pessoais com responsaveis competentes.
- [ ] Validar proteção dos textos da outbox, backups e links de uso único.
- [ ] Avaliar auditoria independente e controles adicionais de isolamento, como RLS.

Não incluídos: MFA/SSO, anexos, exportacao de dados, autoexclusao de conta/equipe, painel global do operador, faturamento fiscal, aplicativos nativos, cobrança por uso, personalizacao por cliente, observabilidade completa e tarefas em tempo real. A ausencia desses itens deve ser avaliada conforme o produto, não tratada como detalhe automaticamente dispensavel.
