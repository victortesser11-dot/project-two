-- Leituras da IA: engenheiro grava leitura de arquivos; mestre grava a das fotos do diário mas não a dos arquivos;
-- leitura vê o histórico; outra empresa não vê nem grava; arquivo e diário precisam ser da obra; ninguém altera.
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
select set_config('t.p', criar_projeto(current_setting('t.a')::uuid, 'Casa')::text, true);
select set_config('t.p2', criar_projeto(current_setting('t.a')::uuid, 'Outra casa')::text, true);
select adicionar_membro_projeto(current_setting('t.p')::uuid, 'carla@a.test', 'mestre');
select adicionar_membro_projeto(current_setting('t.p')::uuid, 'edu@a.test', 'leitura');
select tests.entrar('00000000-0000-0000-0000-00000000000d');
select set_config('t.b', criar_empresa('Construtora B')::text, true);

-- Um arquivo em cada obra e o diário de hoje da obra P.
select tests.entrar('00000000-0000-0000-0000-00000000000b');
select set_config('t.arq', '30000000-0000-4000-8000-0000000000a1', true);
select set_config('t.arq2', '30000000-0000-4000-8000-0000000000a2', true);
select tests.linhas_afetadas(format($$insert into storage.objects (bucket_id, name) values ('arquivos', %L)$$,
  current_setting('t.p') || '/' || current_setting('t.arq') || '/arq-01.pdf'));
select registrar_arquivo_obra(current_setting('t.arq')::uuid, current_setting('t.p')::uuid,
  current_setting('t.p') || '/' || current_setting('t.arq') || '/arq-01.pdf', 'ARQ 01.pdf', 'arquitetonico', 1000);
select tests.linhas_afetadas(format($$insert into storage.objects (bucket_id, name) values ('arquivos', %L)$$,
  current_setting('t.p2') || '/' || current_setting('t.arq2') || '/est-01.pdf'));
select registrar_arquivo_obra(current_setting('t.arq2')::uuid, current_setting('t.p2')::uuid,
  current_setting('t.p2') || '/' || current_setting('t.arq2') || '/est-01.pdf', 'EST 01.pdf', 'estrutural', 1000);
select set_config('t.d', salvar_diario(current_setting('t.p')::uuid, (now() at time zone 'America/Sao_Paulo')::date)::text, true);

-- ---------------------------------------------------------------- engenheiro: leitura dos arquivos
select tests.afirmar(
  registrar_analise_ia('40000000-0000-4000-8000-000000000001', current_setting('t.p')::uuid, 'arquivos', 'gemini-flash-latest',
    '{"resumo": "Residencial com 3 torres", "tarefas": []}', array[current_setting('t.arq')::uuid])
  = '40000000-0000-4000-8000-000000000001',
  'engenheiro grava a leitura dos arquivos');
select tests.afirmar(
  registrar_analise_ia('40000000-0000-4000-8000-000000000001', current_setting('t.p')::uuid, 'arquivos', 'gemini-flash-latest',
    '{"resumo": "de novo"}', array[current_setting('t.arq')::uuid]) = '40000000-0000-4000-8000-000000000001'
  and (select count(*) from analise_ia) = 1
  and (select resultado ->> 'resumo' from analise_ia) = 'Residencial com 3 torres',
  'reenvio com o mesmo id não duplica nem troca o resultado');
select tests.afirmar(
  (select criado_por = auth.uid() and empresa_id = current_setting('t.a')::uuid from analise_ia),
  'guarda quem pediu e a empresa da obra');
select tests.deve_falhar(
  format($$select registrar_analise_ia(gen_random_uuid(), %L, 'arquivos', 'm', '{}', array[%L]::uuid[])$$,
    current_setting('t.p'), current_setting('t.arq2')),
  'arquivo de outra obra é recusado');
select tests.deve_falhar(
  format($$select registrar_analise_ia(gen_random_uuid(), %L, 'arquivos', 'm', '{}', '{}')$$, current_setting('t.p')),
  'leitura de arquivos sem arquivo é recusada');
select tests.deve_falhar(
  format($$select registrar_analise_ia(gen_random_uuid(), %L, 'arquivos', 'm', '[1, 2]', array[%L]::uuid[])$$,
    current_setting('t.p'), current_setting('t.arq')),
  'resultado precisa ser um objeto');
select tests.deve_falhar(
  format($$select registrar_analise_ia(gen_random_uuid(), %L, 'qualquer', 'm', '{}')$$, current_setting('t.p')),
  'tipo desconhecido é recusado');

-- ---------------------------------------------------------------- mestre: fotos do diário sim, arquivos não
select tests.entrar('00000000-0000-0000-0000-00000000000c');
select tests.afirmar(
  registrar_analise_ia('40000000-0000-4000-8000-000000000002', current_setting('t.p')::uuid, 'fotos_diario', 'gemini-flash-latest',
    '{"resumo": "Alvenaria do térreo avançou", "tarefas": []}', '{}', current_setting('t.d')::uuid)
  = '40000000-0000-4000-8000-000000000002',
  'mestre grava a leitura das fotos do dia');
select tests.deve_falhar(
  format($$select registrar_analise_ia(gen_random_uuid(), %L, 'arquivos', 'm', '{}', array[%L]::uuid[])$$,
    current_setting('t.p'), current_setting('t.arq')),
  'mestre não grava leitura de arquivos (as tarefas sugeridas mexem na EAP)');
select tests.deve_falhar(
  format($$select registrar_analise_ia(gen_random_uuid(), %L, 'fotos_diario', 'm', '{}', '{}', %L)$$,
    current_setting('t.p2'), current_setting('t.d')),
  'diário de outra obra é recusado');
select tests.deve_falhar(
  format($$insert into analise_ia (id, empresa_id, projeto_id, tipo, arquivos, modelo, resultado)
           values (gen_random_uuid(), %L, %L, 'arquivos', array[%L]::uuid[], 'm', '{}')$$,
    current_setting('t.a'), current_setting('t.p'), current_setting('t.arq')),
  'ninguém grava direto na tabela');

-- ---------------------------------------------------------------- leitura: vê, não grava, não altera
select tests.entrar('00000000-0000-0000-0000-00000000000e');
select tests.afirmar((select count(*) from analise_ia) = 2, 'quem só lê a obra vê o histórico das leituras');
select tests.deve_falhar(
  format($$select registrar_analise_ia(gen_random_uuid(), %L, 'fotos_diario', 'm', '{}', '{}', %L)$$,
    current_setting('t.p'), current_setting('t.d')),
  'leitura não grava leitura da IA');
select tests.deve_falhar($$update analise_ia set modelo = 'outro'$$, 'ninguém altera uma leitura');
select tests.deve_falhar($$delete from analise_ia$$, 'ninguém apaga uma leitura');

-- ---------------------------------------------------------------- outra empresa
select tests.entrar('00000000-0000-0000-0000-00000000000d');
select tests.afirmar((select count(*) from analise_ia) = 0, 'outra empresa não vê as leituras');
select tests.deve_falhar(
  format($$select registrar_analise_ia(gen_random_uuid(), %L, 'arquivos', 'm', '{}', array[%L]::uuid[])$$,
    current_setting('t.p'), current_setting('t.arq')),
  'outra empresa não grava leitura na obra');

reset role;
select tests.afirmar((select count(*) from audit_log where tabela = 'analise_ia' and acao = 'INSERT') = 2, 'leituras no audit_log');

rollback;
