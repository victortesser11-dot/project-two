# Controle de Obras

Plataforma para engenheiros controlarem obras: cada obra é um **projeto**, e dentro dele vivem cronograma,
câmeras (fotos diárias + IA), almoxarifado, equipe, orçamento/fiscal e diário de obra.
Contexto completo e requisitos numerados (RF-xxx) em `docs/PRD.md`. Fale e escreva em **português do Brasil**.

## Stack

- `apps/web`: Next.js 15 (App Router, Server Components e Server Actions), React 19, Tailwind 4.
- `packages/shared`: tipos do domínio, validação com Zod 4 e formatação (usado no front e nas actions).
- `supabase/`: migrações SQL, testes de permissão e o shim para rodar os testes em Postgres puro.
- Supabase (Postgres + Auth + Storage), projeto `bxsaaabxbzlddpahdrto` em sa-east-1.
- Hospedagem: web na Vercel; captura de fotos, FFmpeg e jobs de IA numa VPS (a partir do sprint 5).

## Comandos

```bash
pnpm install
pnpm dev                       # app em http://localhost:3000 (precisa de apps/web/.env.local)
pnpm test                      # testes unitários (vitest)
pnpm typecheck
pnpm build
DATABASE_URL=postgres://postgres:postgres@localhost:5432/postgres pnpm test:db   # migrações + testes de RLS
```

`pnpm test:db` recria um banco `obra_test`, aplica `supabase/tests/00_supabase_shim.sql`, todas as migrações
e roda `supabase/tests/*_test.sql`. Qualquer Postgres 15+ serve (não precisa de Docker).

## Regras inegociáveis

1. **Toda tabela de negócio tem `empresa_id`, RLS ligada e teste.** Nova tabela = migração + políticas +
   casos em `supabase/tests/` cobrindo: outra empresa não vê, papel sem permissão não escreve.
2. **Permissão mora no banco.** Use as funções de `app` (`e_membro_empresa`, `e_admin_empresa`,
   `papel_no_projeto`, `pode_ver_projeto`, `pode_editar_projeto`). O front esconde botões, mas quem barra é o RLS.
3. **Estoque, custo, cronograma e medição só mudam por função no banco** e geram `audit_log` (trigger
   `app.tg_auditoria`). Nada de cálculo de custo só no front.
4. **`audit_log` é imutável**: sem grant de insert/update/delete para `authenticated`.
5. **Funções `security definer` sempre com `set search_path = ''`** e nomes qualificados (`public.x`).
   As RPCs públicas (`criar_empresa`, `criar_projeto`, `adicionar_membro_empresa`) checam a permissão por
   dentro; o aviso "authenticated pode executar security definer" do Supabase é esperado para elas.
6. **Validação dupla**: Zod em `packages/shared` (mensagens para o usuário) e `check` no banco (garantia).
   Os enums de `packages/shared/src/dominio.ts` espelham os do banco.
7. **Datas do dia a dia são datas, não instantes**: guarde `date` e use `hojeIso()` (fuso de Brasília).

## Fluxo de trabalho

- Um requisito do PRD por vez (RF-xxx). Planeje antes: migração → testes do banco → action/consulta → tela.
- Migração nova: `supabase/migrations/AAAAMMDDHHMMSS_nome.sql`. Rode `pnpm test:db` antes de aplicar.
  Depois de aplicar no Supabase, regere os tipos em `apps/web/src/lib/database.types.ts`.
- Módulo novo do projeto: crie `apps/web/src/app/(app)/projetos/[id]/<slug>/page.tsx` (substitui a
  página "em breve") e atualize `modulos.ts`.
- Commits pequenos, CI verde (`.github/workflows/ci.yml`: banco + testes + build).

## Interface

Linguagem visual de planta técnica sobre concreto (tokens em `apps/web/src/app/globals.css`):
fundo `concreto`, superfícies `papel`, texto `grafite`, ações em `cianotipia`, alertas em `marcador`.
Fonte única Archivo; títulos com largura expandida; números com a utilidade `numeros` (tabulares).
Textos em linguagem de obra, voz ativa, botões dizem o que fazem ("Criar projeto", não "Enviar").
Mobile primeiro para as telas de campo; foco visível e `prefers-reduced-motion` respeitado.

## Glossário

- **EAP**: estrutura analítica do projeto (etapas → tarefas). Tudo que acontece na obra aponta para uma tarefa.
- **Linha de base**: cronograma aprovado, congelado para comparar com o real.
- **Curva S**: avanço acumulado (físico ou financeiro) ao longo do tempo, planejado × real.
- **Físico-financeiro**: distribuição do custo de cada tarefa pelos meses em que ela acontece.
- **Medição**: quanto de uma tarefa o empreiteiro executou no período, base do pagamento.
- **Almoxarifado**: estoque da obra (materiais e ferramentas); saída sempre vinculada a uma tarefa.
- **Diário de obra**: registro diário de clima, equipe, ocorrências e fotos.
- **CNO**: Cadastro Nacional de Obras (Receita Federal), base do INSS da obra.
