-- Testes do RF-201: dependências (TI, II, TT), recálculo das sucessoras,
-- ciclos, permissões, linha de base congelada e auditoria.
\set ON_ERROR_STOP 1
begin;

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-00000000000a', 'ana@a.test'),    -- admin da empresa A
  ('00000000-0000-0000-0000-00000000000b', 'bruno@a.test'),  -- engenheiro do projeto P
  ('00000000-0000-0000-0000-00000000000c', 'carla@a.test'),  -- mestre no projeto P
  ('00000000-0000-0000-0000-00000000000d', 'davi@b.test');   -- admin da empresa B

create or replace function tests.tarefa(p_nome text)
returns uuid language sql as $$
  select id from public.eap_item where nome = p_nome;
$$;
create or replace function tests.datas(p_nome text)
returns text language sql as $$
  select inicio_previsto::text || ' a ' || fim_previsto::text from public.eap_item where nome = p_nome;
$$;
grant execute on function tests.tarefa(text), tests.datas(text) to authenticated;

set local role authenticated;

-- ---------------------------------------------------------------- cenário
select tests.entrar('00000000-0000-0000-0000-00000000000a');
select set_config('t.empresa_a', criar_empresa('Construtora A')::text, true);
select adicionar_membro_empresa(current_setting('t.empresa_a')::uuid, 'bruno@a.test');
select adicionar_membro_empresa(current_setting('t.empresa_a')::uuid, 'carla@a.test');

select tests.entrar('00000000-0000-0000-0000-00000000000b');
select set_config('t.p', criar_projeto(current_setting('t.empresa_a')::uuid, 'Residencial Aurora')::text, true);
select adicionar_membro_projeto(current_setting('t.p')::uuid, 'carla@a.test', 'mestre');

select set_config('t.etapa', criar_item_eap(current_setting('t.p')::uuid, 'etapa', 'Estrutura')::text, true);
select criar_item_eap(current_setting('t.p')::uuid, 'tarefa', 'Formas', current_setting('t.etapa')::uuid,
  '{"custo_previsto":"10000","inicio_previsto":"2026-11-02","fim_previsto":"2026-11-06"}');
select criar_item_eap(current_setting('t.p')::uuid, 'tarefa', 'Armação', current_setting('t.etapa')::uuid,
  '{"custo_previsto":"20000","inicio_previsto":"2026-11-09","fim_previsto":"2026-11-13"}');
select criar_item_eap(current_setting('t.p')::uuid, 'tarefa', 'Concretagem', current_setting('t.etapa')::uuid,
  '{"custo_previsto":"30000","inicio_previsto":"2026-11-16","fim_previsto":"2026-11-16"}');
select criar_item_eap(current_setting('t.p')::uuid, 'tarefa', 'Instalações', null,
  '{"inicio_previsto":"2026-11-03","fim_previsto":"2026-11-20"}');
select criar_item_eap(current_setting('t.p')::uuid, 'tarefa', 'Limpeza', null,
  '{"inicio_previsto":"2026-11-10","fim_previsto":"2026-11-12"}');
select criar_item_eap(current_setting('t.p')::uuid, 'tarefa', 'Sem datas', null, '{}');

select tests.entrar('00000000-0000-0000-0000-00000000000d');
select set_config('t.empresa_b', criar_empresa('Construtora B')::text, true);
select set_config('t.q', criar_projeto(current_setting('t.empresa_b')::uuid, 'Galpão B')::text, true);
select set_config('t.de_fora', criar_item_eap(current_setting('t.q')::uuid, 'tarefa', 'Tarefa de B', null,
  '{"inicio_previsto":"2026-11-01","fim_previsto":"2026-11-02"}')::text, true);

-- ---------------------------------------------------------------- dependências e recálculo
select tests.entrar('00000000-0000-0000-0000-00000000000b');

select tests.afirmar(
  salvar_dependencia(tests.tarefa('Formas'), tests.tarefa('Armação')) = 0,
  'TI com folga não move a sucessora');
select tests.afirmar(
  salvar_dependencia(tests.tarefa('Armação'), tests.tarefa('Concretagem')) = 0,
  'segunda dependência da cadeia também já está folgada');

select atualizar_item_eap(tests.tarefa('Formas'), '{"fim_previsto":"2026-11-11"}');
select tests.afirmar(tests.datas('Armação') = '2026-11-12 a 2026-11-16',
  'atrasar a predecessora empurra a sucessora TI para o dia seguinte, mantendo a duração');
select tests.afirmar(tests.datas('Concretagem') = '2026-11-17 a 2026-11-17',
  'o empurrão segue pela cadeia inteira');

select atualizar_item_eap(tests.tarefa('Formas'), '{"fim_previsto":"2026-11-05"}');
select tests.afirmar(tests.datas('Armação') = '2026-11-12 a 2026-11-16',
  'adiantar a predecessora não puxa a sucessora para trás (folga é respeitada)');

select tests.afirmar(
  salvar_dependencia(tests.tarefa('Formas'), tests.tarefa('Limpeza'), 'ii', 10) = 1,
  'II com defasagem devolve quantas tarefas andaram');
select tests.afirmar(tests.datas('Limpeza') = '2026-11-12 a 2026-11-14',
  'II: sucessora começa no início da predecessora mais a defasagem');

select tests.afirmar(
  salvar_dependencia(tests.tarefa('Armação'), tests.tarefa('Instalações'), 'tt', 6) = 1,
  'TT com defasagem move a sucessora');
select tests.afirmar(tests.datas('Instalações') = '2026-11-05 a 2026-11-22',
  'TT: sucessora termina no fim da predecessora mais a defasagem, mantendo a duração');
select set_config('t.dep_tt', (select id from eap_dependencia where sucessora_id = tests.tarefa('Instalações'))::text, true);

select tests.afirmar(
  (select count(*) from eap_dependencia where projeto_id = current_setting('t.p')::uuid) = 4,
  'quatro dependências gravadas');
select salvar_dependencia(tests.tarefa('Formas'), tests.tarefa('Limpeza'), 'ti', 0);
select tests.afirmar(
  (select tipo::text || defasagem_dias from eap_dependencia
        where predecessora_id = tests.tarefa('Formas') and sucessora_id = tests.tarefa('Limpeza')) = 'ti0',
  'salvar de novo o mesmo par ajusta tipo e defasagem');

select tests.deve_falhar(
  format($$select salvar_dependencia(%L, %L)$$, tests.tarefa('Concretagem'), tests.tarefa('Formas')),
  'ciclo é recusado');
select tests.deve_falhar(
  format($$select salvar_dependencia(%L, %L)$$, tests.tarefa('Formas'), tests.tarefa('Formas')),
  'tarefa não depende dela mesma');
select tests.deve_falhar(
  format($$select salvar_dependencia(%L, %L)$$, current_setting('t.etapa'), tests.tarefa('Limpeza')),
  'etapa não entra em dependência');
select tests.deve_falhar(
  format($$select salvar_dependencia(%L, %L)$$, current_setting('t.de_fora'), tests.tarefa('Limpeza')),
  'tarefa de outro projeto não vira predecessora');
select tests.deve_falhar(
  format($$select salvar_dependencia(%L, %L, 'ti', 400)$$, tests.tarefa('Formas'), tests.tarefa('Sem datas')),
  'defasagem fora de ±365 dias é recusada');
select tests.afirmar(salvar_dependencia(tests.tarefa('Formas'), tests.tarefa('Sem datas')) = 0
  and (select inicio_previsto is null from eap_item where nome = 'Sem datas'),
  'tarefa sem datas aceita dependência e fica sem datas');

select tests.deve_falhar(
  format($$select atualizar_item_eap(%L, '{"tipo":"etapa","inicio_previsto":null,"fim_previsto":null,"custo_previsto":null}')$$, tests.tarefa('Formas')),
  'tarefa com dependência não vira etapa');

-- ---------------------------------------------------------------- permissões
select tests.deve_falhar(
  format($$insert into eap_dependencia (projeto_id, predecessora_id, sucessora_id) values (%L, %L, %L)$$,
    current_setting('t.p'), tests.tarefa('Limpeza'), tests.tarefa('Sem datas')),
  'cliente não grava dependência direto na tabela');
select tests.deve_falhar(
  format($$update eap_item set inicio_base = '2020-01-01' where id = %L$$, tests.tarefa('Formas')),
  'cliente não altera a linha de base direto na tabela');

select tests.entrar('00000000-0000-0000-0000-00000000000c');
select tests.afirmar(
  (select count(*) from eap_dependencia where projeto_id = current_setting('t.p')::uuid) = 5,
  'mestre do projeto vê as dependências');
select tests.deve_falhar(
  format($$select salvar_dependencia(%L, %L)$$, tests.tarefa('Limpeza'), tests.tarefa('Sem datas')),
  'mestre não cria dependência');
select tests.deve_falhar(
  format($$select definir_linha_base(%L)$$, current_setting('t.p')),
  'mestre não define a linha de base');

select tests.entrar('00000000-0000-0000-0000-00000000000d');
select tests.afirmar(
  (select count(*) from eap_dependencia where projeto_id = current_setting('t.p')::uuid) = 0,
  'outra empresa não vê as dependências');
select tests.deve_falhar(
  format($$select remover_dependencia(%L)$$, current_setting('t.dep_tt')),
  'outra empresa não remove dependência (nem a enxerga)');

-- ---------------------------------------------------------------- linha de base
select tests.entrar('00000000-0000-0000-0000-00000000000b');
select tests.afirmar(
  (select count(*) from linha_base where projeto_id = current_setting('t.p')::uuid) = 0,
  'projeto começa sem linha de base');
select tests.afirmar(definir_linha_base(current_setting('t.p')::uuid) = 6, 'linha de base congela as 6 tarefas');
select tests.afirmar(
  (select inicio_base::text || ' a ' || fim_base::text || ' ' || custo_base from eap_item where nome = 'Formas')
    = '2026-11-02 a 2026-11-05 10000.00',
  'linha de base copia datas e custo da tarefa');

select atualizar_item_eap(tests.tarefa('Formas'), '{"fim_previsto":"2026-11-30"}');
select tests.afirmar(
  (select fim_base::text from eap_item where nome = 'Formas') = '2026-11-05',
  'mudar a tarefa não mexe na linha de base (congelada)');
select tests.afirmar(
  (select inicio_base::text from eap_item where nome = 'Armação') = '2026-11-12'
  and tests.datas('Armação') = '2026-12-01 a 2026-12-05',
  'sucessora andou, mas a linha de base dela ficou');
select tests.afirmar(
  (select inicio_base::text || ' a ' || fim_base::text || ' ' || custo_base
     from eap_do_projeto(current_setting('t.p')::uuid) where nome = 'Estrutura')
    = '2026-11-02 a 2026-11-17 60000.00',
  'etapa soma a linha de base das tarefas de dentro');
select tests.deve_falhar(
  format($$select atualizar_item_eap(%L, '{"inicio_base":"2020-01-01"}')$$, tests.tarefa('Formas')),
  'atualizar_item_eap não aceita mexer na linha de base');

select definir_linha_base(current_setting('t.p')::uuid);
select tests.afirmar(
  (select fim_base::text from eap_item where nome = 'Formas') = '2026-11-30',
  'redefinir a linha de base pega as datas atuais');

-- ---------------------------------------------------------------- auditoria
reset role;
select tests.afirmar(
  (select count(*) from audit_log where tabela = 'eap_dependencia' and acao = 'INSERT') = 5,
  'cada dependência criada fica no audit_log');
select tests.afirmar(
  exists (select 1 from audit_log where tabela = 'eap_item' and acao = 'UPDATE'
             and registro_id = tests.tarefa('Concretagem')::text
             and antes ->> 'inicio_previsto' = '2026-11-16' and depois ->> 'inicio_previsto' = '2026-11-17'),
  'o empurrão do recálculo fica no audit_log com antes e depois');
select tests.afirmar(
  exists (select 1 from audit_log where tabela = 'eap_item' and depois ->> 'fim_base' = '2026-11-30'),
  'redefinir a linha de base fica no audit_log');
select tests.afirmar(
  exists (select 1 from audit_log where tabela = 'linha_base' and acao = 'INSERT'
             and depois ->> 'definida_por' = '00000000-0000-0000-0000-00000000000b'),
  'quem definiu a linha de base fica registrado');
set local role authenticated;

-- ---------------------------------------------------------------- exclusão
select tests.entrar('00000000-0000-0000-0000-00000000000b');
select excluir_item_eap(tests.tarefa('Armação'));
select tests.afirmar(
  (select count(*) from eap_dependencia where projeto_id = current_setting('t.p')::uuid) = 2,
  'excluir uma tarefa leva as dependências dela (entrando e saindo)');
select remover_dependencia((select id from eap_dependencia where sucessora_id = tests.tarefa('Limpeza')));
select tests.afirmar(
  (select count(*) from eap_dependencia where projeto_id = current_setting('t.p')::uuid) = 1,
  'engenheiro remove uma dependência');

rollback;
