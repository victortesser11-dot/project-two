-- Fiscal da obra com IA: quem aponta o campo grava a leitura e os achados juntos; leitura vê e não grava; outra empresa
-- não vê nem grava; tarefa de outra obra é recusada; conferir grava o avanço pela função de sempre e mede o acerto.
\set ON_ERROR_STOP 1
begin;

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-00000000000a', 'ana@a.test'),    -- admin da empresa A
  ('00000000-0000-0000-0000-00000000000b', 'bruno@a.test'),  -- engenheiro do projeto P
  ('00000000-0000-0000-0000-00000000000c', 'carla@a.test'),  -- mestre no projeto P
  ('00000000-0000-0000-0000-00000000000e', 'edu@a.test'),    -- leitura no projeto P
  ('00000000-0000-0000-0000-00000000000d', 'davi@b.test');   -- admin da empresa B

set local role authenticated;
select tests.entrar('00000000-0000-0000-0000-00000000000a');
select set_config('t.a', criar_empresa('Construtora A')::text, true);
select adicionar_membro_empresa(current_setting('t.a')::uuid, u) from unnest(array['bruno@a.test','carla@a.test','edu@a.test']) u;
select tests.entrar('00000000-0000-0000-0000-00000000000b');
select set_config('t.p', criar_projeto(current_setting('t.a')::uuid, 'Residencial')::text, true);
select set_config('t.p2', criar_projeto(current_setting('t.a')::uuid, 'Outra obra')::text, true);
select adicionar_membro_projeto(current_setting('t.p')::uuid, 'carla@a.test', 'mestre');
select adicionar_membro_projeto(current_setting('t.p')::uuid, 'edu@a.test', 'leitura');
select set_config('t.e', criar_item_eap(current_setting('t.p')::uuid, 'etapa', 'Torre A')::text, true);
select set_config('t.t1', criar_item_eap(current_setting('t.p')::uuid, 'tarefa', 'Alvenaria', current_setting('t.e')::uuid)::text, true);
select set_config('t.t2', criar_item_eap(current_setting('t.p')::uuid, 'tarefa', 'Laje', current_setting('t.e')::uuid)::text, true);
select set_config('t.x', criar_item_eap(current_setting('t.p2')::uuid, 'tarefa', 'De outra obra')::text, true);
select set_config('t.hoje', (now() at time zone 'America/Sao_Paulo')::date::text, true);
select set_config('t.d', salvar_diario(current_setting('t.p')::uuid, current_setting('t.hoje')::date)::text, true);
-- O mestre apontou 60% na laje hoje (a IA vai dizer que não viu).
select registrar_avanco(gen_random_uuid(), current_setting('t.t2')::uuid, current_setting('t.hoje')::date, 60);
select tests.entrar('00000000-0000-0000-0000-00000000000d');
select criar_empresa('Construtora B');

select set_config('t.achados', format($$[
  {"tipo": "avanco", "tarefa_id": "%1$s", "titulo": "Alvenaria avançou", "evidencia": "Câmera Torre A: fiadas novas", "percentual_visto": 40, "percentual_apontado": 0},
  {"tipo": "divergencia", "tarefa_id": "%2$s", "titulo": "Laje apontada a 60%% sem sinal", "percentual_visto": 10, "percentual_apontado": 60, "gravidade": "alta"},
  {"tipo": "seguranca", "norma": "NR-35", "titulo": "Trabalho na borda sem cinto", "gravidade": "alta", "evidencia": "Câmera Torre A, hoje"}
]$$, current_setting('t.t1'), current_setting('t.t2')), true);

-- ---------------------------------------------------------------- gravar
select tests.entrar('00000000-0000-0000-0000-00000000000c');
select tests.afirmar(
  registrar_fiscal_ia('50000000-0000-4000-8000-000000000001', current_setting('t.p')::uuid, current_setting('t.hoje')::date,
    'openrouter:x', '{"resumo": "Alvenaria do 4º avançou"}', '{}', current_setting('t.d')::uuid, current_setting('t.achados')::jsonb)
  = '50000000-0000-4000-8000-000000000001',
  'mestre grava a leitura do fiscal com os achados');
select tests.afirmar(
  (select count(*) from achado_fiscal where analise_id = '50000000-0000-4000-8000-000000000001' and situacao = 'pendente') = 3
  and (select tipo = 'fiscal' and data = current_setting('t.hoje')::date from analise_ia where id = '50000000-0000-4000-8000-000000000001'),
  'leitura e os 3 achados gravados juntos, pendentes');
select tests.afirmar(
  registrar_fiscal_ia('50000000-0000-4000-8000-000000000001', current_setting('t.p')::uuid, current_setting('t.hoje')::date,
    'openrouter:x', '{}', '{}', current_setting('t.d')::uuid, current_setting('t.achados')::jsonb) is not null
  and (select count(*) from achado_fiscal) = 3,
  'reenvio com o mesmo id não duplica');

select tests.deve_falhar(
  format($$select registrar_fiscal_ia(gen_random_uuid(), %L, %L, 'm', '{}', '{}', %L,
    '[{"tipo": "avanco", "tarefa_id": "%s", "titulo": "De outra obra"}]')$$,
    current_setting('t.p'), current_setting('t.hoje'), current_setting('t.d'), current_setting('t.x')),
  'achado com tarefa de outra obra é recusado');
select tests.deve_falhar(
  format($$select registrar_fiscal_ia(gen_random_uuid(), %L, %L, 'm', '{}', '{}', %L,
    '[{"tipo": "seguranca", "norma": "ABNT 1234", "titulo": "Norma torta"}]')$$,
    current_setting('t.p'), current_setting('t.hoje'), current_setting('t.d')),
  'norma fora do formato NR-xx é recusada');
select tests.deve_falhar(
  format($$select registrar_fiscal_ia(gen_random_uuid(), %L, %L, 'm', '{}', '{}', %L,
    '[{"tipo": "seguranca", "titulo": "Sem norma"}]')$$,
    current_setting('t.p'), current_setting('t.hoje'), current_setting('t.d')),
  'achado de segurança sem norma é recusado');
select tests.deve_falhar(
  format($$select registrar_fiscal_ia(gen_random_uuid(), %L, %L, 'm', '{}', array[gen_random_uuid()], null, '[]')$$,
    current_setting('t.p'), current_setting('t.hoje')),
  'foto de câmera que não é da obra é recusada');
select tests.deve_falhar(
  format($$select registrar_fiscal_ia(gen_random_uuid(), %L, %L, 'm', '{}', '{}', null, '[]')$$,
    current_setting('t.p'), current_setting('t.hoje')),
  'leitura sem foto de câmera nem diário é recusada');
select tests.deve_falhar(
  format($$select registrar_fiscal_ia(gen_random_uuid(), %L, %L, 'm', '{}', '{}', %L, '[]')$$,
    current_setting('t.p'), (current_setting('t.hoje')::date + 1)::text, current_setting('t.d')),
  'dia no futuro é recusado');
select tests.deve_falhar(
  $$insert into achado_fiscal (empresa_id, projeto_id, analise_id, data, tipo, titulo, norma)
    values (current_setting('t.a')::uuid, current_setting('t.p')::uuid, '50000000-0000-4000-8000-000000000001', current_date, 'seguranca', 'x', 'NR-6')$$,
  'ninguém insere achado direto');

-- ---------------------------------------------------------------- leitura vê, não grava nem confere
select tests.entrar('00000000-0000-0000-0000-00000000000e');
select tests.afirmar((select count(*) from achado_fiscal) = 3, 'leitura vê os achados');
select tests.deve_falhar(
  format($$select registrar_fiscal_ia(gen_random_uuid(), %L, %L, 'm', '{}', '{}', %L, '[]')$$,
    current_setting('t.p'), current_setting('t.hoje'), current_setting('t.d')),
  'leitura não fiscaliza');
select tests.deve_falhar(
  format($$select resolver_achado_fiscal((select id from achado_fiscal where tipo = 'avanco'), 'confirmado')$$),
  'leitura não confere achado');

-- ---------------------------------------------------------------- outra empresa
select tests.entrar('00000000-0000-0000-0000-00000000000d');
select tests.afirmar((select count(*) from achado_fiscal) = 0, 'outra empresa não vê os achados');
select tests.deve_falhar(
  format($$select registrar_fiscal_ia(gen_random_uuid(), %L, %L, 'm', '{}', '{}', %L, '[]')$$,
    current_setting('t.p'), current_setting('t.hoje'), current_setting('t.d')),
  'outra empresa não fiscaliza');

-- ---------------------------------------------------------------- conferir
select tests.entrar('00000000-0000-0000-0000-00000000000c');
select resolver_achado_fiscal((select id from achado_fiscal where tipo = 'avanco'), 'confirmado', null, null,
  '60000000-0000-4000-8000-000000000001');
select tests.afirmar(
  (select situacao = 'confirmado' and percentual_final = 40 and avanco_id = '60000000-0000-4000-8000-000000000001'
          and resolvido_por = auth.uid() from achado_fiscal where tipo = 'avanco')
  and (select percentual = 40 and observacao like '%fiscal%' from avanco_tarefa where id = '60000000-0000-4000-8000-000000000001')
  and (select percentual_fisico = 40 from eap_item where id = current_setting('t.t1')::uuid),
  'mestre confirma o avanço visto: vira apontamento de 40%% pela registrar_avanco');
select tests.deve_falhar(
  format($$select resolver_achado_fiscal((select id from achado_fiscal where tipo = 'avanco'), 'descartado')$$),
  'achado já conferido não muda de novo');

select tests.entrar('00000000-0000-0000-0000-00000000000b');
select tests.deve_falhar(
  format($$select resolver_achado_fiscal((select id from achado_fiscal where tipo = 'divergencia'), 'corrigido')$$),
  'corrigir exige o avanço certo');
-- No teste tudo roda numa transação (mesmo now()): o id maior desempata como o apontamento mais recente.
select resolver_achado_fiscal((select id from achado_fiscal where tipo = 'divergencia'), 'corrigido', 25, 'Laje só com fôrma',
  'ffffffff-ffff-4fff-bfff-ffffffffffff');
select tests.afirmar(
  (select percentual_fisico = 25 from eap_item where id = current_setting('t.t2')::uuid)
  and (select situacao = 'corrigido' and percentual_final = 25 and resposta = 'Laje só com fôrma' from achado_fiscal where tipo = 'divergencia'),
  'engenheiro corrige a divergência: o avanço da laje vai para 25%%');
select tests.deve_falhar(
  format($$select resolver_achado_fiscal((select id from achado_fiscal where tipo = 'seguranca'), 'corrigido', 10)$$),
  'segurança não é "corrigida": é confirmada ou descartada');
select resolver_achado_fiscal((select id from achado_fiscal where tipo = 'seguranca'), 'confirmado', null, 'Linha de vida instalada');
select tests.afirmar(
  (select situacao = 'confirmado' and percentual_final is null and avanco_id is null from achado_fiscal where tipo = 'seguranca'),
  'segurança confirmada com a providência, sem mexer no avanço');
select tests.deve_falhar(
  format($$update achado_fiscal set situacao = 'pendente' where tipo = 'seguranca'$$),
  'ninguém muda achado direto');

reset role;
select tests.afirmar(
  (select count(*) from audit_log where tabela = 'achado_fiscal' and acao = 'INSERT') = 3
  and (select count(*) from audit_log where tabela = 'achado_fiscal' and acao = 'UPDATE') = 3,
  'achados e conferências no audit_log');

rollback;
