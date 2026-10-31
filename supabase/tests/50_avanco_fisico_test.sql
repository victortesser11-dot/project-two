-- Testes do RF-202: apontamento de avanço (% e quantidade), reenvio offline
-- sem duplicar, "última edição vence" pela data, permissões e média ponderada.
\set ON_ERROR_STOP 1
begin;

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-00000000000a', 'ana@a.test'),    -- admin da empresa A
  ('00000000-0000-0000-0000-00000000000b', 'bruno@a.test'),  -- engenheiro do projeto P
  ('00000000-0000-0000-0000-00000000000c', 'carla@a.test'),  -- mestre no projeto P
  ('00000000-0000-0000-0000-00000000000e', 'edu@a.test'),    -- leitura no projeto P
  ('00000000-0000-0000-0000-00000000000d', 'davi@b.test');   -- admin da empresa B

create or replace function tests.tarefa(p_nome text)
returns uuid language sql as $$ select id from public.eap_item where nome = p_nome; $$;
create or replace function tests.pct(p_nome text)
returns numeric language sql as $$
  select percentual_fisico from public.eap_do_projeto(current_setting('t.p')::uuid) where nome = p_nome;
$$;
create or replace function tests.hoje(p_dias integer default 0)
returns date language sql as $$ select (now() at time zone 'America/Sao_Paulo')::date + p_dias; $$;
grant execute on function tests.tarefa(text), tests.pct(text), tests.hoje(integer) to authenticated;

set local role authenticated;

-- ---------------------------------------------------------------- cenário
select tests.entrar('00000000-0000-0000-0000-00000000000a');
select set_config('t.empresa_a', criar_empresa('Construtora A')::text, true);
select adicionar_membro_empresa(current_setting('t.empresa_a')::uuid, 'bruno@a.test');
select adicionar_membro_empresa(current_setting('t.empresa_a')::uuid, 'carla@a.test');
select adicionar_membro_empresa(current_setting('t.empresa_a')::uuid, 'edu@a.test');

select tests.entrar('00000000-0000-0000-0000-00000000000b');
select set_config('t.p', criar_projeto(current_setting('t.empresa_a')::uuid, 'Residencial Aurora')::text, true);
select adicionar_membro_projeto(current_setting('t.p')::uuid, 'carla@a.test', 'mestre');
select adicionar_membro_projeto(current_setting('t.p')::uuid, 'edu@a.test', 'leitura');

select set_config('t.etapa', criar_item_eap(current_setting('t.p')::uuid, 'etapa', 'Alvenaria')::text, true);
select criar_item_eap(current_setting('t.p')::uuid, 'tarefa', 'Bloco térreo', current_setting('t.etapa')::uuid,
  '{"unidade":"m²","quantidade":"400","custo_previsto":"30000","inicio_previsto":"2026-11-02","fim_previsto":"2026-11-20"}');
select criar_item_eap(current_setting('t.p')::uuid, 'tarefa', 'Bloco 1º pav.', current_setting('t.etapa')::uuid,
  '{"custo_previsto":"10000","inicio_previsto":"2026-11-23","fim_previsto":"2026-12-04"}');

select tests.entrar('00000000-0000-0000-0000-00000000000d');
select set_config('t.empresa_b', criar_empresa('Construtora B')::text, true);

-- ---------------------------------------------------------------- apontar
select tests.entrar('00000000-0000-0000-0000-00000000000c');
select tests.afirmar(
  registrar_avanco('10000000-0000-4000-8000-000000000001', tests.tarefa('Bloco térreo'), tests.hoje(-2), p_quantidade => 100) = 25,
  'mestre aponta quantidade feita e ela vira % da quantidade prevista');
select tests.afirmar(
  registrar_avanco('10000000-0000-4000-8000-000000000002', tests.tarefa('Bloco térreo'), tests.hoje(-1), p_quantidade => 60) = 40,
  'quantidade é somada aos apontamentos anteriores');
select tests.afirmar(
  registrar_avanco('10000000-0000-4000-8000-000000000002', tests.tarefa('Bloco térreo'), tests.hoje(-1), p_quantidade => 60) = 40
  and (select count(*) from avanco_tarefa where tarefa_id = tests.tarefa('Bloco térreo')) = 2,
  'reenviar o mesmo apontamento (fila offline) não duplica');
select tests.afirmar(
  registrar_avanco('10000000-0000-4000-8000-000000000003', tests.tarefa('Bloco 1º pav.'), tests.hoje(), 50) = 50,
  'mestre aponta em %');
select tests.afirmar(
  registrar_avanco('10000000-0000-4000-8000-000000000004', tests.tarefa('Bloco 1º pav.'), tests.hoje(-3), 10) = 50,
  'apontamento de dias atrás que chega depois não apaga o de hoje');
select tests.afirmar(
  (select count(*) from avanco_tarefa where tarefa_id = tests.tarefa('Bloco 1º pav.')) = 2,
  'mas fica no histórico');
select tests.afirmar(
  registrar_avanco('10000000-0000-4000-8000-000000000005', tests.tarefa('Bloco 1º pav.'), tests.hoje(), 45) = 45,
  'no mesmo dia, o último apontamento vence (correção)');
select tests.afirmar(
  registrar_avanco('10000000-0000-4000-8000-000000000006', tests.tarefa('Bloco térreo'), tests.hoje(), p_quantidade => 1000) = 100,
  'quantidade além da prevista para em 100%');

select tests.deve_falhar(
  format($$select registrar_avanco(gen_random_uuid(), %L, %L, 30)$$, tests.tarefa('Bloco térreo'), tests.hoje(1)),
  'avanço no futuro é recusado');
select tests.deve_falhar(
  format($$select registrar_avanco(gen_random_uuid(), %L, %L, 30)$$, tests.tarefa('Bloco térreo'), tests.hoje(-61)),
  'mestre não aponta mais de 60 dias atrás');
select tests.deve_falhar(
  format($$select registrar_avanco(gen_random_uuid(), %L, %L, 130)$$, tests.tarefa('Bloco térreo'), tests.hoje()),
  'avanço acima de 100% é recusado');
select tests.deve_falhar(
  format($$select registrar_avanco(gen_random_uuid(), %L, %L, p_quantidade => 5)$$, tests.tarefa('Bloco 1º pav.'), tests.hoje()),
  'quantidade em tarefa sem quantidade prevista é recusada');
select tests.deve_falhar(
  format($$select registrar_avanco(gen_random_uuid(), %L, %L)$$, tests.tarefa('Bloco 1º pav.'), tests.hoje()),
  'apontamento vazio é recusado');
select tests.deve_falhar(
  format($$select registrar_avanco(gen_random_uuid(), %L, %L, 10)$$, current_setting('t.etapa'), tests.hoje()),
  'etapa não recebe avanço direto');
select tests.deve_falhar(
  format($$select registrar_avanco('10000000-0000-4000-8000-000000000001', %L, %L, 10)$$, tests.tarefa('Bloco 1º pav.'), tests.hoje()),
  'mesmo id com outra tarefa é recusado');

-- ---------------------------------------------------------------- média ponderada
select tests.afirmar(
  tests.pct('Alvenaria') = 86.25,
  'etapa pondera pelo custo quando todas as tarefas têm custo: (100×30 mil + 45×10 mil) / 40 mil');

select tests.entrar('00000000-0000-0000-0000-00000000000b');
select criar_item_eap(current_setting('t.p')::uuid, 'tarefa', 'Limpeza', current_setting('t.etapa')::uuid,
  '{"inicio_previsto":"2026-12-07","fim_previsto":"2026-12-08"}');
select tests.afirmar(
  tests.pct('Alvenaria') = round((19 * 100 + 12 * 45 + 2 * 0)::numeric / 33, 2),
  'com tarefa sem custo, pondera pela duração em dias');

-- ---------------------------------------------------------------- permissões
select tests.entrar('00000000-0000-0000-0000-00000000000e');
select tests.afirmar(
  (select count(*) from avanco_tarefa where projeto_id = current_setting('t.p')::uuid) = 6,
  'leitura vê o histórico de avanço');
select tests.deve_falhar(
  format($$select registrar_avanco(gen_random_uuid(), %L, %L, 60)$$, tests.tarefa('Bloco 1º pav.'), tests.hoje()),
  'leitura não aponta avanço');
select tests.deve_falhar(
  format($$insert into avanco_tarefa (id, empresa_id, projeto_id, tarefa_id, data, percentual) values (gen_random_uuid(), %L, %L, %L, %L, 99)$$,
    current_setting('t.empresa_a'), current_setting('t.p'), tests.tarefa('Bloco 1º pav.'), tests.hoje()),
  'cliente não grava avanço direto na tabela');
select tests.deve_falhar(
  format($$update eap_item set percentual_fisico = 99 where id = %L$$, tests.tarefa('Bloco 1º pav.')),
  'cliente não muda o % físico direto na tabela');

select tests.entrar('00000000-0000-0000-0000-00000000000d');
select tests.afirmar(
  (select count(*) from avanco_tarefa where projeto_id = current_setting('t.p')::uuid) = 0,
  'outra empresa não vê o avanço');
select tests.deve_falhar(
  format($$select registrar_avanco(gen_random_uuid(), %L, %L, 60)$$, tests.tarefa('Bloco 1º pav.'), tests.hoje()),
  'outra empresa não aponta avanço');

select tests.entrar('00000000-0000-0000-0000-00000000000b');
select tests.afirmar(
  registrar_avanco(gen_random_uuid(), tests.tarefa('Limpeza'), tests.hoje(-90), 20) = 20,
  'engenheiro aponta inclusive datas antigas');
select tests.afirmar(
  registrar_avanco(gen_random_uuid(), tests.tarefa('Limpeza'), tests.hoje(), 100) = 100,
  'engenheiro aponta o avanço de hoje');

-- ---------------------------------------------------------------- auditoria
reset role;
select tests.afirmar(
  (select count(*) from audit_log where tabela = 'avanco_tarefa' and acao = 'INSERT') = 8,
  'cada apontamento fica no audit_log (o reenvio não)');
select tests.afirmar(
  exists (select 1 from audit_log where tabela = 'eap_item' and registro_id = tests.tarefa('Bloco 1º pav.')::text
            and antes ->> 'percentual_fisico' = '50.00' and depois ->> 'percentual_fisico' = '45.00'),
  'a mudança do % da tarefa fica no audit_log com antes e depois');

rollback;
