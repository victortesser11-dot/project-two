-- Arquivos da obra: engenheiro envia, corrige e apaga; mestre e leitura só leem e baixam;
-- outra empresa não vê; caminho, extensão e chegada ao Storage conferidos; tudo no audit_log.
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

select set_config('t.id', '30000000-0000-4000-8000-000000000001', true);
select set_config('t.caminho', current_setting('t.p') || '/' || current_setting('t.id') || '/planta-baixa.dwg', true);

-- ---------------------------------------------------------------- envio pelo engenheiro
select tests.entrar('00000000-0000-0000-0000-00000000000b');
select tests.deve_falhar(
  format($$select registrar_arquivo_obra(%L, %L, %L, 'Planta baixa.dwg', 'arquitetonico', 1024)$$,
    current_setting('t.id'), current_setting('t.p'), current_setting('t.caminho')),
  'registrar sem o arquivo no Storage é recusado');
select tests.afirmar(
  tests.linhas_afetadas(format($$insert into storage.objects (bucket_id, name) values ('arquivos', %L)$$, current_setting('t.caminho'))) = 1,
  'engenheiro envia o DWG para a pasta da obra');
select tests.afirmar(
  registrar_arquivo_obra(current_setting('t.id')::uuid, current_setting('t.p')::uuid, current_setting('t.caminho'),
    'Planta baixa.dwg', 'arquitetonico', 1024, 'image/vnd.dwg', 'Revisão 02') = current_setting('t.id')::uuid,
  'engenheiro registra o arquivo');
select tests.afirmar(
  registrar_arquivo_obra(current_setting('t.id')::uuid, current_setting('t.p')::uuid, current_setting('t.caminho'),
    'Planta baixa.dwg', 'arquitetonico', 1024) = current_setting('t.id')::uuid
  and (select count(*) from arquivo_obra) = 1,
  'reenvio com o mesmo id não duplica');
select tests.afirmar(
  (select enviado_nome = 'bruno@a.test' and descricao = 'Revisão 02' and categoria = 'arquitetonico' from arquivo_obra),
  'guarda quem enviou, a pasta e a descrição');

select tests.deve_falhar(
  format($$insert into storage.objects (bucket_id, name) values ('arquivos', %L)$$,
    current_setting('t.p') || '/' || gen_random_uuid() || '/virus.exe'),
  'executável não entra no Storage');
select tests.deve_falhar(
  $$insert into storage.objects (bucket_id, name) values ('arquivos', 'qualquer/coisa.pdf')$$,
  'caminho fora do padrão é recusado (sem erro de conversão)');
select tests.deve_falhar(
  format($$insert into storage.objects (bucket_id, name) values ('arquivos', %L)$$,
    current_setting('t.p') || '/' || gen_random_uuid() || '/sub/pasta.pdf'),
  'subpasta extra é recusada');
select tests.deve_falhar(
  format($$select registrar_arquivo_obra(%L, %L, %L, 'Planta.dwg', 'arquitetonico', 10)$$,
    '30000000-0000-4000-8000-000000000002', current_setting('t.p2'), current_setting('t.caminho')),
  'caminho de outra obra não é registrado');
select tests.linhas_afetadas(format($$insert into storage.objects (bucket_id, name) values ('arquivos', %L)$$,
  current_setting('t.p') || '/30000000-0000-4000-8000-000000000003/grande.pdf'));
select tests.deve_falhar(
  format($$select registrar_arquivo_obra(%L, %L, %L, 'Grande.pdf', 'outros', 60000000)$$,
    '30000000-0000-4000-8000-000000000003', current_setting('t.p'),
    current_setting('t.p') || '/30000000-0000-4000-8000-000000000003/grande.pdf'),
  'arquivo acima de 50 MB é recusado');

-- edição
select editar_arquivo_obra(current_setting('t.id')::uuid, 'Planta baixa - térreo.dwg', 'arquitetonico', null);
select tests.afirmar((select nome = 'Planta baixa - térreo.dwg' and descricao is null from arquivo_obra), 'engenheiro corrige nome e descrição');
select tests.deve_falhar(
  format($$select editar_arquivo_obra(%L, 'Planta baixa.pdf', 'arquitetonico')$$, current_setting('t.id')),
  'o nome mantém a extensão do arquivo');

-- ---------------------------------------------------------------- mestre: envia e manda nova versão
select tests.entrar('00000000-0000-0000-0000-00000000000c');
select tests.afirmar((select count(*) from arquivo_obra) = 1, 'mestre vê os arquivos da obra');
select set_config('t.v2', '30000000-0000-4000-8000-000000000010', true);
select set_config('t.cv2', current_setting('t.p') || '/' || current_setting('t.v2') || '/planta-baixa-rev03.dwg', true);
select tests.afirmar(
  tests.linhas_afetadas(format($$insert into storage.objects (bucket_id, name) values ('arquivos', %L)$$, current_setting('t.cv2'))) = 1,
  'mestre envia arquivo para a obra');
select tests.afirmar(
  registrar_arquivo_obra(current_setting('t.v2')::uuid, current_setting('t.p')::uuid, current_setting('t.cv2'),
    'Planta baixa rev03.dwg', 'outros', 2048, null, 'Revisão 03', current_setting('t.id')::uuid) = current_setting('t.v2')::uuid,
  'mestre registra uma nova versão da planta');
select tests.afirmar(
  (select versao = 2 and documento_id = current_setting('t.id')::uuid and categoria = 'arquitetonico'
     from arquivo_obra where id = current_setting('t.v2')::uuid),
  'nova versão é a 2, no mesmo documento e na mesma pasta (a pasta pedida é ignorada)');
select tests.afirmar(
  (select versao = 1 from arquivo_obra where id = current_setting('t.id')::uuid),
  'a versão 1 continua guardada');
select tests.deve_falhar(
  format($$select registrar_arquivo_obra(%L, %L, %L, 'X.pdf', 'outros', 10, null, null, %L)$$,
    '30000000-0000-4000-8000-000000000011', current_setting('t.p2'),
    current_setting('t.p2') || '/30000000-0000-4000-8000-000000000011/x.pdf', current_setting('t.id')),
  'versão não pode apontar para arquivo de outra obra');
select tests.deve_falhar(format($$select excluir_arquivo_obra(%L)$$, current_setting('t.id')), 'mestre não apaga arquivo');
select tests.deve_falhar(
  format($$select editar_arquivo_obra(%L, 'X.dwg', 'outros')$$, current_setting('t.id')), 'mestre não corrige nome nem pasta');
select tests.afirmar(
  tests.linhas_afetadas(format($$delete from storage.objects where bucket_id = 'arquivos' and name = %L$$, current_setting('t.cv2'))) = 0,
  'mestre não apaga do Storage um arquivo já registrado');
select set_config('t.solto', current_setting('t.p') || '/' || gen_random_uuid() || '/croqui.pdf', true);
select tests.linhas_afetadas(format($$insert into storage.objects (bucket_id, name) values ('arquivos', %L)$$, current_setting('t.solto')));
select tests.afirmar(
  tests.linhas_afetadas(format($$delete from storage.objects where bucket_id = 'arquivos' and name = %L$$, current_setting('t.solto'))) = 1,
  'mestre apaga o próprio envio que não chegou a ser registrado (limpeza)');

select tests.entrar('00000000-0000-0000-0000-00000000000e');
select tests.afirmar(
  (select count(*) from arquivo_obra) = 2
  and exists (select 1 from storage.objects where bucket_id = 'arquivos' and name = current_setting('t.caminho')),
  'leitura vê o registro e o arquivo no Storage (para baixar)');
select tests.deve_falhar(
  format($$select editar_arquivo_obra(%L, 'X.dwg', 'outros')$$, current_setting('t.id')), 'leitura não edita');
select tests.deve_falhar($$update arquivo_obra set nome = 'x.pdf'$$, 'ninguém altera a tabela direto');
select tests.afirmar(
  tests.linhas_afetadas(format($$delete from storage.objects where bucket_id = 'arquivos' and name = %L$$, current_setting('t.caminho'))) = 0,
  'leitura não apaga o arquivo do Storage');

-- ---------------------------------------------------------------- outra empresa
select tests.entrar('00000000-0000-0000-0000-00000000000d');
select tests.afirmar(
  (select count(*) from arquivo_obra) = 0 and (select count(*) from storage.objects where bucket_id = 'arquivos') = 0,
  'outra empresa não vê os arquivos');
select tests.deve_falhar(
  format($$insert into storage.objects (bucket_id, name) values ('arquivos', %L)$$,
    current_setting('t.p') || '/' || gen_random_uuid() || '/invasao.pdf'),
  'outra empresa não envia para a obra');
select tests.deve_falhar(format($$select excluir_arquivo_obra(%L)$$, current_setting('t.id')), 'outra empresa não apaga');

-- ---------------------------------------------------------------- exclusão pelo engenheiro
select tests.entrar('00000000-0000-0000-0000-00000000000b');
select editar_arquivo_obra(current_setting('t.v2')::uuid, 'Planta baixa rev03.dwg', 'estrutural');
select tests.afirmar(
  (select bool_and(categoria = 'estrutural') from arquivo_obra where documento_id = current_setting('t.id')::uuid),
  'mudar de pasta leva todas as versões');
select tests.afirmar(excluir_arquivo_obra(current_setting('t.v2')::uuid) = current_setting('t.cv2'), 'excluir a versão 2 devolve o caminho');
select tests.afirmar(
  (select count(*) = 1 and max(versao) = 1 from arquivo_obra where documento_id = current_setting('t.id')::uuid),
  'sem a versão 2, a 1 volta a valer');
select tests.afirmar(excluir_arquivo_obra(current_setting('t.id')::uuid) = current_setting('t.caminho'), 'excluir devolve o caminho');
select tests.afirmar(
  tests.linhas_afetadas(format($$delete from storage.objects where bucket_id = 'arquivos' and name = %L$$, current_setting('t.caminho'))) = 1,
  'engenheiro apaga o arquivo do Storage');
select tests.afirmar((select count(*) from arquivo_obra) = 0, 'arquivo saiu da obra');

reset role;
select tests.afirmar(
  (select count(*) from audit_log where tabela = 'arquivo_obra') >= 6,
  'envios, correções e exclusões no audit_log');

rollback;
