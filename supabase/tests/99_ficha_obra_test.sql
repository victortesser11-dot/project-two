-- Ficha técnica da obra: o engenheiro da obra grava; mestre e leitura não; outra empresa não vê nem grava; os checks
-- barram valor torto; a mudança vai para o audit_log.
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
select set_config('t.p', criar_projeto(current_setting('t.a')::uuid, 'Residencial Nápoles')::text, true);
select adicionar_membro_projeto(current_setting('t.p')::uuid, 'carla@a.test', 'mestre');
select adicionar_membro_projeto(current_setting('t.p')::uuid, 'edu@a.test', 'leitura');
select tests.entrar('00000000-0000-0000-0000-00000000000d');
select set_config('t.b', criar_empresa('Construtora B')::text, true);

-- ---------------------------------------------------------------- engenheiro grava
select tests.entrar('00000000-0000-0000-0000-00000000000b');
select tests.afirmar(
  tests.linhas_afetadas(format($$update projeto set cep = '92030000', tipo_obra = 'Residencial multifamiliar',
    area_construida_m2 = 12450.5, area_terreno_m2 = 5320, pavimentos = 'Térreo + 4', unidades = '3 torres, 96 apartamentos',
    proprietario = 'Incorporadora Exemplo Ltda', responsavel_tecnico = 'Fulana de Tal (CAU A12345-6)', art_rrt = 'RRT 1234567',
    alvara = 'Processo 2026/123', matricula = '45.678' where id = %L$$, current_setting('t.p'))) = 1,
  'engenheiro da obra grava a ficha técnica');
select tests.afirmar(
  (select area_construida_m2 = 12450.50 and cep = '92030000' and pavimentos = 'Térreo + 4' from projeto where id = current_setting('t.p')::uuid),
  'ficha gravada como enviada');

select tests.deve_falhar(format($$update projeto set cep = '92030-000' where id = %L$$, current_setting('t.p')), 'CEP com traço é recusado (só 8 dígitos)');
select tests.deve_falhar(format($$update projeto set area_construida_m2 = 0 where id = %L$$, current_setting('t.p')), 'área zero é recusada');
select tests.deve_falhar(format($$update projeto set area_terreno_m2 = -10 where id = %L$$, current_setting('t.p')), 'área negativa é recusada');
select tests.deve_falhar(format($$update projeto set tipo_obra = '' where id = %L$$, current_setting('t.p')), 'texto vazio é recusado (use null)');
select tests.deve_falhar(format($$update projeto set art_rrt = repeat('9', 101) where id = %L$$, current_setting('t.p')), 'texto longo demais é recusado');

-- ---------------------------------------------------------------- mestre e leitura veem, mas não gravam
select tests.entrar('00000000-0000-0000-0000-00000000000c');
select tests.afirmar((select tipo_obra from projeto where id = current_setting('t.p')::uuid) = 'Residencial multifamiliar', 'mestre lê a ficha');
select tests.afirmar(
  tests.linhas_afetadas(format($$update projeto set tipo_obra = 'Galpão' where id = %L$$, current_setting('t.p'))) = 0,
  'mestre não grava a ficha');
select tests.entrar('00000000-0000-0000-0000-00000000000e');
select tests.afirmar(
  tests.linhas_afetadas(format($$update projeto set alvara = 'outro' where id = %L$$, current_setting('t.p'))) = 0,
  'leitura não grava a ficha');

-- ---------------------------------------------------------------- outra empresa
select tests.entrar('00000000-0000-0000-0000-00000000000d');
select tests.afirmar((select count(*) from projeto where id = current_setting('t.p')::uuid) = 0, 'outra empresa não vê a obra');
select tests.afirmar(
  tests.linhas_afetadas(format($$update projeto set proprietario = 'Intruso' where id = %L$$, current_setting('t.p'))) = 0,
  'outra empresa não grava a ficha');

-- ---------------------------------------------------------------- admin da empresa grava
select tests.entrar('00000000-0000-0000-0000-00000000000a');
select tests.afirmar(
  tests.linhas_afetadas(format($$update projeto set matricula = null where id = %L$$, current_setting('t.p'))) = 1,
  'admin da empresa corrige a ficha');

reset role;
select tests.afirmar(
  (select count(*) from audit_log where tabela = 'projeto' and acao = 'UPDATE' and depois ->> 'tipo_obra' = 'Residencial multifamiliar') >= 1,
  'ficha no audit_log');
select tests.afirmar(
  (select tipo_obra = 'Residencial multifamiliar' and alvara = 'Processo 2026/123' and proprietario <> 'Intruso'
     from projeto where id = current_setting('t.p')::uuid),
  'nada mudou pelas mãos de quem não pode');

rollback;
