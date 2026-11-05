-- Medição (RF-505 ampliado): contrato com o cliente e com empreiteira, boletim gerado pelo avanço,
-- o banco como juiz (medido ≤ executado ≤ contratado), aprovação só do engenheiro, pagamento,
-- imutabilidade, permissões e outra empresa.
\set ON_ERROR_STOP 1
begin;

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-00000000000a', 'ana@a.test'),    -- admin da empresa A
  ('00000000-0000-0000-0000-00000000000b', 'bruno@a.test'),  -- engenheiro do projeto P
  ('00000000-0000-0000-0000-00000000000f', 'fabio@a.test'),  -- financeiro no projeto P
  ('00000000-0000-0000-0000-00000000000c', 'carla@a.test'),  -- mestre no projeto P
  ('00000000-0000-0000-0000-00000000000d', 'davi@b.test');   -- admin da empresa B

create or replace function tests.hoje(p_dias integer default 0)
returns date language sql as $$ select (now() at time zone 'America/Sao_Paulo')::date + p_dias; $$;
create or replace function tests.tarefa(p_nome text)
returns uuid language sql security definer set search_path = '' as $$ select id from public.eap_item where nome = p_nome; $$;
create or replace function tests.item(p_tarefa text)
returns uuid language sql security definer set search_path = '' as $$
  select i.id from public.contrato_medicao_item i join public.contrato_medicao c on c.id = i.contrato_id
    join public.eap_item t on t.id = i.tarefa_id where t.nome = p_tarefa and c.parte = 'cliente'; $$;
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
grant execute on function tests.hoje(integer), tests.tarefa(text), tests.item(text), tests.erro_de(text) to authenticated;

set local role authenticated;

-- ---------------------------------------------------------------- cenário
select tests.entrar('00000000-0000-0000-0000-00000000000a');
select set_config('t.a', criar_empresa('Construtora A')::text, true);
select adicionar_membro_empresa(current_setting('t.a')::uuid, u) from unnest(array['bruno@a.test','fabio@a.test','carla@a.test']) u;
insert into empreiteira (empresa_id, nome) values (current_setting('t.a')::uuid, 'Alvenaria Boa');

select tests.entrar('00000000-0000-0000-0000-00000000000b');
select set_config('t.p', criar_projeto(current_setting('t.a')::uuid, 'Casa Jardim', null, tests.hoje(-30))::text, true);
select adicionar_membro_projeto(current_setting('t.p')::uuid, 'fabio@a.test', 'financeiro');
select adicionar_membro_projeto(current_setting('t.p')::uuid, 'carla@a.test', 'mestre');
select importar_eap(current_setting('t.p')::uuid, jsonb_build_array(
  jsonb_build_object('chave', 'E', 'tipo', 'etapa', 'nome', 'Vedações'),
  jsonb_build_object('chave', 'A', 'pai', 'E', 'tipo', 'tarefa', 'nome', 'Alvenaria', 'unidade', 'm²', 'quantidade', 100,
                     'custo_previsto', 10000, 'inicio_previsto', tests.hoje(-30), 'fim_previsto', tests.hoje(10)),
  jsonb_build_object('chave', 'P', 'pai', 'E', 'tipo', 'tarefa', 'nome', 'Pintura', 'custo_previsto', 5000,
                     'inicio_previsto', tests.hoje(-10), 'fim_previsto', tests.hoje(20)),
  jsonb_build_object('chave', 'S', 'pai', 'E', 'tipo', 'tarefa', 'nome', 'Sem custo', 'unidade', 'un', 'quantidade', 3)));
select definir_composicao_custo(tests.tarefa('Alvenaria'), 6000, 4000, 0, 0);

select tests.entrar('00000000-0000-0000-0000-00000000000d');
select set_config('t.b', criar_empresa('Construtora B')::text, true);

-- ---------------------------------------------------------------- contrato com o cliente
select tests.entrar('00000000-0000-0000-0000-00000000000c');
select tests.deve_falhar(format($$select salvar_contrato_medicao(null, %L, '{"nome": "Cliente"}')$$, current_setting('t.p')),
  'mestre não cria contrato de medição');

select tests.entrar('00000000-0000-0000-0000-00000000000f');
select set_config('t.c', salvar_contrato_medicao(null, current_setting('t.p')::uuid,
  '{"parte": "cliente", "nome": "João e Maria Silva", "bdi_pct": 20, "retencao_pct": 5, "prazo_pagamento_dias": 15}')::text, true);
select tests.afirmar(
  (select criterio = 'quantidade' and unidade = 'm²' and quantidade = 100 and preco_unitario = 120 and valor_total = 12000
     from contrato_medicao_item where id = tests.item('Alvenaria')),
  'tarefa com unidade: medida por quantidade, preço unitário = custo × (1 + BDI) ÷ quantidade');
select tests.afirmar(
  (select criterio = 'percentual' and unidade = '%' and quantidade = 100 and preco_unitario = 60
     from contrato_medicao_item where id = tests.item('Pintura')),
  'tarefa sem unidade: medida em %');
select tests.afirmar(tests.item('Sem custo') is null, 'tarefa sem custo fica fora do contrato');
select tests.deve_falhar(format($$select salvar_contrato_medicao(null, %L, '{"nome": "Outro cliente"}')$$, current_setting('t.p')),
  'só um contrato com o cliente por obra');

select tests.entrar('00000000-0000-0000-0000-00000000000c');
select tests.afirmar((select count(*) from contrato_medicao) = 0 and (select count(*) from contrato_medicao_item) = 0,
  'mestre não vê valores de venda');
select tests.entrar('00000000-0000-0000-0000-00000000000d');
select tests.afirmar((select count(*) from contrato_medicao) = 0, 'outra empresa não vê o contrato');
select tests.deve_falhar(format($$select gerar_medicao(%L, %L)$$, current_setting('t.c'), tests.hoje(-1)),
  'outra empresa não gera medição');

-- ---------------------------------------------------------------- boletim 1: gerado pelo avanço
select tests.entrar('00000000-0000-0000-0000-00000000000b');
select registrar_avanco(gen_random_uuid(), tests.tarefa('Alvenaria'), tests.hoje(-12), 40);
select registrar_avanco(gen_random_uuid(), tests.tarefa('Pintura'), tests.hoje(-12), 10);
select registrar_avanco(gen_random_uuid(), tests.tarefa('Alvenaria'), tests.hoje(-2), 70);  -- depois do fim do boletim 1

select tests.entrar('00000000-0000-0000-0000-00000000000f');
select tests.deve_falhar(format($$select gerar_medicao(%L, %L)$$, current_setting('t.c'), tests.hoje(1)), 'medição não vai além de hoje');
select set_config('t.m1', gerar_medicao(current_setting('t.c')::uuid, tests.hoje(-10))::text, true);
select tests.afirmar(
  (select numero = 1 and inicio = tests.hoje(-30) and fim = tests.hoje(-10) and status = 'rascunho'
          and valor_bruto = 5400 and retencao = 270 and valor_liquido = 5130 from medicao where id = current_setting('t.m1')::uuid),
  'boletim 1 sugere o executado até o fim do período: 40 m² × 120 + 10% × 60 = 5.400; retenção 5%');
select tests.afirmar(
  (select executado_acumulado = 40 from medicao_item where medicao_id = current_setting('t.m1')::uuid and contrato_item_id = tests.item('Alvenaria')),
  'o executado do período fica congelado como evidência');
select tests.afirmar(
  tests.erro_de(format($$select ajustar_item_medicao(%L, %L, 41)$$, current_setting('t.m1'), tests.item('Alvenaria')))
    like 'Alvenaria: o acumulado (41 m²) passaria do executado%',
  'o banco é o juiz: não mede mais do que o avanço apontado até o fim do período');
select tests.afirmar(ajustar_item_medicao(current_setting('t.m1')::uuid, tests.item('Alvenaria'), 30) = 4200,
  'medir menos que o executado pode (30 m² = 3.600 + 600)');
select tests.deve_falhar(format($$select gerar_medicao(%L, %L)$$, current_setting('t.c'), tests.hoje(-1)),
  'só um rascunho por contrato');
select tests.deve_falhar(format($$update medicao set valor_bruto = 1 where id = %L$$, current_setting('t.m1')),
  'boletim não muda por fora das funções');
select tests.deve_falhar(format($$select aprovar_medicao(%L)$$, current_setting('t.m1')), 'financeiro não aprova a medição');

select tests.entrar('00000000-0000-0000-0000-00000000000b');
select tests.afirmar(aprovar_medicao(current_setting('t.m1')::uuid) = tests.hoje(15), 'engenheiro aprova; vence no prazo do contrato');
select tests.afirmar(
  (select status = 'aprovada' and aprovada_nome = 'bruno@a.test' and valor_liquido = 3990 from medicao where id = current_setting('t.m1')::uuid),
  'aprovada: liberada para pagar 4.200 − 5% = 3.990');
select tests.afirmar(
  tests.erro_de(format($$select ajustar_item_medicao(%L, %L, 10)$$, current_setting('t.m1'), tests.item('Alvenaria')))
    = 'Só a medição em rascunho pode ser ajustada',
  'medição aprovada não muda');
select tests.deve_falhar(format($$select excluir_medicao(%L)$$, current_setting('t.m1')), 'medição aprovada não é apagada');

-- ---------------------------------------------------------------- boletim 2 e pagamento
select tests.entrar('00000000-0000-0000-0000-00000000000f');
select tests.deve_falhar(format($$select gerar_medicao(%L, %L)$$, current_setting('t.c'), tests.hoje(-10)),
  'o próximo boletim começa depois do anterior');
select set_config('t.m2', gerar_medicao(current_setting('t.c')::uuid, tests.hoje(-1))::text, true);
select tests.afirmar(
  (select numero = 2 and inicio = tests.hoje(-9) and valor_bruto = 4800 from medicao where id = current_setting('t.m2')::uuid),
  'boletim 2 mede o que faltava: 70 − 30 = 40 m² × 120 (pintura sem avanço novo fica de fora)');
select tests.deve_falhar(format($$select registrar_pagamento_medicao(%L, %L)$$, current_setting('t.m2'), tests.hoje()),
  'rascunho não recebe pagamento');
select registrar_pagamento_medicao(current_setting('t.m1')::uuid, tests.hoje());
select tests.afirmar((select status = 'paga' and pago_valor = 3990 from medicao where id = current_setting('t.m1')::uuid),
  'financeiro registra o pagamento do líquido');
select tests.deve_falhar(format($$select registrar_pagamento_medicao(%L, %L)$$, current_setting('t.m1'), tests.hoje()),
  'medição paga não é paga de novo');

-- ---------------------------------------------------------------- itens do contrato
select tests.afirmar(
  tests.erro_de(format($$select definir_item_contrato(%L, %L, '{"criterio": "quantidade", "unidade": "m²", "quantidade": 20, "preco_unitario": 120}')$$,
    current_setting('t.c'), tests.tarefa('Alvenaria'))) like 'Já foram medidos 30 m²%',
  'quantidade contratada não fica abaixo do já medido');
select definir_item_contrato(current_setting('t.c')::uuid, tests.tarefa('Alvenaria'),
  '{"criterio": "quantidade", "unidade": "m²", "quantidade": 110, "preco_unitario": 125}');
select tests.afirmar((select valor_total = 13750 from contrato_medicao_item where id = tests.item('Alvenaria')), 'aditivo de quantidade e preço');
select tests.deve_falhar(format($$select remover_item_contrato(%L)$$, tests.item('Alvenaria')), 'item já medido não sai do contrato');
select definir_item_contrato(current_setting('t.c')::uuid, tests.tarefa('Sem custo'),
  '{"criterio": "quantidade", "unidade": "un", "quantidade": 3, "preco_unitario": 50}');
select remover_item_contrato(tests.item('Sem custo'));
select tests.afirmar(tests.item('Sem custo') is null, 'item sem medição sai do contrato');

select tests.entrar('00000000-0000-0000-0000-00000000000b');
select tests.deve_falhar(format($$select excluir_item_eap(%L)$$, tests.tarefa('Alvenaria')), 'tarefa já medida não sai da EAP');

-- ---------------------------------------------------------------- contrato com empreiteira
select tests.entrar('00000000-0000-0000-0000-00000000000f');
select tests.deve_falhar(format($$select salvar_contrato_medicao(null, %L, '{"parte": "empreiteiro", "nome": "Sem empreiteira"}')$$,
  current_setting('t.p')), 'contrato de empreiteiro precisa da empreiteira');
select set_config('t.ce', salvar_contrato_medicao(null, current_setting('t.p')::uuid, jsonb_build_object(
  'parte', 'empreiteiro', 'nome', 'Empreitada de alvenaria', 'base', 'mao_obra',
  'empreiteira_id', (select id from empreiteira where nome = 'Alvenaria Boa'),
  'tarefas', jsonb_build_array(tests.tarefa('Alvenaria'))))::text, true);
select tests.afirmar(
  (select count(*) = 1 and min(preco_unitario) = 40 from contrato_medicao_item where contrato_id = current_setting('t.ce')::uuid),
  'empreitada pela mão de obra da composição: 4.000 ÷ 100 m²');

-- ---------------------------------------------------------------- auditoria e exclusão da obra
reset role;
select tests.afirmar((select count(*) from audit_log where tabela = 'medicao') >= 4, 'medições no audit_log');
select tests.afirmar((select count(*) from audit_log where tabela = 'medicao_item') >= 3, 'itens medidos no audit_log');
set local role authenticated;
select tests.entrar('00000000-0000-0000-0000-00000000000a');
select tests.afirmar(tests.linhas_afetadas(format($$delete from projeto where id = %L$$, current_setting('t.p'))) = 1,
  'admin apaga a obra mesmo com medições aprovadas e pagas');
reset role;
select tests.afirmar((select count(*) from medicao) = 0 and (select count(*) from contrato_medicao) = 0, 'medições saem junto com a obra');

rollback;
