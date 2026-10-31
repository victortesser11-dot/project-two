# Controle de Obras

Prazo, custo, equipe e materiais da obra num só lugar, com fotos diárias das câmeras lidas por IA.
O que estamos construindo e por quê: [`docs/PRD.md`](docs/PRD.md).

## Estado atual (Sprint 0)

- Login por e-mail/senha e Google (Supabase Auth).
- Empresas com administradores e membros; cada obra é um projeto com papéis
  (engenheiro, mestre, almoxarife, financeiro, leitura).
- Permissões no banco (RLS) com 43 testes automatizados e auditoria de toda alteração.
- Quadro de obras com régua de prazo; criação de projeto; abas dos módulos que chegam nos próximos sprints.

## Rodar localmente

```bash
pnpm install
cp apps/web/.env.example apps/web/.env.local   # preencha a chave publicável do Supabase
pnpm dev
```

Testes do banco (qualquer Postgres 15+):

```bash
DATABASE_URL=postgres://postgres:postgres@localhost:5432/postgres pnpm test:db
```

## Estrutura

```
apps/web          Next.js (dashboard e app de campo)
packages/shared   tipos, validação e formatação compartilhados
supabase          migrações, testes de permissão
docs/PRD.md       requisitos do produto
CLAUDE.md         regras para desenvolver com Claude Code
```
