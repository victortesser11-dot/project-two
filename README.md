# Controle de Obras

Prazo, custo, equipe e materiais da obra num só lugar, com fotos diárias das câmeras lidas por IA.
O que estamos construindo e por quê: [`docs/PRD.md`](docs/PRD.md).

## Estado atual (Sprint 1)

- Login por e-mail/senha (Supabase Auth); Google depende de configurar o provedor no Supabase.
- Empresas com administradores e membros; cada obra é um projeto com papéis
  (engenheiro, mestre, almoxarife, financeiro, leitura). O painel do projeto mostra quem acessa e dá acesso por e-mail.
- **EAP** (etapas e tarefas, até 6 níveis): montar na tela, reordenar, mover entre etapas; custo e prazo das etapas
  somados das tarefas.
- **Importação** de planilha (.xlsx, .csv) e MS Project (.xml) com detecção de colunas, prévia e avisos antes de gravar.
- Permissões no banco (RLS) com 120 verificações automatizadas e auditoria de toda alteração.

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
