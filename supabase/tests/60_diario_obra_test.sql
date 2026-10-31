-- Testes do RF-203: diário de obra, equipe, fotos (tabela e Storage),
-- assinatura com hash, imutabilidade depois de assinado, permissões e auditoria.
\set ON_ERROR_STOP 1
begin;

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-00000000000a', 'ana@a.test'),    -- admin da empresa A
  ('00000000-0000-0000-0000-00000000000b', 'bruno@a.test'),  -- engenheiro do projeto P
  ('00000000-0000-0000-0000-00000000000c', 'carla@a.test'),  -- mestre no projeto P
  ('00000000-0000-0000-0000-00000000000e', 'edu@a.test'),    -- leitura no projeto P
  ('00000000-0000-0000-0000-00000000000d', 'davi@b.test');   -- admin da empresa B

create or replace function tests.hoje(p_dias integer default 0)
returns date language sql as $$ select (now() at time zone 'America/Sao_Paulo')::date + p_dias; $$;
grant execute on function tests.hoje(integer) to authenticated;

-- O bucket existe (criado pela migração).
select tests.afirmar(exists (select 1 from storage.buckets where id = 'diario' and public is false), 'bucket "diario" é privado');

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
select set_config('t.tarefa', criar_item_eap(current_setting('t.p')::uuid, 'tarefa', 'Alvenaria', null,
  '{"inicio_previsto":"2026-11-01","fim_previsto":"2026-11-30"}')::text, true);

select tests.entrar('00000000-0000-0000-0000-00000000000d');
select set_config('t.empresa_b', criar_empresa('Construtora B')::text, true);

-- ---------------------------------------------------------------- preencher
select tests.entrar('00000000-0000-0000-0000-00000000000c');
select set_config('t.d', salvar_diario(current_setting('t.p')::uuid, tests.hoje(),
  '{"clima_manha":"sol","clima_tarde":"chuva","praticavel_tarde":false,"temp_min":"18","temp_max":"27.5","chuva_mm":"12","clima_automatico":true}')::text, true);
select tests.afirmar(
  (select clima_manha::text || '/' || clima_tarde::text || '/' || praticavel_tarde || '/' || temp_max
     from diario_obra where id = current_setting('t.d')::uuid) = 'sol/chuva/false/27.5',
  'mestre cria o diário do dia com o clima');
select tests.afirmar(
  salvar_diario(current_setting('t.p')::uuid, tests.hoje(), '{"ocorrencias":"  Chuva forte às 14h parou a alvenaria.  "}')
    = current_setting('t.d')::uuid,
  'salvar de novo no mesmo dia atualiza o mesmo diário');
select tests.afirmar(
  (select clima_tarde::text || ' | ' || ocorrencias from diario_obra where id = current_setting('t.d')::uuid)
    = 'chuva | Chuva forte às 14h parou a alvenaria.',
  'só as chaves enviadas mudam (o clima ficou)');
select tests.deve_falhar(
  format($$select salvar_diario(%L, %L)$$, current_setting('t.p'), tests.hoje(1)),
  'diário de dia futuro é recusado');
select tests.deve_falhar(
  format($$select salvar_diario(%L, %L, '{"assinado_nome":"eu"}')$$, current_setting('t.p'), tests.hoje()),
  'campos fora da lista são recusados');
select tests.deve_falhar(
  format($$select salvar_diario(%L, %L, '{"temp_min":"30","temp_max":"20"}')$$, current_setting('t.p'), tests.hoje(-1)),
  'máxima menor que a mínima é recusada');

select tests.afirmar(
  definir_efetivo(current_setting('t.d')::uuid,
    '[{"funcao":"Pedreiro","quantidade":4},{"funcao":"Servente","empresa_terceira":"Empreiteira Silva","quantidade":6}]') = 10,
  'equipe do dia soma 10 pessoas');
select tests.afirmar(definir_efetivo(current_setting('t.d')::uuid, '[{"funcao":"Pedreiro","quantidade":5}]') = 5,
  'definir de novo devolve o novo total');
select tests.afirmar((select count(*) from diario_efetivo where diario_id = current_setting('t.d')::uuid) = 1,
  'e substitui a equipe anterior');
select tests.deve_falhar(
  format($$select definir_efetivo(%L, '[{"funcao":"Pedreiro","quantidade":0}]')$$, current_setting('t.d')),
  'quantidade zero é recusada');

-- ---------------------------------------------------------------- fotos (Storage + registro)
select set_config('t.caminho', current_setting('t.p') || '/' || current_setting('t.d') || '/foto1.jpg', true);
select tests.afirmar(
  tests.linhas_afetadas(format($$insert into storage.objects (bucket_id, name) values ('diario', %L)$$, current_setting('t.caminho'))) = 1,
  'mestre envia a foto para a pasta do diário');
select tests.deve_falhar(
  format($$insert into storage.objects (bucket_id, name) values ('diario', %L)$$,
    current_setting('t.p') || '/' || gen_random_uuid() || '/x.jpg'),
  'foto em pasta de diário que não existe é recusada');
select tests.deve_falhar(
  $$insert into storage.objects (bucket_id, name) values ('diario', 'qualquer/coisa.jpg')$$,
  'caminho fora do padrão é recusado (sem erro de conversão)');
select tests.afirmar(
  registrar_foto_diario('20000000-0000-4000-8000-000000000001', current_setting('t.d')::uuid, current_setting('t.caminho'),
    'Fiada 12 do bloco B', current_setting('t.tarefa')::uuid) = '20000000-0000-4000-8000-000000000001',
  'foto registrada com legenda e tarefa');
select tests.afirmar(
  registrar_foto_diario('20000000-0000-4000-8000-000000000001', current_setting('t.d')::uuid, current_setting('t.caminho')) is not null
  and (select count(*) from diario_foto where diario_id = current_setting('t.d')::uuid) = 1,
  'reenviar o registro da mesma foto não duplica');
select tests.deve_falhar(
  format($$select registrar_foto_diario(gen_random_uuid(), %L, %L)$$, current_setting('t.d'),
    current_setting('t.empresa_b') || '/x/y.jpg'),
  'caminho de outra obra não é registrado');

-- ---------------------------------------------------------------- permissões
select tests.entrar('00000000-0000-0000-0000-00000000000e');
select tests.afirmar(
  (select count(*) from diario_obra where projeto_id = current_setting('t.p')::uuid) = 1
  and (select count(*) from diario_efetivo where diario_id = current_setting('t.d')::uuid) = 1
  and (select count(*) from diario_foto where diario_id = current_setting('t.d')::uuid) = 1,
  'leitura vê diário, equipe e fotos');
select tests.afirmar(
  (select count(*) from storage.objects where bucket_id = 'diario') = 1,
  'leitura vê o arquivo da foto no Storage');
select tests.deve_falhar(
  format($$select salvar_diario(%L, %L, '{"observacoes":"x"}')$$, current_setting('t.p'), tests.hoje()),
  'leitura não preenche o diário');
select tests.deve_falhar(
  format($$insert into storage.objects (bucket_id, name) values ('diario', %L)$$,
    current_setting('t.p') || '/' || current_setting('t.d') || '/intruso.jpg'),
  'leitura não envia foto');
select tests.deve_falhar(
  format($$update diario_obra set ocorrencias = 'x' where id = %L$$, current_setting('t.d')),
  'cliente não altera o diário direto na tabela');

select tests.entrar('00000000-0000-0000-0000-00000000000d');
select tests.afirmar(
  (select count(*) from diario_obra where projeto_id = current_setting('t.p')::uuid) = 0
  and (select count(*) from storage.objects where bucket_id = 'diario') = 0,
  'outra empresa não vê o diário nem as fotos');
select tests.deve_falhar(
  format($$select salvar_diario(%L, %L)$$, current_setting('t.p'), tests.hoje()),
  'outra empresa não cria diário na obra');

select tests.entrar('00000000-0000-0000-0000-00000000000c');
select tests.deve_falhar(
  format($$select assinar_diario(%L)$$, current_setting('t.d')),
  'mestre não assina');

-- ---------------------------------------------------------------- assinatura
select tests.entrar('00000000-0000-0000-0000-00000000000b');
select registrar_avanco('30000000-0000-4000-8000-000000000001', current_setting('t.tarefa')::uuid, tests.hoje(), 15);
select set_config('t.vazio', salvar_diario(current_setting('t.p')::uuid, tests.hoje(-1))::text, true);
select tests.deve_falhar(
  format($$select assinar_diario(%L)$$, current_setting('t.vazio')),
  'diário sem clima não é assinado');

select set_config('t.hash', assinar_diario(current_setting('t.d')::uuid), true);
select tests.afirmar(current_setting('t.hash') ~ '^[0-9a-f]{64}$', 'assinar devolve o SHA-256 do conteúdo');
select tests.afirmar(
  (select status::text || ' ' || assinado_nome || ' ' || (conteudo_assinado -> 'efetivo' -> 0 ->> 'quantidade')
          || ' ' || (conteudo_assinado -> 'avancos' -> 0 ->> 'percentual') || ' ' || jsonb_array_length(conteudo_assinado -> 'fotos')
     from diario_obra where id = current_setting('t.d')::uuid) = 'assinado bruno@a.test 5 15.00 1',
  'retrato assinado traz equipe, avanços do dia e fotos, com o nome de quem assinou');
select tests.afirmar(
  (select hash_conteudo = encode(extensions.digest(convert_to(conteudo_assinado::text, 'UTF8'), 'sha256'), 'hex')
     from diario_obra where id = current_setting('t.d')::uuid),
  'o hash confere com o retrato guardado');

select tests.deve_falhar(
  format($$select assinar_diario(%L)$$, current_setting('t.d')), 'não assina duas vezes');
select tests.deve_falhar(
  format($$select salvar_diario(%L, %L, '{"ocorrencias":"mudei"}')$$, current_setting('t.p'), tests.hoje()),
  'diário assinado não muda');
select tests.deve_falhar(
  format($$select definir_efetivo(%L, '[]')$$, current_setting('t.d')), 'equipe de diário assinado não muda');
select tests.deve_falhar(
  format($$select excluir_foto_diario('20000000-0000-4000-8000-000000000001')$$), 'foto de diário assinado não sai');
select tests.afirmar(
  tests.linhas_afetadas(format($$delete from storage.objects where bucket_id = 'diario' and name = %L$$, current_setting('t.caminho'))) = 0,
  'arquivo de diário assinado não é apagado do Storage');

-- ---------------------------------------------------------------- foto em rascunho sai
select tests.entrar('00000000-0000-0000-0000-00000000000c');
select set_config('t.caminho2', current_setting('t.p') || '/' || current_setting('t.vazio') || '/foto2.jpg', true);
select tests.linhas_afetadas(format($$insert into storage.objects (bucket_id, name) values ('diario', %L)$$, current_setting('t.caminho2')));
select registrar_foto_diario('20000000-0000-4000-8000-000000000002', current_setting('t.vazio')::uuid, current_setting('t.caminho2'));
select tests.afirmar(
  excluir_foto_diario('20000000-0000-4000-8000-000000000002') = current_setting('t.caminho2'),
  'excluir foto de rascunho devolve o caminho do arquivo');
select tests.afirmar(
  tests.linhas_afetadas(format($$delete from storage.objects where bucket_id = 'diario' and name = %L$$, current_setting('t.caminho2'))) = 1,
  'e o arquivo do rascunho pode ser apagado');

-- ---------------------------------------------------------------- auditoria
reset role;
select tests.afirmar(
  exists (select 1 from audit_log where tabela = 'diario_obra' and acao = 'UPDATE'
             and antes ->> 'status' = 'rascunho' and depois ->> 'status' = 'assinado'),
  'a assinatura fica no audit_log');
select tests.afirmar(
  (select count(*) from audit_log where tabela = 'diario_efetivo') >= 3
  and (select count(*) from audit_log where tabela = 'diario_foto') = 3,
  'equipe e fotos ficam no audit_log');

-- Exclusão do projeto leva o diário assinado junto (cascata permitida).
select tests.afirmar(
  tests.linhas_afetadas(format($$delete from projeto where id = %L$$, current_setting('t.p'))) = 1,
  'a obra com diário assinado pode ser excluída');
select tests.afirmar(
  not exists (select 1 from diario_obra where projeto_id = current_setting('t.p')::uuid),
  'e leva os diários junto, inclusive os assinados');

rollback;
