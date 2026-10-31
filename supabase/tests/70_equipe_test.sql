-- Testes do sprint 3 (RF-301 a 303): empreiteiras, pessoas (CPF mascarado),
-- custo com vigência, equipe da obra, chamada e custo de mão de obra.
\set ON_ERROR_STOP 1
begin;

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-00000000000a', 'ana@a.test'),    -- admin da empresa A
  ('00000000-0000-0000-0000-00000000000b', 'bruno@a.test'),  -- engenheiro do projeto P
  ('00000000-0000-0000-0000-00000000000c', 'carla@a.test'),  -- mestre no projeto P
  ('00000000-0000-0000-0000-00000000000f', 'fabio@a.test'),  -- financeiro no projeto P
  ('00000000-0000-0000-0000-00000000000e', 'edu@a.test'),    -- leitura no projeto P
  ('00000000-0000-0000-0000-00000000000d', 'davi@b.test');   -- admin da empresa B

create or replace function tests.hoje(p_dias integer default 0)
returns date language sql as $$ select (now() at time zone 'America/Sao_Paulo')::date + p_dias; $$;
create or replace function tests.pessoa(p_nome text)
returns uuid language sql as $$ select id from public.trabalhador where nome = p_nome; $$;
create or replace function tests.tarefa(p_nome text)
returns uuid language sql as $$ select id from public.eap_item where nome = p_nome; $$;
grant execute on function tests.hoje(integer), tests.pessoa(text), tests.tarefa(text) to authenticated;

select tests.afirmar(app.cpf_valido('52998224725') and not app.cpf_valido('12345678900') and not app.cpf_valido('11111111111'),
  'CPF validado pelos dígitos verificadores');

set local role authenticated;

-- ---------------------------------------------------------------- cenário
select tests.entrar('00000000-0000-0000-0000-00000000000a');
select set_config('t.empresa_a', criar_empresa('Construtora A')::text, true);
select adicionar_membro_empresa(current_setting('t.empresa_a')::uuid, u) from unnest(array['bruno@a.test','carla@a.test','fabio@a.test','edu@a.test']) u;

select tests.entrar('00000000-0000-0000-0000-00000000000b');
select set_config('t.p', criar_projeto(current_setting('t.empresa_a')::uuid, 'Residencial Aurora')::text, true);
select adicionar_membro_projeto(current_setting('t.p')::uuid, 'carla@a.test', 'mestre');
select adicionar_membro_projeto(current_setting('t.p')::uuid, 'fabio@a.test', 'financeiro');
select adicionar_membro_projeto(current_setting('t.p')::uuid, 'edu@a.test', 'leitura');
select criar_item_eap(current_setting('t.p')::uuid, 'tarefa', 'Alvenaria', null, '{"unidade":"m²"}');
select criar_item_eap(current_setting('t.p')::uuid, 'tarefa', 'Reboco');

select tests.entrar('00000000-0000-0000-0000-00000000000d');
select set_config('t.empresa_b', criar_empresa('Construtora B')::text, true);
select set_config('t.q', criar_projeto(current_setting('t.empresa_b')::uuid, 'Galpão B')::text, true);
select set_config('t.tarefa_b', criar_item_eap(current_setting('t.q')::uuid, 'tarefa', 'Tarefa de B')::text, true);
insert into empreiteira (empresa_id, nome) values (current_setting('t.empresa_b')::uuid, 'Empreiteira de B');
select set_config('t.emp_b', (select id from empreiteira where nome = 'Empreiteira de B')::text, true);
insert into trabalhador (empresa_id, nome, funcao) values (current_setting('t.empresa_b')::uuid, 'Pessoa de B', 'Servente');

-- ---------------------------------------------------------------- cadastro (RF-301)
select tests.entrar('00000000-0000-0000-0000-00000000000b');
insert into empreiteira (empresa_id, nome, cnpj, situacao_cnpj)
values (current_setting('t.empresa_a')::uuid, 'Empreiteira Silva', '11222333000181', 'ATIVA');
select set_config('t.emp', (select id from empreiteira where nome = 'Empreiteira Silva')::text, true);
select tests.afirmar(current_setting('t.emp') <> '', 'engenheiro cadastra empreiteira da empresa');

insert into trabalhador (empresa_id, nome, cpf, funcao) values (current_setting('t.empresa_a')::uuid, 'João Pedreiro', '52998224725', 'Pedreiro');
insert into trabalhador (empresa_id, nome, cpf, funcao, empreiteira_id)
values (current_setting('t.empresa_a')::uuid, 'Zé Servente', '11144477735', 'Servente', current_setting('t.emp')::uuid);
insert into trabalhador (empresa_id, nome, funcao) values (current_setting('t.empresa_a')::uuid, 'Maria Azulejista', 'Azulejista');
insert into trabalhador (empresa_id, nome, funcao) values (current_setting('t.empresa_a')::uuid, 'Fora da Obra', 'Pintor');

select tests.afirmar(
  (select cpf_mascarado from trabalhador where nome = 'João Pedreiro') = '***.982.247-**',
  'CPF aparece mascarado');
select tests.deve_falhar($$select cpf from trabalhador limit 1$$, 'cliente não lê o CPF completo');
select tests.deve_falhar(
  format($$insert into trabalhador (empresa_id, nome, cpf, funcao) values (%L, 'CPF Errado', '12345678900', 'Pedreiro')$$, current_setting('t.empresa_a')),
  'CPF inválido é recusado');
select tests.deve_falhar(
  format($$insert into trabalhador (empresa_id, nome, cpf, funcao) values (%L, 'Duplicado', '52998224725', 'Pedreiro')$$, current_setting('t.empresa_a')),
  'mesmo CPF duas vezes na empresa é recusado');
select tests.deve_falhar(
  format($$insert into trabalhador (empresa_id, nome, funcao, empreiteira_id) values (%L, 'Outro', 'Pedreiro', %L)$$,
    current_setting('t.empresa_a'), current_setting('t.emp_b')),
  'empreiteira de outra empresa é recusada');

select tests.entrar('00000000-0000-0000-0000-00000000000c');
select tests.afirmar((select count(*) from trabalhador where empresa_id = current_setting('t.empresa_a')::uuid) = 4,
  'mestre vê as pessoas da empresa (para a chamada)');
select tests.deve_falhar(
  format($$insert into trabalhador (empresa_id, nome, funcao) values (%L, 'Pelo mestre', 'Servente')$$, current_setting('t.empresa_a')),
  'mestre não cadastra pessoas');
select tests.deve_falhar(
  format($$insert into empreiteira (empresa_id, nome) values (%L, 'Pelo mestre')$$, current_setting('t.empresa_a')),
  'mestre não cadastra empreiteiras');

select tests.entrar('00000000-0000-0000-0000-00000000000d');
select tests.afirmar(
  (select count(*) from trabalhador where empresa_id = current_setting('t.empresa_a')::uuid) = 0
  and (select count(*) from empreiteira where empresa_id = current_setting('t.empresa_a')::uuid) = 0,
  'outra empresa não vê pessoas nem empreiteiras');
select tests.afirmar(
  tests.linhas_afetadas(format($$update trabalhador set nome = 'Hackeado' where empresa_id = %L$$, current_setting('t.empresa_a'))) = 0,
  'outra empresa não altera pessoas');

-- ---------------------------------------------------------------- custo com vigência
select tests.entrar('00000000-0000-0000-0000-00000000000b');
select definir_custo_mao_obra(tests.pessoa('João Pedreiro'), 'hora', 25, tests.hoje(-30));
select definir_custo_mao_obra(tests.pessoa('João Pedreiro'), 'hora', 30, tests.hoje(-1));
select definir_custo_mao_obra(tests.pessoa('Zé Servente'), 'diaria', 180, tests.hoje(-30));
select definir_custo_mao_obra(tests.pessoa('Maria Azulejista'), 'producao', 30, tests.hoje(-30), 'm²');
select tests.afirmar((select count(*) from custo_mao_obra) = 4, 'engenheiro lança custos com vigência');
select definir_custo_mao_obra(tests.pessoa('João Pedreiro'), 'hora', 31, tests.hoje(-1));
select tests.afirmar(
  (select valor from custo_mao_obra where trabalhador_id = tests.pessoa('João Pedreiro') and vigente_desde = tests.hoje(-1)) = 31
  and (select count(*) from custo_mao_obra) = 4,
  'lançar de novo na mesma data corrige o valor');
select tests.deve_falhar(
  format($$select definir_custo_mao_obra(%L, 'producao', 10, %L)$$, tests.pessoa('Maria Azulejista'), tests.hoje()),
  'custo por produção exige a unidade');
select tests.deve_falhar(
  format($$select definir_custo_mao_obra(%L, 'hora', 0, %L)$$, tests.pessoa('Maria Azulejista'), tests.hoje()),
  'custo zero é recusado');
select tests.deve_falhar(
  $$insert into custo_mao_obra (empresa_id, trabalhador_id, tipo, valor, vigente_desde) select empresa_id, id, 'hora', 1, current_date from trabalhador limit 1$$,
  'cliente não grava custo direto na tabela');

select tests.entrar('00000000-0000-0000-0000-00000000000c');
select tests.afirmar((select count(*) from custo_mao_obra) = 0, 'mestre não vê custos de mão de obra');
select tests.deve_falhar(
  format($$select definir_custo_mao_obra(%L, 'hora', 99, %L)$$, tests.pessoa('João Pedreiro'), tests.hoje()),
  'mestre não lança custo');

select tests.entrar('00000000-0000-0000-0000-00000000000f');
select tests.afirmar((select count(*) from custo_mao_obra) = 4, 'financeiro vê os custos');

-- ---------------------------------------------------------------- equipe da obra
select tests.entrar('00000000-0000-0000-0000-00000000000b');
insert into equipe_projeto (projeto_id, trabalhador_id)
select current_setting('t.p')::uuid, id from trabalhador where nome in ('João Pedreiro', 'Zé Servente', 'Maria Azulejista');
select tests.afirmar((select count(*) from equipe_projeto where projeto_id = current_setting('t.p')::uuid) = 3,
  'engenheiro monta a equipe da obra');
select tests.deve_falhar(
  format($$insert into equipe_projeto (projeto_id, trabalhador_id) values (%L, %L)$$, current_setting('t.p'),
    (select id from trabalhador where nome = 'Pessoa de B')),
  'pessoa de outra empresa não entra na equipe');

select tests.entrar('00000000-0000-0000-0000-00000000000c');
select tests.deve_falhar(
  format($$insert into equipe_projeto (projeto_id, trabalhador_id) values (%L, %L)$$, current_setting('t.p'), tests.pessoa('Fora da Obra')),
  'mestre não mexe na equipe da obra');

-- ---------------------------------------------------------------- chamada (RF-302)
select tests.afirmar(
  registrar_chamada(current_setting('t.p')::uuid, tests.hoje(), jsonb_build_array(
    jsonb_build_object('trabalhador_id', tests.pessoa('João Pedreiro'), 'presente', true,
      'alocacoes', jsonb_build_array(jsonb_build_object('tarefa_id', tests.tarefa('Alvenaria'), 'horas', 8))),
    jsonb_build_object('trabalhador_id', tests.pessoa('Zé Servente'), 'presente', true,
      'alocacoes', jsonb_build_array(
        jsonb_build_object('tarefa_id', tests.tarefa('Alvenaria'), 'horas', 6),
        jsonb_build_object('tarefa_id', tests.tarefa('Reboco'), 'horas', 2))),
    jsonb_build_object('trabalhador_id', tests.pessoa('Maria Azulejista'), 'presente', true,
      'alocacoes', jsonb_build_array(jsonb_build_object('tarefa_id', tests.tarefa('Reboco'), 'horas', 8, 'quantidade', 3)))
  )) = 3,
  'mestre faz a chamada: 3 presentes, um com o dia dividido entre tarefas');
select tests.afirmar(
  (select count(*) from apontamento_mao_obra where projeto_id = current_setting('t.p')::uuid and data = tests.hoje()) = 4,
  'dia dividido gera uma linha por tarefa');

select tests.afirmar(
  registrar_chamada(current_setting('t.p')::uuid, tests.hoje(), jsonb_build_array(
    jsonb_build_object('trabalhador_id', tests.pessoa('Maria Azulejista'), 'presente', false))) = 0,
  'refazer a chamada de uma pessoa substitui o que havia');
select tests.afirmar(
  (select count(*) || '/' || count(*) filter (where not presente) from apontamento_mao_obra
    where projeto_id = current_setting('t.p')::uuid and data = tests.hoje()) = '4/1',
  'falta registrada e as outras pessoas continuam');

select tests.deve_falhar(
  format($$select registrar_chamada(%L, %L, %L)$$, current_setting('t.p'), tests.hoje(),
    jsonb_build_array(jsonb_build_object('trabalhador_id', tests.pessoa('Fora da Obra'), 'presente', false))),
  'pessoa fora da equipe da obra é recusada');
select tests.deve_falhar(
  format($$select registrar_chamada(%L, %L, %L)$$, current_setting('t.p'), tests.hoje(),
    jsonb_build_array(jsonb_build_object('trabalhador_id', tests.pessoa('João Pedreiro'), 'presente', true,
      'alocacoes', jsonb_build_array(jsonb_build_object('tarefa_id', current_setting('t.tarefa_b'), 'horas', 8))))),
  'tarefa de outra obra é recusada');
select tests.deve_falhar(
  format($$select registrar_chamada(%L, %L, %L)$$, current_setting('t.p'), tests.hoje(),
    jsonb_build_array(jsonb_build_object('trabalhador_id', tests.pessoa('João Pedreiro'), 'presente', true,
      'alocacoes', jsonb_build_array(jsonb_build_object('horas', 8))))),
  'alocação sem tarefa é recusada');
select tests.deve_falhar(
  format($$select registrar_chamada(%L, %L, %L)$$, current_setting('t.p'), tests.hoje(),
    jsonb_build_array(jsonb_build_object('trabalhador_id', tests.pessoa('João Pedreiro'), 'presente', true,
      'alocacoes', jsonb_build_array(jsonb_build_object('tarefa_id', tests.tarefa('Alvenaria'), 'horas', 20),
                                     jsonb_build_object('tarefa_id', tests.tarefa('Reboco'), 'horas', 6))))),
  'mais de 24 h no dia é recusado');
select tests.deve_falhar(
  format($$select registrar_chamada(%L, %L, %L)$$, current_setting('t.p'), tests.hoje(),
    jsonb_build_array(jsonb_build_object('trabalhador_id', tests.pessoa('João Pedreiro'), 'presente', true, 'alocacoes', '[]'::jsonb))),
  'presente sem tarefa é recusado');
select tests.deve_falhar(
  format($$select registrar_chamada(%L, %L, %L)$$, current_setting('t.p'), tests.hoje(),
    jsonb_build_array(jsonb_build_object('trabalhador_id', tests.pessoa('João Pedreiro'), 'presente', false),
                      jsonb_build_object('trabalhador_id', tests.pessoa('João Pedreiro'), 'presente', false))),
  'pessoa repetida na chamada é recusada');
select tests.deve_falhar(
  format($$select registrar_chamada(%L, %L, %L)$$, current_setting('t.p'), tests.hoje(1),
    jsonb_build_array(jsonb_build_object('trabalhador_id', tests.pessoa('João Pedreiro'), 'presente', false))),
  'chamada de dia futuro é recusada');

select tests.entrar('00000000-0000-0000-0000-00000000000e');
select tests.afirmar((select count(*) from apontamento_mao_obra where projeto_id = current_setting('t.p')::uuid) = 4,
  'leitura vê a chamada');
select tests.deve_falhar(
  format($$select registrar_chamada(%L, %L, %L)$$, current_setting('t.p'), tests.hoje(),
    jsonb_build_array(jsonb_build_object('trabalhador_id', tests.pessoa('João Pedreiro'), 'presente', false))),
  'leitura não faz chamada');
select tests.deve_falhar(format($$select * from custo_mao_obra_projeto(%L)$$, current_setting('t.p')),
  'leitura não vê o custo de mão de obra');

select tests.entrar('00000000-0000-0000-0000-00000000000d');
select tests.afirmar((select count(*) from apontamento_mao_obra where projeto_id = current_setting('t.p')::uuid) = 0,
  'outra empresa não vê a chamada');
select tests.deve_falhar(format($$select * from custo_mao_obra_projeto(%L)$$, current_setting('t.p')),
  'outra empresa não vê custos');

-- ---------------------------------------------------------------- custo de mão de obra (RF-303)
select tests.entrar('00000000-0000-0000-0000-00000000000b');
-- ontem: João 8 h na alvenaria (vale R$ 31/h desde ontem); Maria produziu 3 m² de reboco
select registrar_chamada(current_setting('t.p')::uuid, tests.hoje(-1), jsonb_build_array(
  jsonb_build_object('trabalhador_id', tests.pessoa('João Pedreiro'), 'presente', true,
    'alocacoes', jsonb_build_array(jsonb_build_object('tarefa_id', tests.tarefa('Alvenaria'), 'horas', 8))),
  jsonb_build_object('trabalhador_id', tests.pessoa('Maria Azulejista'), 'presente', true,
    'alocacoes', jsonb_build_array(jsonb_build_object('tarefa_id', tests.tarefa('Reboco'), 'horas', 8, 'quantidade', 3)))));
-- 40 dias atrás: antes de qualquer custo vigente
select registrar_chamada(current_setting('t.p')::uuid, tests.hoje(-40), jsonb_build_array(
  jsonb_build_object('trabalhador_id', tests.pessoa('João Pedreiro'), 'presente', true,
    'alocacoes', jsonb_build_array(jsonb_build_object('tarefa_id', tests.tarefa('Alvenaria'), 'horas', 8)))));

select tests.afirmar(
  (select custo from custo_mao_obra_projeto(current_setting('t.p')::uuid)
    where data = tests.hoje(-1) and trabalhador_id = tests.pessoa('João Pedreiro')) = 248.00,
  'hora: 8 h × R$ 31 (custo vigente no dia)');
select tests.afirmar(
  (select custo from custo_mao_obra_projeto(current_setting('t.p')::uuid)
    where data = tests.hoje() and trabalhador_id = tests.pessoa('João Pedreiro')) = 248.00,
  'hoje vale o mesmo custo vigente');
select tests.afirmar(
  (select string_agg(custo::text, '+' order by custo desc) from custo_mao_obra_projeto(current_setting('t.p')::uuid)
    where data = tests.hoje() and trabalhador_id = tests.pessoa('Zé Servente')) = '135.00+45.00',
  'diária de R$ 180 rateada pelas horas entre as tarefas (6 h e 2 h)');
select tests.afirmar(
  (select custo from custo_mao_obra_projeto(current_setting('t.p')::uuid)
    where data = tests.hoje(-1) and trabalhador_id = tests.pessoa('Maria Azulejista')) = 90.00,
  'produção: 3 m² × R$ 30');
select tests.afirmar(
  (select custo is null and tipo is null from custo_mao_obra_projeto(current_setting('t.p')::uuid)
    where data = tests.hoje(-40)),
  'dia sem custo vigente fica sem custo (aparece como pendência)');
select tests.afirmar(
  (select sum(custo) from custo_mao_obra_projeto(current_setting('t.p')::uuid, tests.hoje(-1), tests.hoje())) = 766.00,
  'total do período: 248 + 90 + 248 + 135 + 45');
select tests.afirmar(
  (select sum(custo) from custo_mao_obra_projeto(current_setting('t.p')::uuid) where tarefa_id = tests.tarefa('Alvenaria')) = 631.00,
  'custo por tarefa: alvenaria 248 + 248 + 135');

select tests.entrar('00000000-0000-0000-0000-00000000000f');
select tests.afirmar(
  (select count(*) from custo_mao_obra_projeto(current_setting('t.p')::uuid)) = 6,
  'financeiro vê o custo de mão de obra');

-- ---------------------------------------------------------------- auditoria
reset role;
select tests.afirmar(
  (select count(*) from audit_log where tabela = 'custo_mao_obra') = 5
  and exists (select 1 from audit_log where tabela = 'custo_mao_obra' and acao = 'UPDATE' and antes ->> 'valor' = '30.00' and depois ->> 'valor' = '31.00'),
  'custos e correções de custo ficam no audit_log');
select tests.afirmar(
  (select count(*) from audit_log where tabela = 'apontamento_mao_obra' and acao = 'DELETE') >= 1,
  'refazer a chamada fica no audit_log');

rollback;
