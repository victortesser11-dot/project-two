-- Testes de acesso de pessoas ao projeto (RF-004).
\set ON_ERROR_STOP 1
begin;

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-00000000000a', 'ana@a.test'),    -- admin da empresa A
  ('00000000-0000-0000-0000-00000000000b', 'bruno@a.test'),  -- membro de A, engenheiro do projeto
  ('00000000-0000-0000-0000-00000000000c', 'carla@a.test'),  -- membro de A, sem vínculo no começo
  ('00000000-0000-0000-0000-00000000000d', 'davi@b.test'),   -- admin da empresa B
  ('00000000-0000-0000-0000-00000000000e', 'Eva@X.test');    -- sem empresa

set local role authenticated;

select tests.entrar('00000000-0000-0000-0000-00000000000a');
select set_config('t.empresa_a', criar_empresa('Construtora A')::text, true);
select adicionar_membro_empresa(current_setting('t.empresa_a')::uuid, 'bruno@a.test');
select adicionar_membro_empresa(current_setting('t.empresa_a')::uuid, 'carla@a.test');

select tests.entrar('00000000-0000-0000-0000-00000000000d');
select criar_empresa('Construtora B');

select tests.entrar('00000000-0000-0000-0000-00000000000b');
select set_config('t.p', criar_projeto(current_setting('t.empresa_a')::uuid, 'Residencial Aurora')::text, true);

-- ---------------------------------------------------------------- lista
select tests.afirmar(
  (select string_agg(email || ':' || coalesce(papel::text, 'admin') || ':' || voce::text, ' ' order by email)
     from membros_do_projeto(current_setting('t.p')::uuid))
    = 'ana@a.test:admin:false bruno@a.test:engenheiro:true',
  'lista mostra o engenheiro e o admin da empresa, marcando quem é você');

-- ---------------------------------------------------------------- adicionar
select adicionar_membro_projeto(current_setting('t.p')::uuid, '  CARLA@a.test ', 'mestre');
select tests.afirmar(
  (select papel from membros_do_projeto(current_setting('t.p')::uuid) where email = 'carla@a.test') = 'mestre',
  'engenheiro dá acesso a membro da empresa pelo e-mail');
select adicionar_membro_projeto(current_setting('t.p')::uuid, 'carla@a.test', 'almoxarife');
select tests.afirmar(
  (select papel from membros_do_projeto(current_setting('t.p')::uuid) where email = 'carla@a.test') = 'almoxarife',
  'adicionar de novo troca o papel');
select tests.deve_falhar(
  format($$select adicionar_membro_projeto(%L, 'eva@x.test', 'leitura')$$, current_setting('t.p')),
  'engenheiro não traz gente de fora da empresa');
select tests.deve_falhar(
  format($$select adicionar_membro_projeto(%L, 'ninguem@x.test', 'leitura')$$, current_setting('t.p')),
  'e-mail sem conta é recusado');

select tests.entrar('00000000-0000-0000-0000-00000000000c');
select tests.afirmar((select count(*) from membros_do_projeto(current_setting('t.p')::uuid)) = 3, 'quem tem acesso vê a lista');
select tests.deve_falhar(
  format($$select adicionar_membro_projeto(%L, 'ana@a.test', 'leitura')$$, current_setting('t.p')),
  'almoxarife não dá acesso');

select tests.entrar('00000000-0000-0000-0000-00000000000a');
select adicionar_membro_projeto(current_setting('t.p')::uuid, 'eva@x.test', 'leitura');
select tests.afirmar(
  (select papel from membro_empresa where usuario_id = '00000000-0000-0000-0000-00000000000e') = 'membro',
  'admin traz pessoa de fora: ela entra na empresa como membro');
select tests.afirmar(
  (select papel from membros_do_projeto(current_setting('t.p')::uuid) where email = 'Eva@X.test') = 'leitura',
  'e recebe o papel pedido no projeto');

-- ---------------------------------------------------------------- outra empresa
select tests.entrar('00000000-0000-0000-0000-00000000000d');
select tests.afirmar((select count(*) from membros_do_projeto(current_setting('t.p')::uuid)) = 0, 'outra empresa não vê quem acessa');
select tests.deve_falhar(
  format($$select adicionar_membro_projeto(%L, 'davi@b.test', 'engenheiro')$$, current_setting('t.p')),
  'outra empresa não se adiciona ao projeto');

-- ---------------------------------------------------------------- remover
select tests.entrar('00000000-0000-0000-0000-00000000000b');
select tests.afirmar(
  tests.linhas_afetadas(format($$delete from membro_projeto where projeto_id = %L and usuario_id = '00000000-0000-0000-0000-00000000000e'$$,
                               current_setting('t.p'))) = 1,
  'engenheiro remove o acesso de alguém');
select tests.entrar('00000000-0000-0000-0000-00000000000e');
select tests.afirmar((select count(*) from projeto) = 0, 'quem perdeu o acesso não vê mais o projeto');

rollback;
