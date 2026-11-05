-- Justificativa de atraso: engenheiro e mestre justificam; leitura e financeiro não; outra empresa não vê;
-- registro imutável e auditado.
\set ON_ERROR_STOP 1
begin;

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-00000000000a', 'ana@a.test'),    -- admin da empresa A
  ('00000000-0000-0000-0000-00000000000b', 'bruno@a.test'),  -- engenheiro do projeto P
  ('00000000-0000-0000-0000-00000000000c', 'carla@a.test'),  -- mestre no projeto P
  ('00000000-0000-0000-0000-00000000000e', 'edu@a.test'),    -- leitura no projeto P
  ('00000000-0000-0000-0000-00000000000d', 'davi@b.test');   -- admin da empresa B

create or replace function tests.tarefa(p_nome text)
returns uuid language sql security definer set search_path = '' as $$ select id from public.eap_item where nome = p_nome; $$;
grant execute on function tests.tarefa(text) to authenticated;

set local role authenticated;
select tests.entrar('00000000-0000-0000-0000-00000000000a');
select set_config('t.a', criar_empresa('Construtora A')::text, true);
select adicionar_membro_empresa(current_setting('t.a')::uuid, u) from unnest(array['bruno@a.test','carla@a.test','edu@a.test']) u;
select tests.entrar('00000000-0000-0000-0000-00000000000b');
select set_config('t.p', criar_projeto(current_setting('t.a')::uuid, 'Casa')::text, true);
select adicionar_membro_projeto(current_setting('t.p')::uuid, 'carla@a.test', 'mestre');
select adicionar_membro_projeto(current_setting('t.p')::uuid, 'edu@a.test', 'leitura');
select set_config('t.etapa', criar_item_eap(current_setting('t.p')::uuid, 'etapa', 'Estrutura')::text, true);
select criar_item_eap(current_setting('t.p')::uuid, 'tarefa', 'Concretagem da laje', current_setting('t.etapa')::uuid);
select tests.entrar('00000000-0000-0000-0000-00000000000d');
select set_config('t.b', criar_empresa('Construtora B')::text, true);

-- ---------------------------------------------------------------- quem justifica
select tests.entrar('00000000-0000-0000-0000-00000000000c');
select justificar_atraso(tests.tarefa('Concretagem da laje'), 'chuva', 'Chuva forte terça e quarta; laje não pôde ser concretada.', 2);
select tests.afirmar(
  (select causa = 'chuva' and dias_impacto = 2 and registrado_nome = 'carla@a.test' from justificativa_atraso),
  'mestre justifica o atraso com causa, dias e descrição');
select tests.entrar('00000000-0000-0000-0000-00000000000b');
select justificar_atraso(tests.tarefa('Concretagem da laje'), 'material', 'Concreteira não entregou na quinta.');
select tests.afirmar((select count(*) from justificativa_atraso) = 2, 'engenheiro registra outra; o histórico fica');
select tests.deve_falhar(format($$select justificar_atraso(%L, 'chuva', 'Etapa')$$, current_setting('t.etapa')), 'etapa não recebe justificativa');
select tests.deve_falhar(format($$select justificar_atraso(%L, 'chuva', '  ')$$, tests.tarefa('Concretagem da laje')), 'descrição é obrigatória');
select tests.deve_falhar(format($$select justificar_atraso(%L, 'chuva', 'Muitos dias', 400)$$, tests.tarefa('Concretagem da laje')),
  'dias de impacto até 365');

select tests.entrar('00000000-0000-0000-0000-00000000000e');
select tests.deve_falhar(format($$select justificar_atraso(%L, 'chuva', 'Pela leitura')$$, tests.tarefa('Concretagem da laje')),
  'leitura não justifica');
select tests.afirmar((select count(*) from justificativa_atraso) = 2, 'leitura vê as justificativas da obra');
select tests.deve_falhar($$update justificativa_atraso set causa = 'cliente'$$, 'justificativa não muda (imutável)');
select tests.deve_falhar($$delete from justificativa_atraso$$, 'justificativa não é apagada');

select tests.entrar('00000000-0000-0000-0000-00000000000d');
select tests.afirmar((select count(*) from justificativa_atraso) = 0, 'outra empresa não vê');
select tests.deve_falhar(format($$select justificar_atraso(%L, 'chuva', 'Invasão')$$, tests.tarefa('Concretagem da laje')),
  'outra empresa não justifica');

reset role;
select tests.afirmar((select count(*) from audit_log where tabela = 'justificativa_atraso') = 2, 'justificativas no audit_log');

rollback;
