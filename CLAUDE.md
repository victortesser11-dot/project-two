# Controle de Obras

Plataforma para engenheiros controlarem obras: cada obra é um **projeto**, e dentro dele vivem cronograma,
câmeras (fotos diárias + IA), almoxarifado, equipe, orçamento/fiscal e diário de obra.
Contexto completo e requisitos numerados (RF-xxx) em `docs/PRD.md`. Fale e escreva em **português do Brasil**.

## Stack

- `apps/web`: Next.js 15 (App Router, Server Components e Server Actions), React 19, Tailwind 4.
- `packages/shared`: tipos do domínio, validação com Zod 4 e formatação (usado no front e nas actions).
- `packages/emails`: modelos de e-mail (HTML puro) do app e do Supabase Auth.
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
   O Supabase dá **todos os privilégios** em tabela nova para `anon` e `authenticated`: toda tabela nova leva
   `revoke all ... from anon, authenticated` e só o `grant` necessário. O shim imita isso e `10_permissoes_test`
   lista quem pode escrever direto (tabela nova fora da lista quebra o teste).
2. **Permissão mora no banco.** Use as funções de `app` (`e_membro_empresa`, `e_admin_empresa`,
   `papel_no_projeto`, `pode_ver_projeto`, `pode_editar_projeto`). O front esconde botões, mas quem barra é o RLS.
3. **Estoque, custo, cronograma e medição só mudam por função no banco** e geram `audit_log` (trigger
   `app.tg_auditoria`). Nada de cálculo de custo só no front.
4. **`audit_log` é imutável**: sem grant de insert/update/delete para `authenticated`.
5. **Funções `security definer` sempre com `set search_path = ''`** e nomes qualificados (`public.x`).
   As RPCs públicas (`criar_empresa`, `criar_projeto`, `adicionar_membro_empresa`, `adicionar_membro_projeto`,
   `membros_do_projeto`, as da EAP: `criar_item_eap`, `atualizar_item_eap`, `mover_item_eap`,
   `reposicionar_item_eap`, `excluir_item_eap`, `importar_eap`, as do cronograma: `salvar_dependencia`,
   `remover_dependencia`, `definir_linha_base`, a do campo: `registrar_avanco`, e as do diário: `salvar_diario`,
   `definir_efetivo`, `registrar_foto_diario`, `excluir_foto_diario`, `assinar_diario`, e as da equipe:
   `definir_custo_mao_obra`, `registrar_chamada`, `custo_mao_obra_projeto`, e as do almoxarifado:
   `registrar_entradas`, `registrar_saida`, `registrar_ajuste`, `emprestar_ferramenta`, `devolver_ferramenta`, e as das
   câmeras: `criar_agente_camera`, `revogar_agente_camera`, `salvar_camera`, `pedir_teste_camera`,
   `registrar_foto_camera`, `excluir_foto_camera`, e as do orçamento: `definir_composicao_custo`,
   `salvar_versao_orcamento`, `salvar_compromisso`, `encerrar_compromisso`, `registrar_despesa`, `excluir_despesa`,
   `orcado_realizado`, `custo_realizado_por_dia`, `definir_regras_semaforo`, e as da medição:
   `salvar_contrato_medicao`, `definir_item_contrato`, `remover_item_contrato`, `gerar_medicao`, `ajustar_item_medicao`,
   `observar_medicao`, `aprovar_medicao`, `registrar_pagamento_medicao`, `excluir_medicao`, a dos alertas:
   `justificar_atraso`, as dos arquivos: `registrar_arquivo_obra`, `editar_arquivo_obra`, `excluir_arquivo_obra`, e as da obra de exemplo:
   `criar_obra_exemplo`, `excluir_obra_exemplo`) checam a permissão por dentro; o aviso "authenticated pode executar security definer" do Supabase é esperado para elas.
   Aviso para função fora desta lista é problema a investigar. As `agente_*` (`agente_config`,
   `agente_pasta_camera`, `agente_registrar_foto`, `agente_registrar_falha`) só têm grant para `service_role`.
6. **Validação dupla**: Zod em `packages/shared` (mensagens para o usuário) e `check` no banco (garantia).
   Os enums de `packages/shared/src/dominio.ts` espelham os do banco.
7. **Datas do dia a dia são datas, não instantes**: guarde `date` e use `hojeIso()` (fuso de Brasília).
8. **Funções de permissão nunca devolvem NULL.** `if not app.x(...)` com NULL não barra nada em plpgsql.
   Envolva com `coalesce(..., false)` e teste com `is false` (ver `10_permissoes_test.sql`).
9. **Chaves não mudam.** Política de UPDATE que confere a própria linha (`pode_editar_projeto(id)`) lê a linha
   antiga: trocar `empresa_id` passaria. Tabela com UPDATE direto ganha `app.tg_chaves_fixas('id', 'empresa_id')`.
   Função nova em `app` nasce com EXECUTE para PUBLIC (padrão do Postgres; `alter default privileges in schema`
   não tira isso): sempre `revoke all ... from public, anon, authenticated` e `grant` só a quem precisa.
10. **O Supabase entrega no máximo 1.000 linhas por pedido** e corta o resto sem erro (vale para `.limit()` maior
    e para RPC que devolve tabela). Lista que pode passar disso usa `emPaginas` (`lib/paginas.ts`) com ordem estável.

## Fluxo de trabalho

- Um requisito do PRD por vez (RF-xxx). Planeje antes: migração → testes do banco → action/consulta → tela.
- Migração nova: `supabase/migrations/AAAAMMDDHHMMSS_nome.sql`. Rode `pnpm test:db` antes de aplicar.
  Depois de aplicar no Supabase, regere os tipos em `apps/web/src/lib/database.types.ts`.
- Módulo novo do projeto: crie `apps/web/src/app/(app)/projetos/[id]/<slug>/page.tsx` (substitui a
  página "em breve") e atualize `modulos.ts`.
- Commits pequenos, CI verde (`.github/workflows/ci.yml`: banco + testes + build).
- Depois do merge, espere a publicação de produção da Vercel aparecer antes de reapontar o branch de trabalho para o
  `main`: o push do mesmo commit no branch faz a Vercel montar só a prévia e pular a produção.

## EAP e importação

- A EAP (`eap_item`) só muda pelas RPCs acima; o trigger `app.tg_eap_item_integridade` é a garantia final
  (mesmo projeto, pai é etapa, sem ciclo, até 6 níveis). O código 1.2.3 é calculado por `eap_do_projeto`, não gravado.
- Etapas não têm valores próprios: somam custo e datas das tarefas de dentro.
- O importador (`packages/shared/src/importacao`) roda no navegador: CSV, XLSX (`read-excel-file`) e MS Project XML
  viram uma prévia; só ao confirmar o navegador chama `importar_eap` (tudo ou nada, até 5.000 itens).
  Custos do MS Project XML vêm em centavos (÷100). `.mpp` não é lido: peça "Salvar como XML".
- Modelos de cronograma (`packages/shared/src/modelos`): a estrutura padrão de um tipo de obra (hoje "Residência
  unifamiliar", do documento da engenharia) vira itens da mesma prévia, com datas proporcionais ao prazo e a sequência
  entre tarefas; ao gravar, o app chama `importar_eap` e depois `salvar_dependencia` (ligadas pelo `codigo_externo`
  `<modelo>:<chave>`). Os testes garantem que a sequência não empurra nenhuma data.

## Cronograma e avanço (sprint 2)

- Dependências TI/II/TT com defasagem em dias corridos (`eap_dependencia`). `app.recalcular_cronograma` só
  **empurra** sucessoras para frente (mantém a duração); nunca puxa. Roda em `salvar_dependencia` e quando
  `atualizar_item_eap` muda datas.
- Linha de base: `inicio_base`/`fim_base`/`custo_base` em `eap_item`, escritos só por `definir_linha_base`.
- Avanço: `registrar_avanco` (engenheiro e mestre) grava o histórico em `avanco_tarefa`; o id vem do celular
  (fila offline, reenvio não duplica). O % da tarefa é o do apontamento mais recente pela data do serviço.
  Etapas ponderam pelo custo quando todas as tarefas têm custo, senão pela duração. O mesmo critério está em
  `packages/shared/src/avanco.ts` (curva S e projeção de término pelo prazo agregado): mudou um, muda o outro.

## Diário de obra (RF-203)

- `diario_obra` (um por obra e dia), `diario_efetivo` e `diario_foto`. Engenheiro e mestre preenchem; só o
  engenheiro assina. `assinar_diario` congela `conteudo_assinado` (inclui os avanços do dia) e o SHA-256 dele;
  depois disso triggers barram qualquer mudança no diário e nos filhos.
- Fotos no bucket privado `diario`, caminho `<projeto_id>/<diario_id>/<arquivo>`; as políticas de
  `storage.objects` leem o projeto e o diário do caminho. O shim de testes imita o mínimo do Storage.
- Clima automático: `packages/shared/src/clima.ts` (Open-Meteo, sem chave) a partir de `projeto.latitude/longitude`.

## Equipe e mão de obra (sprint 3)

- `empreiteira` e `trabalhador` são da empresa (valem para todas as obras); gere quem `app.pode_gerir_equipe`
  (admin ou engenheiro de alguma obra). **O cliente não lê `trabalhador.cpf`** (grant por coluna): selecione
  colunas explícitas e mostre `cpf_mascarado`. Nunca `select('*')` em `trabalhador`.
- Custo com vigência em `custo_mao_obra`, só por `definir_custo_mao_obra`; lido por quem `app.pode_ver_custos`.
- Chamada: `registrar_chamada` (engenheiro e mestre) em `apontamento_mao_obra`, só para quem está em
  `equipe_projeto`; o dia de uma pessoa pode ser dividido entre tarefas.
- Custo de mão de obra só por `custo_mao_obra_projeto` (no banco): hora × valor, diária rateada pelas horas do
  dia, produção × valor, pelo custo vigente no dia.
- Integrações abertas (sem chave): BrasilAPI (CNPJ, feriados, CEP) e Open-Meteo, sempre com preenchimento manual
  como alternativa quando a API falha.

## Almoxarifado (sprint 4)

- Catálogo da empresa em `item_estoque` (material ou ferramenta; código automático `MAT-0001`/`FER-0001`).
  Cadastra quem `app.pode_gerir_estoque` (admin, engenheiro ou almoxarife de alguma obra); escrita direta com RLS.
- Saldo e custo médio por obra em `saldo_estoque`; movimentos imutáveis em `movimento_estoque`. Só mudam por
  `registrar_entradas` (várias linhas, tudo ou nada; mesma chave de NF-e não entra duas vezes na empresa),
  `registrar_saida` (sempre para uma **tarefa** da obra, nunca deixa saldo negativo, sai pelo custo médio) e
  `registrar_ajuste` (inventário, com motivo). Movimenta quem `app.pode_movimentar_estoque` (engenheiro e almoxarife).
- Custo médio ponderado no banco: `(saldo × médio + qtd × preço) ÷ (saldo + qtd)`; correção é ajuste, nunca edição.
- `item_fornecedor` lembra "CNPJ + código do produto na nota → item do catálogo" para casar a próxima NF-e.
- XML da NF-e lido no navegador (`packages/shared/src/integracoes/nfe.ts`), como o importador da EAP: vira uma
  prévia e só ao confirmar chama `registrar_entradas`. Consulta pela chave (sem XML) exige serviço pago ou certificado A1.
- Ferramenta é patrimônio único: `emprestar_ferramenta`/`devolver_ferramenta`, no máximo um empréstimo aberto.
  A etiqueta tem QR com o código do item; o celular lê com `BarcodeDetector` e cai para digitar o código.

## Câmeras (sprint 5)

- A foto chega por um **agente na obra** (`apps/agente`, Node sem dependências): pede a foto pela rede local
  (`/cgi-bin/snapshot.cgi` com Digest, ou um quadro do RTSP pelo FFmpeg) e envia por HTTPS para a função de borda
  `supabase/functions/agente-cameras` (publicar com `verify_jwt = false`; o token do agente é a autenticação).
  **Nunca** peça para abrir porta da câmera para a internet.
- O token do agente é mostrado uma vez; o banco guarda só o SHA-256 (`agente_camera.token_hash`, fora do grant).
  As funções `agente_*` conferem o token e só rodam como `service_role`.
- Senha da câmera no **Vault** (`vault.create_secret`); `camera.senha_id` fora do grant. Nunca `select('*')` em
  `camera`: use as colunas de `COLUNAS_CAMERA` em `lib/dados.ts`. Só o agente recebe a senha (em memória).
- `foto_camera.data` é o dia de Brasília da captura. Bucket privado `cameras`, caminho `<projeto>/<camera>/<arquivo>`.
- O agente gera um id por captura (`&id=` na função de borda): o reenvio, pela fila ou depois de perder a resposta,
  regrava o mesmo arquivo e não duplica a foto. Erro de regra do banco volta 4xx (o agente registra a falha e não
  insiste); só 5xx e rede caída vão para a fila. Vários horários vencidos juntos viram uma foto só.
- Alerta (RF-102): `falhas_seguidas >= 2` ou agente sem contato há mais de 3 min (`situacaoCamera` no shared).
  O estado operacional da câmera (última foto, falhas, teste) não entra no `audit_log`.
- Time-lapse sem servidor: uma foto por dia, a mais perto do horário-alvo (`quadrosTimelapse`), tocada no navegador.
  MP4 gerado e link público com expiração ficam para quando houver VPS (ou o próprio agente gerar).

## Orçamento e portfólio (sprint 6)

- Composição do custo da tarefa em `composicao_custo` (material, mão de obra, equipamento, outros), só por
  `definir_composicao_custo`. Com composição, `eap_item.custo_previsto` é a soma e o trigger
  `app.tg_eap_custo_composto` barra mudar o custo por fora (`atualizar_item_eap`, importação).
- Versões do orçamento (`orcamento_versao`): fotografia imutável da EAP com custos, por `salvar_versao_orcamento`.
- Financeiro da obra (despesas, contratos/pedidos, realizado) é de quem `app.pode_financeiro_projeto`
  (engenheiro, admin e financeiro). Despesa e contrato sempre de uma **tarefa**.
- Realizado = saídas do almoxarifado + `custo_mao_obra_projeto` + despesas, calculado no banco por
  `orcado_realizado` (por tarefa) e `custo_realizado_por_dia`. Comprometido = contratos/pedidos abertos + o que
  foi pago pelos encerrados. O app só soma na árvore (`custosNaArvore`).
- Valor agregado = orçado × % físico; "gasto × feito" = realizado ÷ agregado − 1; projeção no término = orçado ÷ IDC.
- Físico-financeiro: custo de cada tarefa pelos dias de cada mês (`fisicoFinanceiro`), linha de base ou previsto;
  XLSX gerado no aparelho (`write-excel-file`).
- Semáforo do portfólio: a pior cor entre atraso (prazo agregado) e custo, pelas regras de `regra_semaforo`
  (admin da empresa). Sempre com ícone e rótulo, nunca só a cor.
- `formatarMoeda(..., { compacta: true })` é feito à mão (sem notação compacta do Intl), para o servidor e o
  navegador escreverem igual.

## Medição (RF-505 ampliado)

- `contrato_medicao`: um com o cliente por obra (receber) e quantos com empreiteiras (pagar), com BDI, retenção e
  prazo de pagamento. Itens = tarefas, critério `quantidade` (unidade da tarefa, preço unitário) ou `percentual`
  (quantidade 100, unidade "%"). Gerados da EAP: preço = custo (ou mão de obra da composição) × (1 + BDI) ÷ quantidade.
- Boletim (`medicao`): `gerar_medicao` sugere "executado até o fim do período − já medido"; o executado é o último
  avanço apontado (`app.executado_tarefa`, mesmo critério de `executadoAte` no shared). **O banco é o juiz**: medido
  acumulado ≤ executado ≤ contratado, conferido de novo em `aprovar_medicao` (só o engenheiro). Aprovada = liberada para
  pagar com vencimento; depois só `registrar_pagamento_medicao`. Trigger barra mudar boletim aprovado.
- Tudo financeiro: leitura só para `app.pode_financeiro_projeto`; escrita só pelas funções; tudo no `audit_log`.
- Tarefa já medida não sai da EAP (FK sem cascata em `medicao_item`, checada no fim do comando).

## Alertas

- Calculados na hora, sem tabela (`packages/shared/src/alertas.ts`, juntados em `lib/alertas.ts`): tarefa que devia ter
  terminado/começado ou está 25 pontos abaixo do ritmo linear (com sugestão de causa pelo diário e pelo almoxarifado),
  chuva prevista (Open-Meteo, 3 dias, ≥ 5 mm) em tarefa sensível (`TAREFA_SENSIVEL_A_CHUVA`), material que acaba em menos
  de 7 dias pelo ritmo de 21 dias, medição vencida ou parada, câmera, ferramenta atrasada e diário faltando/sem assinatura.
- Só a justificativa é gravada: `justificativa_atraso` (imutável, auditada) por `justificar_atraso` (engenheiro e mestre);
  justificada depois que o atraso começou, o alerta cai para "Aviso". Histórico com dias por causa (negociação de prazo).
- Alerta por e-mail (resumo diário) ainda não: precisa de agendamento; WhatsApp precisa de conta comercial na Meta.

## E-mails

- `packages/emails`: HTML de e-mail sem dependências (tabelas, estilos inline, até 560px, botão que o Outlook desenha).
  O modelo `html\`...\`` escapa tudo o que é interpolado; `cru()` só para trecho fixo e marcador do Supabase.
- Modelos do Supabase Auth (cadastro, convite, link mágico, troca de e-mail, nova senha, código) gerados em
  `supabase/templates/` por `pnpm --filter @obras/emails exportar`; o teste falha se o arquivo divergir do código.
  Colados à mão no painel (Authentication → Emails), com o SMTP da Resend.
- Os links vão para `/auth/confirmar?token_hash=...&type=...`, que pede um toque antes do `verifyOtp` (nunca valide no
  GET: antivírus de e-mail corporativo abre o link e gastaria o código). Convite e nova senha terminam em `/conta/senha`.
- E-mail do próprio app: `lib/email.ts` (API da Resend, `RESEND_API_KEY` e `EMAIL_REMETENTE`); sem chave, não envia e o
  app segue. Envio em `after()`, nunca segurando a resposta.
- Convite: `adicionar_membro_projeto` devolve `P0002` quando não há conta → se quem pede é admin da empresa, o app manda
  `auth.admin.inviteUserByEmail` (única coisa feita com `SUPABASE_SECRET_KEY`, em `lib/supabase/admin.ts`) e chama a
  função de novo; o banco confere tudo outra vez. Quem já tinha conta recebe o aviso "Você agora acessa a obra".

## Arquivos da obra

- `arquivo_obra` (projetos DWG/PDF/IFC, legalização, contratos), em pastas pelo enum `categoria_arquivo`. Bucket privado
  `arquivos`, caminho `<projeto>/<arquivo>/<nome-seguro.ext>` (`nomeSeguroArquivo`). O navegador envia direto ao Storage
  (arquivo grande não passa pela Vercel) e depois chama `registrar_arquivo_obra`, que confere caminho, extensão e se o
  arquivo chegou; se o registro falhar, o app apaga o arquivo enviado.
- Versões: cada linha é uma versão; as do mesmo documento dividem `documento_id` (id da primeira) e contam `versao`.
  "Enviar nova versão" (`p_nova_versao_de`) herda a pasta e guarda a anterior; a vigente é a de maior número
  (`agruparVersoes` no shared). Excluir tira só aquela versão. Mudar de pasta leva todas as versões.
- Todos da obra leem e baixam (link assinado de 5 min, gerado no clique). Engenheiro, mestre e admin enviam
  (`app.pode_apontar_campo`); corrigir e excluir é de quem edita a obra. No Storage, quem enviou só apaga o próprio
  arquivo ainda não registrado (limpeza quando o registro falha).
- Extensões aceitas iguais no banco (`app.extensao_arquivo_permitida`) e no shared (`EXTENSOES_ARQUIVO`): nada de
  executável nem HTML. Até 50 MB (limite do plano grátis). Só PDF e imagem abrem no navegador; o resto baixa.

## Obra de exemplo

- `criar_obra_exemplo(empresa)` (só admin, uma por empresa) monta no banco uma obra fictícia com ~140 tarefas e três
  meses de andamento, chamando as mesmas RPCs do app (a base está em `app.criar_obra_exemplo_base`; a pública acrescenta
  as medições); `excluir_obra_exemplo` apaga a obra e os cadastros marcados
  `exemplo` que nenhuma obra real usa. Nenhuma conta de login é criada (pessoas são `trabalhador`).
- A coluna `exemplo` (projeto, empreiteira, trabalhador, item_estoque) só é gravada dentro de `criar_obra_exemplo`
  (`app.tg_exemplo_protegido`). Mudou uma RPC usada pelo exemplo? Rode `97_obra_exemplo_test.sql`: ele quebra junto.

## Interface

Claro e limpo, legível sob sol no canteiro (tokens em `apps/web/src/app/globals.css`). Direção "prancheta" (skill
ui-ux-pro-max para construção: cinza industrial + azul de planta + amarelo de segurança, estilo suíço):
- Casca (`components/Casca.tsx`): menu lateral azul-`noite` no computador; no celular, barra de cima `noite` e, dentro
  da obra, barra de baixo (Painel, Hoje, Alertas, Diário, Mais). As seções vêm de `components/navegacao/secoes.ts`.
- Conteúdo sobre `fundo` (cinza frio) em cartões: utilitário `cartao` (branco, borda `linha`, raio 14px, sombra
  quase nula). Preenchimentos sutis em `concreto`; texto `grafite`/`regua`; borda de campo `campo` (3:1); ações e
  progresso em `cianotipia`; alertas em `marcador`; `seguranca` (amarelo) só como destaque sobre o azul-noite.
- Títulos em negrito com `tracking-tight`; indicadores com ícone num quadrado `cianotipia-claro`. Fonte única Archivo em largura normal;
números com a utilidade `numeros` (tabulares). A régua de prazo (`components/Regua.tsx`) é o elemento marcante.
Textos em linguagem de obra, voz ativa, botões dizem o que fazem ("Criar projeto", não "Enviar").
Mobile primeiro: corpo 16px no celular, campos com 16px (iPhone não dá zoom) e alvos de toque de 44px;
foco visível e `prefers-reduced-motion` respeitado.

Componentes (no estilo do shadcn/ui: código nosso sobre primitivos do Radix, versões fixas no `package.json`):
- Confirmação: `useConfirmar()` de `components/Confirmar.tsx` (gaveta no celular, janela no computador). **Nunca
  `window.confirm`.** Ação que apaga ou tira acesso usa `perigo: true`.
- Aviso rápido depois de uma ação: `avisar.ok/erro` (`lib/avisos.ts`, Sonner). Erro de formulário fica junto do campo.
- Menus: `components/MenuSuspenso.tsx` (Radix). Ícones só do `lucide-react`; SVG à mão só no logo (`Logo.tsx`),
  nos gráficos e nas formas do semáforo.
- Data e lista de opções continuam nativas (`type="date"`, `<select>`): no celular o seletor do aparelho é o melhor.

## Glossário

- **EAP**: estrutura analítica do projeto (etapas → tarefas). Tudo que acontece na obra aponta para uma tarefa.
- **Linha de base**: cronograma aprovado, congelado para comparar com o real.
- **Curva S**: avanço acumulado (físico ou financeiro) ao longo do tempo, planejado × real.
- **Físico-financeiro**: distribuição do custo de cada tarefa pelos meses em que ela acontece.
- **Medição**: quanto de uma tarefa o empreiteiro executou no período, base do pagamento.
- **Almoxarifado**: estoque da obra (materiais e ferramentas); saída sempre vinculada a uma tarefa.
- **Diário de obra**: registro diário de clima, equipe, ocorrências e fotos.
- **CNO**: Cadastro Nacional de Obras (Receita Federal), base do INSS da obra.
