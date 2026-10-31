-- Testes do sprint 5 (RF-101 a 104): agente da obra, câmeras com senha no Vault,
-- fotos do agente e do celular, pedido de teste, falhas e Storage.
\set ON_ERROR_STOP 1
begin;

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-00000000000a', 'ana@a.test'),    -- admin da empresa A
  ('00000000-0000-0000-0000-00000000000b', 'bruno@a.test'),  -- engenheiro do projeto P
  ('00000000-0000-0000-0000-00000000000c', 'carla@a.test'),  -- mestre no projeto P
  ('00000000-0000-0000-0000-00000000000e', 'edu@a.test'),    -- leitura no projeto P
  ('00000000-0000-0000-0000-00000000000d', 'davi@b.test');   -- admin da empresa B

create or replace function tests.camera(p_nome text)
returns uuid language sql security definer set search_path = '' as $$ select id from public.camera where nome = p_nome; $$;
grant execute on function tests.camera(text) to authenticated, service_role;
create or replace function tests.erro_de(p_sql text)
returns text language plpgsql as $$
begin
  execute p_sql;
  raise exception 'FALHOU: o comando deveria ter falhado: %', p_sql;
exception when others then
  if sqlerrm like 'FALHOU:%' then raise; end if;
  return sqlerrm;
end;
$$;
grant execute on function tests.erro_de(text) to authenticated;
-- A função de borda roda como service_role: os ajudantes de teste também precisam rodar assim.
grant usage on schema tests to service_role;
grant execute on all functions in schema tests to service_role;

set local role authenticated;

-- ---------------------------------------------------------------- cenário
select tests.entrar('00000000-0000-0000-0000-00000000000a');
select set_config('t.empresa_a', criar_empresa('Construtora A')::text, true);
select adicionar_membro_empresa(current_setting('t.empresa_a')::uuid, u) from unnest(array['bruno@a.test','carla@a.test','edu@a.test']) u;
select set_config('t.q', criar_projeto(current_setting('t.empresa_a')::uuid, 'Obra Q')::text, true);

select tests.entrar('00000000-0000-0000-0000-00000000000b');
select set_config('t.p', criar_projeto(current_setting('t.empresa_a')::uuid, 'Residencial Aurora')::text, true);
select adicionar_membro_projeto(current_setting('t.p')::uuid, 'carla@a.test', 'mestre');
select adicionar_membro_projeto(current_setting('t.p')::uuid, 'edu@a.test', 'leitura');

select tests.entrar('00000000-0000-0000-0000-00000000000d');
select set_config('t.empresa_b', criar_empresa('Construtora B')::text, true);

-- ---------------------------------------------------------------- agente (RF-101)
select tests.entrar('00000000-0000-0000-0000-00000000000b');
select set_config('t.agente_json', criar_agente_camera(current_setting('t.p')::uuid, 'PC do escritório')::text, true);
select set_config('t.token', current_setting('t.agente_json')::jsonb ->> 'token', true);
select set_config('t.agente', current_setting('t.agente_json')::jsonb ->> 'id', true);
select tests.afirmar(current_setting('t.token') ~ '^obra_[0-9a-f]{48}$', 'engenheiro cria o agente e recebe o token uma vez');
select tests.deve_falhar($$select token_hash from agente_camera$$, 'app não lê o hash do token');
select tests.afirmar((select nome from agente_camera where id = current_setting('t.agente')::uuid) = 'PC do escritório', 'agente aparece na obra');

select tests.entrar('00000000-0000-0000-0000-00000000000c');
select tests.deve_falhar(format($$select criar_agente_camera(%L, 'Pelo mestre')$$, current_setting('t.p')), 'mestre não cria agente');

-- ---------------------------------------------------------------- câmeras e senha no Vault
select tests.entrar('00000000-0000-0000-0000-00000000000b');
select salvar_camera(null, current_setting('t.p')::uuid, jsonb_build_object(
  'nome', 'Fachada', 'origem', 'agente', 'agente_id', current_setting('t.agente'),
  'endereco', 'http://192.168.1.108/cgi-bin/snapshot.cgi?channel=1', 'usuario', 'admin',
  'horarios', jsonb_build_array('17:00', '07:00', '12:00', '07:00')), 'segredo123');
select salvar_camera(null, current_setting('t.p')::uuid, '{"nome": "Celular do mestre", "origem": "manual", "endereco": "http://x/y", "usuario": "u"}');
select tests.afirmar(
  (select horarios = '{07:00,12:00,17:00}'::time[] and tem_senha and usuario = 'admin' from camera where nome = 'Fachada'),
  'câmera do agente: horários em ordem, sem repetição, com senha');
select tests.afirmar(
  (select origem = 'manual' and endereco is null and usuario is null and agente_id is null and not tem_senha from camera where nome = 'Celular do mestre'),
  'câmera manual não guarda endereço, usuário nem senha');
select tests.deve_falhar($$select senha_id from camera$$, 'app não lê o id da senha');
select tests.deve_falhar($$select decrypted_secret from vault.decrypted_secrets$$, 'app não lê o Vault');

select tests.deve_falhar(format($$select salvar_camera(null, %L, '{"nome": "Muitos", "origem": "manual", "horarios": ["06:00","08:00","10:00","12:00","14:00"]}')$$, current_setting('t.p')),
  'mais de 4 horários por dia é recusado');
select tests.deve_falhar(format($$select salvar_camera(null, %L, '{"nome": "Hora ruim", "origem": "manual", "horarios": ["25:00"]}')$$, current_setting('t.p')),
  'horário 25:00 é recusado');
select tests.deve_falhar(format($$select salvar_camera(null, %L, '{"nome": "Meia-noite", "origem": "manual", "horarios": ["24:00"]}')$$, current_setting('t.p')),
  'horário 24:00 é recusado');
select tests.deve_falhar(format($$select salvar_camera(null, %L, '{"nome": "Sem agente", "origem": "agente", "endereco": "http://192.168.1.10/a"}')$$, current_setting('t.p')),
  'câmera de agente sem agente é recusada');
select tests.deve_falhar(format($$select salvar_camera(null, %L, %L)$$, current_setting('t.p'),
  jsonb_build_object('nome', 'FTP', 'origem', 'agente', 'agente_id', current_setting('t.agente'), 'endereco', 'ftp://192.168.1.10/a')),
  'endereço que não é http(s) nem rtsp é recusado');
-- A admin pode configurar a obra Q, mas o agente é da obra P.
select tests.entrar('00000000-0000-0000-0000-00000000000a');
select tests.afirmar(
  tests.erro_de(format($$select salvar_camera(null, %L, %L)$$, current_setting('t.q'),
    jsonb_build_object('nome', 'Agente de outra obra', 'origem', 'agente', 'agente_id', current_setting('t.agente'), 'endereco', 'http://10.0.0.2/a')))
  = 'Escolha um agente ativo desta obra',
  'agente de outra obra é recusado');
select tests.entrar('00000000-0000-0000-0000-00000000000b');

-- Senha: nulo mantém, vazio apaga, texto troca.
select salvar_camera(tests.camera('Fachada'), current_setting('t.p')::uuid, '{"nome": "Fachada norte"}');
reset role;
select tests.afirmar(
  (select s.decrypted_secret from public.camera c join vault.decrypted_secrets s on s.id = c.senha_id where c.nome = 'Fachada norte') = 'segredo123',
  'renomear a câmera mantém a senha no Vault');
set local role authenticated;
select salvar_camera(tests.camera('Fachada norte'), current_setting('t.p')::uuid, '{}', '');
select tests.afirmar((select not tem_senha from camera where nome = 'Fachada norte'), 'senha vazia apaga a senha');
reset role;
select tests.afirmar((select count(*) from vault.secrets where name like 'camera:%') = 0, 'o segredo sai do Vault');
set local role authenticated;
select salvar_camera(tests.camera('Fachada norte'), current_setting('t.p')::uuid, '{}', 'nova-senha');

select tests.entrar('00000000-0000-0000-0000-00000000000c');
select tests.deve_falhar(format($$select salvar_camera(%L, %L, '{"nome": "Pelo mestre"}')$$, tests.camera('Fachada norte'), current_setting('t.p')),
  'mestre não configura câmera');
select tests.deve_falhar(format($$select pedir_teste_camera(%L)$$, tests.camera('Fachada norte')), 'mestre não pede teste');

select tests.entrar('00000000-0000-0000-0000-00000000000e');
select tests.afirmar((select count(*) from camera where projeto_id = current_setting('t.p')::uuid) = 2, 'leitura vê as câmeras da obra');

select tests.entrar('00000000-0000-0000-0000-00000000000d');
select tests.afirmar(
  (select count(*) from camera) = 0 and (select count(*) from agente_camera) = 0,
  'outra empresa não vê câmeras nem agentes');
select tests.deve_falhar(format($$select salvar_camera(null, %L, '{"nome": "Invasora", "origem": "manual"}')$$, current_setting('t.p')),
  'outra empresa não cria câmera na obra');
select tests.deve_falhar(format($$select agente_config(%L)$$, current_setting('t.token')), 'app não chama as funções do agente');

-- ---------------------------------------------------------------- funções do agente (service_role)
set local role service_role;
select tests.afirmar(
  (select (c -> 'cameras' -> 0 ->> 'senha') = 'nova-senha'
      and jsonb_array_length(c -> 'cameras') = 1
      and (c -> 'cameras' -> 0 -> 'horarios') = '["07:00", "12:00", "17:00"]'::jsonb
      and (c -> 'cameras' -> 0 ->> 'teste')::boolean is false
      and (c ->> 'projeto_id') = current_setting('t.p')
     from (select agente_config(current_setting('t.token'), '1.0.0') c) x),
  'agente recebe só as câmeras dele, com senha e horários');
select tests.afirmar(agente_config('obra_token_errado') is null, 'token errado não recebe nada');
select tests.afirmar(
  agente_pasta_camera(current_setting('t.token'), tests.camera('Fachada norte')) = current_setting('t.p') || '/' || tests.camera('Fachada norte'),
  'pasta da foto é <projeto>/<câmera>');
select tests.afirmar(agente_pasta_camera(current_setting('t.token'), tests.camera('Celular do mestre')) is null, 'agente não grava em câmera que não é dele');

select agente_registrar_foto(current_setting('t.token'), tests.camera('Fachada norte'),
  format('%s/%s/2026-10-31/070000.jpg', current_setting('t.p'), tests.camera('Fachada norte')), now() - interval '1 minute', 123456);
select tests.deve_falhar(format($$select agente_registrar_foto(%L, %L, %L, now())$$,
  current_setting('t.token'), tests.camera('Fachada norte'), current_setting('t.q') || '/x/1.jpg'), 'agente não grava fora da pasta da câmera');
select tests.deve_falhar(format($$select agente_registrar_foto(%L, %L, %L, now())$$,
  current_setting('t.token'), tests.camera('Celular do mestre'), current_setting('t.p') || '/x/1.jpg'), 'agente não registra foto de câmera alheia');
select tests.deve_falhar(format($$select agente_registrar_foto(%L, %L, %L, now() + interval '1 hour')$$,
  current_setting('t.token'), tests.camera('Fachada norte'), format('%s/%s/futuro.jpg', current_setting('t.p'), tests.camera('Fachada norte'))),
  'foto com horário futuro é recusada');
select tests.afirmar(agente_registrar_falha(current_setting('t.token'), tests.camera('Fachada norte'), 'Tempo esgotado') = 1, 'primeira falha conta 1');
select tests.afirmar(agente_registrar_falha(current_setting('t.token'), tests.camera('Fachada norte'), '401 senha errada') = 2, 'segunda falha conta 2 (a tela alerta)');

reset role;
select tests.afirmar(
  (select count(*) = 1 and bool_and(origem = 'agente' and data = (capturada_em at time zone 'America/Sao_Paulo')::date and tamanho_bytes = 123456)
     from public.foto_camera),
  'foto do agente entra com o dia de Brasília');
select tests.afirmar(
  (select ultima_foto_em is not null and falhas_seguidas = 2 and ultimo_erro = '401 senha errada' from public.camera where nome = 'Fachada norte'),
  'câmera guarda a última foto, as falhas seguidas e o último erro');
select tests.afirmar(
  (select ultimo_contato_em is not null and versao = '1.0.0' from public.agente_camera),
  'agente marca o contato e a versão');

set local role service_role;
select agente_registrar_foto(current_setting('t.token'), tests.camera('Fachada norte'),
  format('%s/%s/2026-10-31/120000.jpg', current_setting('t.p'), tests.camera('Fachada norte')), now(), 98765);
reset role;
select tests.afirmar((select falhas_seguidas from public.camera where nome = 'Fachada norte') = 0, 'foto boa zera as falhas');

-- Teste de foto: o engenheiro pede, o agente responde, a foto não entra na galeria.
set local role authenticated;
select tests.entrar('00000000-0000-0000-0000-00000000000b');
select pedir_teste_camera(tests.camera('Fachada norte'));
select tests.deve_falhar(format($$select pedir_teste_camera(%L)$$, tests.camera('Celular do mestre')), 'câmera manual não faz teste pelo agente');
set local role service_role;
select tests.afirmar(
  (agente_config(current_setting('t.token')) -> 'cameras' -> 0 ->> 'teste')::boolean,
  'agente vê o pedido de teste');
select agente_registrar_foto(current_setting('t.token'), tests.camera('Fachada norte'),
  format('%s/%s/teste.jpg', current_setting('t.p'), tests.camera('Fachada norte')), now(), 1000, true);
select tests.afirmar(
  (agente_config(current_setting('t.token')) -> 'cameras' -> 0 ->> 'teste')::boolean is false,
  'depois de respondido, o pedido some');
reset role;
select tests.afirmar(
  (select teste_respondido_em is not null and teste_caminho like '%/teste.jpg' and teste_erro is null from public.camera where nome = 'Fachada norte')
  and (select count(*) from public.foto_camera) = 2,
  'teste guarda a foto do teste fora da galeria');

-- ---------------------------------------------------------------- foto pelo celular
set local role authenticated;
select tests.entrar('00000000-0000-0000-0000-00000000000c');
select registrar_foto_camera('00000000-0000-4000-8000-000000000001', tests.camera('Celular do mestre'),
  format('%s/%s/manual-1.jpg', current_setting('t.p'), tests.camera('Celular do mestre')), now() - interval '2 hours', 2048);
select registrar_foto_camera('00000000-0000-4000-8000-000000000001', tests.camera('Celular do mestre'),
  format('%s/%s/manual-1.jpg', current_setting('t.p'), tests.camera('Celular do mestre')));
select tests.afirmar(
  (select count(*) from foto_camera where camera_id = tests.camera('Celular do mestre')) = 1
  and (select origem = 'manual' and enviada_por = '00000000-0000-0000-0000-00000000000c' from foto_camera where id = '00000000-0000-4000-8000-000000000001'),
  'mestre manda foto pelo celular; reenviar não duplica');
select tests.deve_falhar(format($$select registrar_foto_camera(gen_random_uuid(), %L, %L)$$,
  tests.camera('Celular do mestre'), current_setting('t.q') || '/x/1.jpg'), 'foto fora da pasta da câmera é recusada');
select tests.deve_falhar(format($$select registrar_foto_camera(gen_random_uuid(), %L, %L, now() + interval '1 day')$$,
  tests.camera('Celular do mestre'), format('%s/%s/futuro.jpg', current_setting('t.p'), tests.camera('Celular do mestre'))), 'foto do futuro é recusada');
select tests.deve_falhar(format($$select excluir_foto_camera(%L)$$, '00000000-0000-4000-8000-000000000001'), 'mestre não apaga foto da galeria');
select tests.deve_falhar($$insert into foto_camera (empresa_id, projeto_id, camera_id, caminho, capturada_em, data, origem) select empresa_id, projeto_id, camera_id, 'x', now(), current_date, 'manual' from foto_camera limit 1$$,
  'app não grava foto direto na tabela');

select tests.entrar('00000000-0000-0000-0000-00000000000e');
select tests.deve_falhar(format($$select registrar_foto_camera(gen_random_uuid(), %L, %L)$$,
  tests.camera('Celular do mestre'), format('%s/%s/leitura.jpg', current_setting('t.p'), tests.camera('Celular do mestre'))), 'leitura não manda foto');
select tests.afirmar((select count(*) from foto_camera) = 3, 'leitura vê as fotos da obra');

select tests.entrar('00000000-0000-0000-0000-00000000000d');
select tests.afirmar((select count(*) from foto_camera) = 0, 'outra empresa não vê as fotos');

select tests.entrar('00000000-0000-0000-0000-00000000000b');
select tests.afirmar(
  excluir_foto_camera('00000000-0000-4000-8000-000000000001') like current_setting('t.p') || '/%/manual-1.jpg',
  'engenheiro tira a foto da galeria e recebe o caminho do arquivo');

-- ---------------------------------------------------------------- Storage
select tests.entrar('00000000-0000-0000-0000-00000000000c');
insert into storage.objects (bucket_id, name) values ('cameras', format('%s/%s/celular.jpg', current_setting('t.p'), tests.camera('Celular do mestre')));
select tests.deve_falhar(format($$insert into storage.objects (bucket_id, name) values ('cameras', %L)$$,
  format('%s/%s/x.jpg', current_setting('t.q'), tests.camera('Celular do mestre'))), 'arquivo em pasta de outra obra é recusado');
select tests.afirmar(
  tests.linhas_afetadas($$delete from storage.objects where bucket_id = 'cameras'$$) = 0, 'mestre não apaga arquivo de câmera');

select tests.entrar('00000000-0000-0000-0000-00000000000e');
select tests.deve_falhar(format($$insert into storage.objects (bucket_id, name) values ('cameras', %L)$$,
  format('%s/%s/leitura.jpg', current_setting('t.p'), tests.camera('Celular do mestre'))), 'leitura não envia arquivo');
select tests.afirmar((select count(*) from storage.objects where bucket_id = 'cameras') = 1, 'leitura vê o arquivo');

select tests.entrar('00000000-0000-0000-0000-00000000000d');
select tests.afirmar((select count(*) from storage.objects where bucket_id = 'cameras') = 0, 'outra empresa não vê o arquivo');

select tests.entrar('00000000-0000-0000-0000-00000000000b');
select tests.afirmar(tests.linhas_afetadas($$delete from storage.objects where bucket_id = 'cameras'$$) = 1, 'engenheiro apaga o arquivo');

-- ---------------------------------------------------------------- revogar o agente
select revogar_agente_camera(current_setting('t.agente')::uuid);
set local role service_role;
select tests.afirmar(agente_config(current_setting('t.token')) is null, 'agente revogado não recebe mais a configuração');
select tests.deve_falhar(format($$select agente_registrar_foto(%L, %L, %L, now())$$,
  current_setting('t.token'), tests.camera('Fachada norte'), format('%s/%s/depois.jpg', current_setting('t.p'), tests.camera('Fachada norte'))),
  'agente revogado não envia foto');

-- ---------------------------------------------------------------- auditoria
reset role;
select tests.afirmar(
  (select count(*) from audit_log where tabela = 'agente_camera') = 2,
  'agente: cadastro e revogação no audit_log; o contato periódico não');
select tests.afirmar(
  (select count(*) from audit_log where tabela = 'camera' and acao = 'UPDATE') = 4,
  'câmera: só mudanças de configuração no audit_log (senha inicial, renomear, apagar e trocar a senha), não as capturas');
select tests.afirmar(
  (select count(*) from audit_log where tabela = 'foto_camera' and acao = 'DELETE') = 1,
  'foto tirada da galeria fica no audit_log');

rollback;
