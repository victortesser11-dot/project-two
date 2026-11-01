-- Testes do sprint 6 (RF-501 a 504, 602): composição do custo, versões do orçamento,
-- contratos/pedidos, despesas, orçado × comprometido × realizado e regras do semáforo.
\set ON_ERROR_STOP 1
begin;

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-00000000000a', 'ana@a.test'),    -- admin da empresa A
  ('00000000-0000-0000-0000-00000000000b', 'bruno@a.test'),  -- engenheiro do projeto P
  ('00000000-0000-0000-0000-00000000000f', 'fabio@a.test'),  -- financeiro no projeto P
  ('00000000-0000-0000-0000-00000000000c', 'carla@a.test'),  -- mestre no projeto P
  ('00000000-0000-0000-0000-000000000011', 'alice@a.test'),  -- almoxarife no projeto P
  ('00000000-0000-0000-0000-00000000000d', 'davi@b.test');   -- admin da empresa B

create or replace function tests.hoje(p_dias integer default 0)
returns date language sql as $$ select (now() at time zone 'America/Sao_Paulo')::date + p_dias; $$;
create or replace function tests.tarefa(p_nome text)
returns uuid language sql security definer set search_path = '' as $$ select id from public.eap_item where nome = p_nome; $$;
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
grant execute on function tests.hoje(integer), tests.tarefa(text), tests.erro_de(text) to authenticated;

set local role authenticated;

-- ---------------------------------------------------------------- cenário
select tests.entrar('00000000-0000-0000-0000-00000000000a');
select set_config('t.empresa_a', criar_empresa('Construtora A')::text, true);
select adicionar_membro_empresa(current_setting('t.empresa_a')::uuid, u)
  from unnest(array['bruno@a.test','fabio@a.test','carla@a.test','alice@a.test']) u;

select tests.entrar('00000000-0000-0000-0000-00000000000b');
select set_config('t.p', criar_projeto(current_setting('t.empresa_a')::uuid, 'Residencial Aurora')::text, true);
select adicionar_membro_projeto(current_setting('t.p')::uuid, 'fabio@a.test', 'financeiro');
select adicionar_membro_projeto(current_setting('t.p')::uuid, 'carla@a.test', 'mestre');
select adicionar_membro_projeto(current_setting('t.p')::uuid, 'alice@a.test', 'almoxarife');
select set_config('t.estrutura', criar_item_eap(current_setting('t.p')::uuid, 'etapa', 'Estrutura')::text, true);
select criar_item_eap(current_setting('t.p')::uuid, 'tarefa', 'Fundação', current_setting('t.estrutura')::uuid,
  jsonb_build_object('custo_previsto', 10000, 'inicio_previsto', tests.hoje(-20), 'fim_previsto', tests.hoje(-5)));
select criar_item_eap(current_setting('t.p')::uuid, 'tarefa', 'Pilares', current_setting('t.estrutura')::uuid,
  jsonb_build_object('custo_previsto', 5000, 'inicio_previsto', tests.hoje(-4), 'fim_previsto', tests.hoje(10)));

select tests.entrar('00000000-0000-0000-0000-00000000000d');
select set_config('t.empresa_b', criar_empresa('Construtora B')::text, true);

-- ---------------------------------------------------------------- composição do custo (RF-501)
select tests.entrar('00000000-0000-0000-0000-00000000000b');
select tests.afirmar(
  definir_composicao_custo(tests.tarefa('Fundação'), 6000, 3000, 1500, 500) = 11000,
  'engenheiro compõe o custo da tarefa e recebe o total');
select tests.afirmar(
  (select custo_previsto from eap_item where id = tests.tarefa('Fundação')) = 11000
  and (select custo_previsto from eap_do_projeto(current_setting('t.p')::uuid) where tipo = 'etapa') = 16000,
  'custo previsto da tarefa vira a soma da composição e sobe para a etapa');
select tests.afirmar(
  tests.erro_de(format($$select atualizar_item_eap(%L, '{"custo_previsto": 9000}')$$, tests.tarefa('Fundação')))
    like 'O custo desta tarefa vem da composição%',
  'tarefa com composição não muda o custo por fora');
select atualizar_item_eap(tests.tarefa('Fundação'), '{"nome": "Fundação (sapatas)"}');
select tests.afirmar((select nome from eap_item where id = tests.tarefa('Fundação (sapatas)')) = 'Fundação (sapatas)',
  'mudar outro campo da tarefa composta continua livre');
select tests.deve_falhar(format($$select definir_composicao_custo(%L, 1, 1, 1, 1)$$, current_setting('t.estrutura')),
  'etapa não tem composição própria');
select tests.deve_falhar(format($$select definir_composicao_custo(%L, -1, 0, 0, 0)$$, tests.tarefa('Pilares')),
  'valor negativo na composição é recusado');
select definir_composicao_custo(tests.tarefa('Pilares'), 0, 0, 0, 0);
select tests.afirmar((select custo_previsto from eap_item where id = tests.tarefa('Pilares')) is null,
  'composição zerada deixa a tarefa sem custo');
select definir_composicao_custo(tests.tarefa('Pilares'), null, null, null, null);
select atualizar_item_eap(tests.tarefa('Pilares'), '{"custo_previsto": 5000}');
select tests.afirmar((select custo_previsto from eap_item where id = tests.tarefa('Pilares')) = 5000,
  'sem composição, o custo volta a ser editado direto');

select tests.entrar('00000000-0000-0000-0000-00000000000c');
select tests.deve_falhar(format($$select definir_composicao_custo(%L, 1, 1, 1, 1)$$, tests.tarefa('Pilares')),
  'mestre não mexe no orçamento');
select tests.afirmar((select count(*) from composicao_custo) = 1, 'mestre vê a composição (orçamento é da obra)');

-- ---------------------------------------------------------------- versões do orçamento (RF-501)
select tests.entrar('00000000-0000-0000-0000-00000000000b');
select set_config('t.versao', salvar_versao_orcamento(current_setting('t.p')::uuid, 'Orçamento aprovado')::text, true);
select tests.afirmar(
  (select total = 16000 and jsonb_array_length(itens) = 3
          and (select (i ->> 'material')::numeric from jsonb_array_elements(itens) i where i ->> 'nome' = 'Fundação (sapatas)') = 6000
     from orcamento_versao where id = current_setting('t.versao')::uuid),
  'versão guarda a EAP com custos e composição');
select tests.deve_falhar($$update orcamento_versao set total = 1$$, 'versão é imutável');
select tests.deve_falhar(format($$select salvar_versao_orcamento(%L, 'x')$$, current_setting('t.p')), 'versão precisa de nome');

-- ---------------------------------------------------------------- contratos e pedidos (RF-503)
select tests.entrar('00000000-0000-0000-0000-00000000000f');
select set_config('t.contrato', salvar_compromisso(null, current_setting('t.p')::uuid, jsonb_build_object(
  'tarefa_id', tests.tarefa('Pilares'), 'tipo', 'contrato', 'descricao', 'Empreitada de armação dos pilares',
  'fornecedor', 'Ferragens JR', 'cnpj', '11.222.333/0001-81', 'valor', 3000, 'data', tests.hoje(-3)))::text, true);
select salvar_compromisso(null, current_setting('t.p')::uuid, jsonb_build_object(
  'tarefa_id', tests.tarefa('Fundação (sapatas)'), 'tipo', 'pedido', 'descricao', 'Concreto usinado 20 m³',
  'valor', 8000, 'data', tests.hoje(-15)));
select tests.afirmar((select cnpj from compromisso where id = current_setting('t.contrato')::uuid) = '11222333000181',
  'financeiro lança contrato (CNPJ só com dígitos)');
select tests.deve_falhar(format($$select salvar_compromisso(null, %L, %L)$$, current_setting('t.p'),
  jsonb_build_object('tarefa_id', current_setting('t.estrutura'), 'tipo', 'pedido', 'descricao', 'Na etapa', 'valor', 10, 'data', tests.hoje())),
  'contrato precisa de uma tarefa (não etapa)');

-- ---------------------------------------------------------------- despesas (RF-503)
select set_config('t.desp', registrar_despesa(current_setting('t.p')::uuid, tests.tarefa('Fundação (sapatas)'), tests.hoje(-10),
  'equipamento', 'Aluguel de retroescavadeira', 1200, 'Locadora Sul', 'NF 551')::text, true);
select registrar_despesa(current_setting('t.p')::uuid, tests.tarefa('Pilares'), tests.hoje(-1),
  'servico', 'Medição 1 da armação', 1000, 'Ferragens JR', 'NFS 10', current_setting('t.contrato')::uuid);
select tests.deve_falhar(format($$select registrar_despesa(%L, null, %L, 'frete', 'Sem tarefa', 100)$$, current_setting('t.p'), tests.hoje()),
  'despesa sem tarefa é recusada');
select tests.deve_falhar(format($$select registrar_despesa(%L, %L, %L, 'frete', 'Futuro', 100)$$, current_setting('t.p'), tests.tarefa('Pilares'), tests.hoje(1)),
  'despesa com data futura é recusada');
select tests.deve_falhar(format($$select registrar_despesa(%L, %L, %L, 'frete', 'Zero', 0)$$, current_setting('t.p'), tests.tarefa('Pilares'), tests.hoje()),
  'despesa de valor zero é recusada');
select tests.deve_falhar($$insert into despesa (empresa_id, projeto_id, tarefa_id, data, categoria, descricao, valor) select empresa_id, projeto_id, tarefa_id, data, categoria, 'x', 1 from despesa limit 1$$,
  'app não grava despesa direto na tabela');

select tests.entrar('00000000-0000-0000-0000-00000000000c');
select tests.afirmar((select count(*) from despesa) = 0 and (select count(*) from compromisso) = 0,
  'mestre não vê despesas nem contratos');
select tests.deve_falhar(format($$select registrar_despesa(%L, %L, %L, 'frete', 'Pelo mestre', 50)$$, current_setting('t.p'), tests.tarefa('Pilares'), tests.hoje()),
  'mestre não lança despesa');
select tests.deve_falhar(format($$select * from orcado_realizado(%L)$$, current_setting('t.p')), 'mestre não vê orçado × realizado');

select tests.entrar('00000000-0000-0000-0000-00000000000d');
select tests.afirmar((select count(*) from despesa) = 0 and (select count(*) from compromisso) = 0 and (select count(*) from orcamento_versao) = 0,
  'outra empresa não vê despesas, contratos nem versões');
select tests.deve_falhar(format($$select salvar_compromisso(null, %L, %L)$$, current_setting('t.p'),
  jsonb_build_object('tarefa_id', tests.tarefa('Pilares'), 'tipo', 'pedido', 'descricao', 'Invasor', 'valor', 10, 'data', tests.hoje())),
  'outra empresa não lança contrato na obra');

-- ---------------------------------------------------------------- material e mão de obra realizados
select tests.entrar('00000000-0000-0000-0000-000000000011');
insert into item_estoque (empresa_id, codigo, nome, tipo, unidade) values (current_setting('t.empresa_a')::uuid, '', 'Cimento', 'material', 'sc');
select registrar_entradas(current_setting('t.p')::uuid, tests.hoje(-12),
  jsonb_build_array(jsonb_build_object('item_id', (select id from item_estoque where nome = 'Cimento'), 'quantidade', 100, 'valor_unitario', 30)));
select registrar_saida(current_setting('t.p')::uuid, (select id from item_estoque where nome = 'Cimento'), tests.hoje(-8), 40, tests.tarefa('Fundação (sapatas)'));

select tests.entrar('00000000-0000-0000-0000-00000000000b');
insert into trabalhador (empresa_id, nome, funcao) values (current_setting('t.empresa_a')::uuid, 'João Pedreiro', 'Pedreiro');
select definir_custo_mao_obra((select id from trabalhador where nome = 'João Pedreiro'), 'hora', 25, tests.hoje(-30));
insert into equipe_projeto (projeto_id, trabalhador_id, empresa_id)
select current_setting('t.p')::uuid, id, current_setting('t.empresa_a')::uuid from trabalhador where nome = 'João Pedreiro';
select registrar_chamada(current_setting('t.p')::uuid, tests.hoje(-2), jsonb_build_array(
  jsonb_build_object('trabalhador_id', (select id from trabalhador where nome = 'João Pedreiro'), 'presente', true,
    'alocacoes', jsonb_build_array(jsonb_build_object('tarefa_id', tests.tarefa('Pilares'), 'horas', 8)))));

-- ---------------------------------------------------------------- orçado × comprometido × realizado
select tests.entrar('00000000-0000-0000-0000-00000000000f');
select tests.afirmar(
  (select orcado = 11000 and material = 1200 and mao_obra = 0 and despesas = 1200 and comprometido = 8000
     from orcado_realizado(current_setting('t.p')::uuid) where tarefa_id = tests.tarefa('Fundação (sapatas)')),
  'fundação: orçado 11.000, material 40 sc × 30, aluguel 1.200, pedido de 8.000');
select tests.afirmar(
  (select orcado = 5000 and material = 0 and mao_obra = 200 and despesas = 1000 and comprometido = 3000
     from orcado_realizado(current_setting('t.p')::uuid) where tarefa_id = tests.tarefa('Pilares')),
  'pilares: 8 h × R$ 25 de mão de obra, medição de 1.000 e contrato de 3.000');
select encerrar_compromisso(current_setting('t.contrato')::uuid);
select tests.afirmar(
  (select comprometido from orcado_realizado(current_setting('t.p')::uuid) where tarefa_id = tests.tarefa('Pilares')) = 1000,
  'contrato encerrado compromete só o que foi pago por ele');
select encerrar_compromisso(current_setting('t.contrato')::uuid, false);
select tests.afirmar(
  (select comprometido from orcado_realizado(current_setting('t.p')::uuid) where tarefa_id = tests.tarefa('Pilares')) = 3000,
  'contrato reaberto volta a comprometer o valor todo');
select tests.afirmar(
  (select sum(material) = 1200 and sum(mao_obra) = 200 and sum(despesas) = 2200 and count(*) = 4
     from custo_realizado_por_dia(current_setting('t.p')::uuid)),
  'custo realizado por dia soma material, mão de obra e despesas em 4 dias');

select excluir_despesa(current_setting('t.desp')::uuid);
select tests.afirmar(
  (select despesas from orcado_realizado(current_setting('t.p')::uuid) where tarefa_id = tests.tarefa('Fundação (sapatas)')) = 0,
  'despesa excluída sai do realizado');

-- ---------------------------------------------------------------- regras do semáforo (RF-602)
select tests.deve_falhar(format($$select definir_regras_semaforo(%L, 1, 2, 3, 4)$$, current_setting('t.empresa_a')),
  'financeiro não muda as regras do semáforo');
select tests.entrar('00000000-0000-0000-0000-00000000000a');
select definir_regras_semaforo(current_setting('t.empresa_a')::uuid, 5, 15, 3, 8);
select tests.afirmar(
  (select atraso_amarelo_dias = 5 and custo_vermelho_pct = 8 from regra_semaforo where empresa_id = current_setting('t.empresa_a')::uuid),
  'admin define as regras do semáforo');
select tests.deve_falhar(format($$select definir_regras_semaforo(%L, 20, 10, 3, 8)$$, current_setting('t.empresa_a')),
  'vermelho antes do amarelo é recusado');
select tests.entrar('00000000-0000-0000-0000-00000000000d');
select tests.afirmar((select count(*) from regra_semaforo) = 0, 'outra empresa não vê as regras');

-- ---------------------------------------------------------------- auditoria
reset role;
select tests.afirmar(
  (select count(*) from audit_log where tabela = 'composicao_custo') >= 3
  and exists (select 1 from audit_log where tabela = 'despesa' and acao = 'DELETE')
  and exists (select 1 from audit_log where tabela = 'compromisso' and acao = 'UPDATE' and depois ->> 'encerrado' = 'true')
  and exists (select 1 from audit_log where tabela = 'orcamento_versao' and acao = 'INSERT')
  and exists (select 1 from audit_log where tabela = 'regra_semaforo'),
  'composição, despesas, contratos, versões e regras ficam no audit_log');

rollback;
