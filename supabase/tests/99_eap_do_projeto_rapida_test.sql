-- eap_do_projeto confere a permissão uma vez (security definer): quem não vê a obra não recebe nada, nem sendo da mesma
-- empresa; quem vê recebe a árvore inteira, igual a antes.
\set ON_ERROR_STOP 1
begin;

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-00000000000a', 'ana@a.test'),    -- admin da empresa A
  ('00000000-0000-0000-0000-00000000000b', 'bruno@a.test'),  -- engenheiro do projeto P
  ('00000000-0000-0000-0000-00000000000f', 'fabi@a.test'),   -- da empresa A, sem papel no projeto P
  ('00000000-0000-0000-0000-00000000000d', 'davi@b.test');   -- admin da empresa B

set local role authenticated;
select tests.entrar('00000000-0000-0000-0000-00000000000a');
select set_config('t.a', criar_empresa('Construtora A')::text, true);
select adicionar_membro_empresa(current_setting('t.a')::uuid, u) from unnest(array['bruno@a.test','fabi@a.test']) u;
select tests.entrar('00000000-0000-0000-0000-00000000000b');
select set_config('t.p', criar_projeto(current_setting('t.a')::uuid, 'Residencial')::text, true);
select set_config('t.e', criar_item_eap(current_setting('t.p')::uuid, 'etapa', 'Torre A')::text, true);
select criar_item_eap(current_setting('t.p')::uuid, 'tarefa', 'Fundação', current_setting('t.e')::uuid);
select criar_item_eap(current_setting('t.p')::uuid, 'tarefa', 'Alvenaria', current_setting('t.e')::uuid);
select tests.entrar('00000000-0000-0000-0000-00000000000d');
select criar_empresa('Construtora B');

select tests.entrar('00000000-0000-0000-0000-00000000000b');
select tests.afirmar(
  (select string_agg(codigo || ' ' || nome, ' | ' order by posicao) from eap_do_projeto(current_setting('t.p')::uuid))
  = '1 Torre A | 1.1 Fundação | 1.2 Alvenaria',
  'engenheiro recebe a árvore inteira, com os códigos');

select tests.entrar('00000000-0000-0000-0000-00000000000a');
select tests.afirmar((select count(*) from eap_do_projeto(current_setting('t.p')::uuid)) = 3, 'admin da empresa vê a EAP');

select tests.entrar('00000000-0000-0000-0000-00000000000f');
select tests.afirmar((select count(*) from eap_do_projeto(current_setting('t.p')::uuid)) = 0,
  'da mesma empresa, mas sem papel na obra: não recebe nada');

select tests.entrar('00000000-0000-0000-0000-00000000000d');
select tests.afirmar((select count(*) from eap_do_projeto(current_setting('t.p')::uuid)) = 0, 'outra empresa não recebe nada');

reset role;
select tests.afirmar(
  (select prosecdef from pg_proc where oid = 'public.eap_do_projeto(uuid)'::regprocedure)
  and not has_function_privilege('anon', 'public.eap_do_projeto(uuid)', 'execute'),
  'security definer, sem execução para anon');

rollback;
