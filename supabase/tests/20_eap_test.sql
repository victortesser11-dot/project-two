-- Testes da EAP: permissões, código hierárquico, somatórios, movimentos,
-- limites da árvore, importação tudo-ou-nada e auditoria.
\set ON_ERROR_STOP 1
begin;

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-00000000000a', 'ana@a.test'),    -- admin da empresa A
  ('00000000-0000-0000-0000-00000000000b', 'bruno@a.test'),  -- engenheiro do projeto P
  ('00000000-0000-0000-0000-00000000000c', 'carla@a.test'),  -- leitura no projeto P
  ('00000000-0000-0000-0000-00000000000d', 'davi@b.test');   -- admin da empresa B

-- Resumo legível da árvore: "1 Fundações | 1.1 Estacas | ..."
create or replace function tests.arvore(p_projeto uuid)
returns text language sql as $$
  select coalesce(string_agg(codigo || ' ' || nome, ' | ' order by posicao), '(vazia)')
    from public.eap_do_projeto(p_projeto);
$$;
grant execute on function tests.arvore(uuid) to authenticated;

create or replace function tests.item(p_projeto uuid, p_nome text)
returns uuid language sql as $$
  select id from public.eap_item where projeto_id = p_projeto and nome = p_nome;
$$;
grant execute on function tests.item(uuid, text) to authenticated;

set local role authenticated;

-- ---------------------------------------------------------------- cenário
select tests.entrar('00000000-0000-0000-0000-00000000000a');
select set_config('t.empresa_a', criar_empresa('Construtora A')::text, true);
select adicionar_membro_empresa(current_setting('t.empresa_a')::uuid, 'bruno@a.test');
select adicionar_membro_empresa(current_setting('t.empresa_a')::uuid, 'carla@a.test');

select tests.entrar('00000000-0000-0000-0000-00000000000b');
select set_config('t.p', criar_projeto(current_setting('t.empresa_a')::uuid, 'Residencial Aurora')::text, true);
insert into membro_projeto (projeto_id, usuario_id, empresa_id, papel)
values (current_setting('t.p')::uuid, '00000000-0000-0000-0000-00000000000c', current_setting('t.empresa_a')::uuid, 'leitura');

select tests.entrar('00000000-0000-0000-0000-00000000000d');
select set_config('t.empresa_b', criar_empresa('Construtora B')::text, true);
select set_config('t.q', criar_projeto(current_setting('t.empresa_b')::uuid, 'Galpão B')::text, true);

-- ---------------------------------------------------------------- criar e código
select tests.entrar('00000000-0000-0000-0000-00000000000b');
select tests.afirmar(tests.arvore(current_setting('t.p')::uuid) = '(vazia)', 'projeto novo começa sem EAP');

select set_config('t.fund', criar_item_eap(current_setting('t.p')::uuid, 'etapa', 'Fundações')::text, true);
select criar_item_eap(current_setting('t.p')::uuid, 'tarefa', 'Estacas', current_setting('t.fund')::uuid,
  '{"unidade":"m","quantidade":"320","custo_previsto":"48000","inicio_previsto":"2026-11-03","fim_previsto":"2026-11-20","codigo_externo":"2.1"}');
select criar_item_eap(current_setting('t.p')::uuid, 'tarefa', 'Blocos', current_setting('t.fund')::uuid,
  '{"unidade":"m³","quantidade":"42.5","custo_previsto":"61500.5","inicio_previsto":"2026-11-18","fim_previsto":"2026-12-10"}');
select criar_item_eap(current_setting('t.p')::uuid, 'tarefa', 'Locação da obra', current_setting('t.fund')::uuid,
  '{"custo_previsto":"3500","inicio_previsto":"2026-11-01","fim_previsto":"2026-11-02"}', 1);
select criar_item_eap(current_setting('t.p')::uuid, 'etapa', 'Estrutura');

select tests.afirmar(
  tests.arvore(current_setting('t.p')::uuid) = '1 Fundações | 1.1 Locação da obra | 1.2 Estacas | 1.3 Blocos | 2 Estrutura',
  'código hierárquico segue a posição, inclusive ao inserir no meio');

select tests.afirmar(
  (select custo_previsto from eap_do_projeto(current_setting('t.p')::uuid) where codigo = '1') = 113000.50,
  'etapa soma o custo das tarefas de dentro');
select tests.afirmar(
  (select inicio_previsto::text || ' a ' || fim_previsto::text from eap_do_projeto(current_setting('t.p')::uuid) where codigo = '1')
    = '2026-11-01 a 2026-12-10',
  'etapa vai do início mais cedo ao fim mais tarde das tarefas');
select tests.afirmar(
  (select qtd_filhos::text || '/' || qtd_tarefas::text from eap_do_projeto(current_setting('t.p')::uuid) where codigo = '1') = '3/3',
  'etapa conta filhos e tarefas');
select tests.afirmar(
  (select custo_previsto is null and qtd_tarefas = 0 from eap_do_projeto(current_setting('t.p')::uuid) where codigo = '2'),
  'etapa vazia não tem custo');
select tests.afirmar(
  (select empresa_id from eap_item where nome = 'Estacas') = current_setting('t.empresa_a')::uuid,
  'empresa do item vem do projeto');

select tests.deve_falhar(
  format($$select criar_item_eap(%L, 'tarefa', 'Dentro de tarefa', %L)$$, current_setting('t.p'), tests.item(current_setting('t.p')::uuid, 'Estacas')),
  'tarefa não recebe itens dentro');
select tests.deve_falhar(
  format($$select criar_item_eap(%L, 'etapa', 'Etapa com valor', null, '{"custo_previsto":"10"}')$$, current_setting('t.p')),
  'etapa não guarda valores próprios');
select tests.deve_falhar(
  format($$select criar_item_eap(%L, 'tarefa', 'Datas trocadas', null, '{"inicio_previsto":"2026-12-10","fim_previsto":"2026-12-01"}')$$, current_setting('t.p')),
  'término antes do início é recusado');
select tests.deve_falhar(
  format($$select criar_item_eap(%L, 'tarefa', 'Negativa', null, '{"quantidade":"-1"}')$$, current_setting('t.p')),
  'quantidade negativa é recusada');
select tests.deve_falhar(
  format($$select criar_item_eap(%L, 'tarefa', 'Campo estranho', null, '{"preco":"1"}')$$, current_setting('t.p')),
  'campo desconhecido é recusado');

-- ---------------------------------------------------------------- permissões
select tests.entrar('00000000-0000-0000-0000-00000000000c');
select tests.afirmar((select count(*) from eap_do_projeto(current_setting('t.p')::uuid)) = 5, 'leitura vê a EAP');
select tests.deve_falhar(
  format($$select criar_item_eap(%L, 'etapa', 'Invasão')$$, current_setting('t.p')),
  'leitura não cria itens');
select tests.deve_falhar(
  format($$select atualizar_item_eap(%L, '{"nome":"Alterado"}')$$, tests.item(current_setting('t.p')::uuid, 'Estacas')),
  'leitura não altera itens');
select tests.deve_falhar(
  format($$insert into eap_item (projeto_id, empresa_id, ordem, tipo, nome) values (%L, %L, 9, 'etapa', 'Direto')$$,
         current_setting('t.p'), current_setting('t.empresa_a')),
  'ninguém insere direto na tabela');
select tests.deve_falhar($$update eap_item set nome = 'Direto'$$, 'ninguém altera direto na tabela');
select tests.deve_falhar($$delete from eap_item$$, 'ninguém apaga direto na tabela');

select tests.entrar('00000000-0000-0000-0000-00000000000d');
select tests.afirmar((select count(*) from eap_do_projeto(current_setting('t.p')::uuid)) = 0, 'outra empresa não vê a EAP');
select tests.afirmar((select count(*) from eap_item where projeto_id = current_setting('t.p')::uuid) = 0, 'outra empresa não lê a tabela');
select tests.deve_falhar(
  format($$select criar_item_eap(%L, 'etapa', 'Invasão')$$, current_setting('t.p')),
  'outra empresa não cria itens');
select tests.deve_falhar(
  format($$select excluir_item_eap(%L)$$, (select id from eap_item limit 0)),
  'excluir item inexistente falha');
-- davi tenta pendurar item do projeto dele numa etapa do projeto P
select set_config('t.q_etapa', criar_item_eap(current_setting('t.q')::uuid, 'etapa', 'Etapa B')::text, true);
reset role;
select set_config('t.fund_id', tests.item(current_setting('t.p')::uuid, 'Fundações')::text, true);
set local role authenticated;
select tests.entrar('00000000-0000-0000-0000-00000000000d');
select tests.deve_falhar(
  format($$select mover_item_eap(%L, %L)$$, current_setting('t.q_etapa'), current_setting('t.fund_id')),
  'não dá para mover item para etapa de outro projeto');
select tests.deve_falhar(
  format($$select reposicionar_item_eap(%L, 'descer')$$, current_setting('t.fund_id')),
  'outra empresa não reposiciona itens');

-- ---------------------------------------------------------------- atualizar
select tests.entrar('00000000-0000-0000-0000-00000000000b');
select atualizar_item_eap(tests.item(current_setting('t.p')::uuid, 'Estacas'), '{"nome":"Estacas hélice contínua","quantidade":"340"}');
select tests.afirmar(
  (select nome || '|' || unidade || '|' || quantidade::text || '|' || custo_previsto::text from eap_item where codigo_externo = '2.1')
    = 'Estacas hélice contínua|m|340.0000|48000.00',
  'atualização parcial mexe só nos campos enviados');
select atualizar_item_eap(tests.item(current_setting('t.p')::uuid, 'Estacas hélice contínua'), '{"unidade":null}');
select tests.afirmar((select unidade is null from eap_item where codigo_externo = '2.1'), 'valor null limpa o campo');
select tests.deve_falhar(
  format($$select atualizar_item_eap(%L, '{"tipo":"etapa"}')$$, tests.item(current_setting('t.p')::uuid, 'Blocos')),
  'tarefa com valores não vira etapa');
select tests.deve_falhar(
  format($$select atualizar_item_eap(%L, '{"tipo":"tarefa"}')$$, tests.item(current_setting('t.p')::uuid, 'Fundações')),
  'etapa com itens não vira tarefa');
select tests.deve_falhar(
  format($$select atualizar_item_eap(%L, '{"fim_previsto":"2026-01-01"}')$$, tests.item(current_setting('t.p')::uuid, 'Blocos')),
  'atualização não pode inverter as datas');

-- ---------------------------------------------------------------- mover e reposicionar
select reposicionar_item_eap(tests.item(current_setting('t.p')::uuid, 'Blocos'), 'subir');
select tests.afirmar(
  tests.arvore(current_setting('t.p')::uuid) = '1 Fundações | 1.1 Locação da obra | 1.2 Blocos | 1.3 Estacas hélice contínua | 2 Estrutura',
  'subir troca com o irmão de cima');
select reposicionar_item_eap(tests.item(current_setting('t.p')::uuid, 'Locação da obra'), 'subir');
select tests.afirmar(
  tests.arvore(current_setting('t.p')::uuid) = '1 Fundações | 1.1 Locação da obra | 1.2 Blocos | 1.3 Estacas hélice contínua | 2 Estrutura',
  'subir o primeiro não faz nada');
select reposicionar_item_eap(tests.item(current_setting('t.p')::uuid, 'Locação da obra'), 'descer');
select tests.afirmar(
  tests.arvore(current_setting('t.p')::uuid) = '1 Fundações | 1.1 Blocos | 1.2 Locação da obra | 1.3 Estacas hélice contínua | 2 Estrutura',
  'descer troca com o irmão de baixo');
select reposicionar_item_eap(tests.item(current_setting('t.p')::uuid, 'Locação da obra'), 'recuar');
select tests.afirmar(
  tests.arvore(current_setting('t.p')::uuid) = '1 Fundações | 1.1 Blocos | 1.2 Estacas hélice contínua | 2 Locação da obra | 3 Estrutura',
  'recuar tira da etapa e coloca logo depois dela');
select reposicionar_item_eap(tests.item(current_setting('t.p')::uuid, 'Estrutura'), 'subir');
select reposicionar_item_eap(tests.item(current_setting('t.p')::uuid, 'Locação da obra'), 'avancar');
select tests.afirmar(
  tests.arvore(current_setting('t.p')::uuid) = '1 Fundações | 1.1 Blocos | 1.2 Estacas hélice contínua | 2 Estrutura | 2.1 Locação da obra',
  'avançar coloca dentro do item de cima, no fim');

select criar_item_eap(current_setting('t.p')::uuid, 'tarefa', 'Pilares', tests.item(current_setting('t.p')::uuid, 'Estrutura'));
select criar_item_eap(current_setting('t.p')::uuid, 'tarefa', 'Pilares do térreo', tests.item(current_setting('t.p')::uuid, 'Estrutura'));
select reposicionar_item_eap(tests.item(current_setting('t.p')::uuid, 'Pilares do térreo'), 'avancar');
select tests.afirmar(
  (select tipo from eap_item where nome = 'Pilares') = 'etapa',
  'avançar para dentro de tarefa vazia transforma ela em etapa');
select tests.deve_falhar(
  format($$select reposicionar_item_eap(%L, 'avancar')$$, tests.item(current_setting('t.p')::uuid, 'Estacas hélice contínua')),
  'avançar para dentro de tarefa com valores é recusado');
select tests.deve_falhar(
  format($$select mover_item_eap(%L, %L)$$, tests.item(current_setting('t.p')::uuid, 'Estrutura'), tests.item(current_setting('t.p')::uuid, 'Pilares')),
  'etapa não entra dentro dela mesma (ciclo)');
select tests.afirmar(
  tests.arvore(current_setting('t.p')::uuid) = '1 Fundações | 1.1 Blocos | 1.2 Estacas hélice contínua | 2 Estrutura | 2.1 Locação da obra | 2.2 Pilares | 2.2.1 Pilares do térreo',
  'movimento recusado não deixa rastro');
select tests.deve_falhar(
  format($$select reposicionar_item_eap(%L, 'girar')$$, tests.item(current_setting('t.p')::uuid, 'Blocos')),
  'ação desconhecida é recusada');

-- ---------------------------------------------------------------- profundidade
select set_config('t.n1', criar_item_eap(current_setting('t.p')::uuid, 'etapa', 'N1')::text, true);
select set_config('t.n2', criar_item_eap(current_setting('t.p')::uuid, 'etapa', 'N2', current_setting('t.n1')::uuid)::text, true);
select set_config('t.n3', criar_item_eap(current_setting('t.p')::uuid, 'etapa', 'N3', current_setting('t.n2')::uuid)::text, true);
select set_config('t.n4', criar_item_eap(current_setting('t.p')::uuid, 'etapa', 'N4', current_setting('t.n3')::uuid)::text, true);
select set_config('t.n5', criar_item_eap(current_setting('t.p')::uuid, 'etapa', 'N5', current_setting('t.n4')::uuid)::text, true);
select set_config('t.n6', criar_item_eap(current_setting('t.p')::uuid, 'tarefa', 'N6', current_setting('t.n5')::uuid)::text, true);
select tests.afirmar(
  (select nivel from eap_do_projeto(current_setting('t.p')::uuid) where nome = 'N6') = 6,
  'seis níveis são aceitos');
select set_config('t.n6b', criar_item_eap(current_setting('t.p')::uuid, 'etapa', 'N6b', current_setting('t.n5')::uuid)::text, true);
select tests.deve_falhar(
  format($$select criar_item_eap(%L, 'tarefa', 'N7', %L)$$, current_setting('t.p'), current_setting('t.n6b')),
  'o sétimo nível é recusado');
select tests.deve_falhar(
  format($$select mover_item_eap(%L, %L)$$, current_setting('t.n1'), tests.item(current_setting('t.p')::uuid, 'Fundações')),
  'mover subárvore que passaria de 6 níveis é recusado');

-- ---------------------------------------------------------------- excluir
select tests.afirmar(excluir_item_eap(current_setting('t.n1')::uuid) = 7, 'excluir etapa leva tudo que está dentro');
select tests.afirmar(
  tests.arvore(current_setting('t.p')::uuid) = '1 Fundações | 1.1 Blocos | 1.2 Estacas hélice contínua | 2 Estrutura | 2.1 Locação da obra | 2.2 Pilares | 2.2.1 Pilares do térreo',
  'excluir não deixa buraco na numeração');
select excluir_item_eap(tests.item(current_setting('t.p')::uuid, 'Blocos'));
select tests.afirmar(
  tests.arvore(current_setting('t.p')::uuid) = '1 Fundações | 1.1 Estacas hélice contínua | 2 Estrutura | 2.1 Locação da obra | 2.2 Pilares | 2.2.1 Pilares do térreo',
  'irmãos sobem depois de excluir');

-- ---------------------------------------------------------------- importação
select tests.afirmar(
  importar_eap(current_setting('t.p')::uuid, '[
    {"chave":"a","tipo":"etapa","nome":"Instalações"},
    {"chave":"a1","pai":"a","tipo":"etapa","nome":"Elétrica"},
    {"chave":"a11","pai":"a1","tipo":"tarefa","nome":"Eletrodutos","unidade":"m","quantidade":"1200","custo_previsto":"18000","inicio_previsto":"2027-03-01","fim_previsto":"2027-04-15","codigo_externo":"5.1.1"},
    {"chave":"a2","pai":"a","tipo":"tarefa","nome":"Hidráulica","custo_previsto":"25000.10"},
    {"chave":"b","tipo":"tarefa","nome":"Limpeza final"}
  ]'::jsonb) = 5,
  'importação devolve quantos itens entraram');
select tests.afirmar(
  tests.arvore(current_setting('t.p')::uuid) =
    '1 Fundações | 1.1 Estacas hélice contínua | 2 Estrutura | 2.1 Locação da obra | 2.2 Pilares | 2.2.1 Pilares do térreo | '
    || '3 Instalações | 3.1 Elétrica | 3.1.1 Eletrodutos | 3.2 Hidráulica | 4 Limpeza final',
  'acrescentar põe a importação depois da EAP atual, na ordem do arquivo');
select tests.afirmar(
  (select custo_previsto from eap_do_projeto(current_setting('t.p')::uuid) where codigo = '3') = 43000.10,
  'somatório funciona em itens importados');

select tests.deve_falhar(
  format($$select importar_eap(%L, '[{"chave":"x","pai":"y","tipo":"tarefa","nome":"Órfã"},{"chave":"y","tipo":"etapa","nome":"Pai depois"}]')$$, current_setting('t.p')),
  'pai que vem depois do filho é recusado');
select tests.deve_falhar(
  format($$select importar_eap(%L, '[{"chave":"x","tipo":"etapa","nome":"A"},{"chave":"x","tipo":"etapa","nome":"B"}]')$$, current_setting('t.p')),
  'chave repetida é recusada');
select tests.deve_falhar(
  format($$select importar_eap(%L, '[{"chave":"x","tipo":"tarefa","nome":"A"},{"chave":"y","pai":"x","tipo":"tarefa","nome":"B"}]')$$, current_setting('t.p')),
  'importação não coloca item dentro de tarefa');
select tests.deve_falhar(
  format($$select importar_eap(%L, '[{"chave":"x","tipo":"tarefa","nome":"Boa"},{"chave":"y","tipo":"tarefa","nome":"Ruim","inicio_previsto":"2027-02-01","fim_previsto":"2027-01-01"}]')$$, current_setting('t.p')),
  'uma linha inválida derruba a importação inteira');
select tests.afirmar(
  (select count(*) from eap_item where projeto_id = current_setting('t.p')::uuid and nome = 'Boa') = 0,
  'nada da importação recusada fica gravado');
select tests.deve_falhar(
  format($$select importar_eap(%L, '[]')$$, current_setting('t.p')),
  'importação vazia é recusada');

select tests.afirmar(
  importar_eap(current_setting('t.p')::uuid,
    '[{"chave":"1","tipo":"etapa","nome":"Serviços preliminares"},{"chave":"1.1","pai":"1","tipo":"tarefa","nome":"Tapume"}]'::jsonb,
    true) = 2,
  'substituir aceita a nova EAP');
select tests.afirmar(
  tests.arvore(current_setting('t.p')::uuid) = '1 Serviços preliminares | 1.1 Tapume',
  'substituir apaga a EAP anterior');

select tests.entrar('00000000-0000-0000-0000-00000000000c');
select tests.deve_falhar(
  format($$select importar_eap(%L, '[{"chave":"x","tipo":"etapa","nome":"Invasão"}]')$$, current_setting('t.p')),
  'leitura não importa');

-- ---------------------------------------------------------------- auditoria
select tests.entrar('00000000-0000-0000-0000-00000000000a');
select set_config('t.audit_antes',
  (select count(*) from audit_log where tabela = 'eap_item' and empresa_id = current_setting('t.empresa_a')::uuid)::text, true);
select criar_item_eap(current_setting('t.p')::uuid, 'tarefa', 'Placa da obra', tests.item(current_setting('t.p')::uuid, 'Serviços preliminares'), '{}', 1);
select tests.afirmar(
  (select count(*) from audit_log where tabela = 'eap_item' and empresa_id = current_setting('t.empresa_a')::uuid)
    = current_setting('t.audit_antes')::int + 1,
  'inserir no meio registra só o item novo, não a renumeração dos irmãos');
select reposicionar_item_eap(tests.item(current_setting('t.p')::uuid, 'Placa da obra'), 'recuar');
select tests.afirmar(
  (select count(*) from audit_log where tabela = 'eap_item' and acao = 'UPDATE'
      and depois ->> 'nome' = 'Placa da obra' and depois ->> 'pai_id' is null) = 1,
  'mudar de etapa fica registrado na auditoria');
select tests.afirmar(
  (select count(*) from audit_log where tabela = 'eap_item' and acao = 'DELETE'
      and empresa_id = current_setting('t.empresa_a')::uuid) >= 7,
  'exclusões em cascata ficam registradas');

rollback;
