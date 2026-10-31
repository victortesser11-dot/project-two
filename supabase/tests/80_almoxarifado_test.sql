-- Testes do sprint 4 (RF-401 a 404): catálogo, entradas (NF-e), saídas por tarefa,
-- custo médio, ajuste de inventário e empréstimo de ferramentas.
\set ON_ERROR_STOP 1
begin;

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-00000000000a', 'ana@a.test'),    -- admin da empresa A
  ('00000000-0000-0000-0000-00000000000b', 'bruno@a.test'),  -- engenheiro do projeto P
  ('00000000-0000-0000-0000-000000000011', 'alice@a.test'),  -- almoxarife no projeto P
  ('00000000-0000-0000-0000-00000000000c', 'carla@a.test'),  -- mestre no projeto P
  ('00000000-0000-0000-0000-00000000000e', 'edu@a.test'),    -- leitura no projeto P
  ('00000000-0000-0000-0000-00000000000d', 'davi@b.test');   -- admin da empresa B

create or replace function tests.hoje(p_dias integer default 0)
returns date language sql as $$ select (now() at time zone 'America/Sao_Paulo')::date + p_dias; $$;
create or replace function tests.item(p_nome text)
returns uuid language sql as $$ select id from public.item_estoque where nome = p_nome; $$;
create or replace function tests.tarefa(p_nome text)
returns uuid language sql as $$ select id from public.eap_item where nome = p_nome; $$;
create or replace function tests.saldo(p_nome text)
returns numeric language sql as $$
  select s.quantidade from public.saldo_estoque s join public.item_estoque i on i.id = s.item_id where i.nome = p_nome;
$$;
-- Executa o SQL, exige erro e devolve a mensagem (para conferir o texto que o usuário vê).
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
grant execute on function tests.hoje(integer), tests.item(text), tests.tarefa(text), tests.saldo(text), tests.erro_de(text)
  to authenticated;

set local role authenticated;

-- ---------------------------------------------------------------- cenário
select tests.entrar('00000000-0000-0000-0000-00000000000a');
select set_config('t.empresa_a', criar_empresa('Construtora A')::text, true);
select adicionar_membro_empresa(current_setting('t.empresa_a')::uuid, u)
  from unnest(array['bruno@a.test','alice@a.test','carla@a.test','edu@a.test']) u;
-- Obra Q da mesma empresa, sem a almoxarife.
select set_config('t.q', criar_projeto(current_setting('t.empresa_a')::uuid, 'Obra Q')::text, true);
select set_config('t.tarefa_q', criar_item_eap(current_setting('t.q')::uuid, 'tarefa', 'Tarefa de Q')::text, true);

select tests.entrar('00000000-0000-0000-0000-00000000000b');
select set_config('t.p', criar_projeto(current_setting('t.empresa_a')::uuid, 'Residencial Aurora')::text, true);
select adicionar_membro_projeto(current_setting('t.p')::uuid, 'alice@a.test', 'almoxarife');
select adicionar_membro_projeto(current_setting('t.p')::uuid, 'carla@a.test', 'mestre');
select adicionar_membro_projeto(current_setting('t.p')::uuid, 'edu@a.test', 'leitura');
select set_config('t.estrutura', criar_item_eap(current_setting('t.p')::uuid, 'etapa', 'Estrutura')::text, true);
select criar_item_eap(current_setting('t.p')::uuid, 'tarefa', 'Alvenaria');
select criar_item_eap(current_setting('t.p')::uuid, 'tarefa', 'Reboco');
insert into trabalhador (empresa_id, nome, funcao) values (current_setting('t.empresa_a')::uuid, 'João Pedreiro', 'Pedreiro');
select set_config('t.joao', (select id from trabalhador where nome = 'João Pedreiro')::text, true);

select tests.entrar('00000000-0000-0000-0000-00000000000d');
select set_config('t.empresa_b', criar_empresa('Construtora B')::text, true);
insert into item_estoque (empresa_id, codigo, nome, tipo, unidade) values (current_setting('t.empresa_b')::uuid, '', 'Cimento de B', 'material', 'sc');
select set_config('t.item_b', tests.item('Cimento de B')::text, true);

-- ---------------------------------------------------------------- catálogo (RF-401)
select tests.entrar('00000000-0000-0000-0000-000000000011');
insert into item_estoque (empresa_id, codigo, nome, tipo, unidade, categoria, estoque_minimo, ncm)
values (current_setting('t.empresa_a')::uuid, '', 'Cimento CP-II 50 kg', 'material', 'sc', 'Cimento e argamassa', 20, '25232910'),
       (current_setting('t.empresa_a')::uuid, '', 'Areia média', 'material', 'm³', 'Agregados', 0, null);
insert into item_estoque (empresa_id, codigo, nome, tipo, unidade, estoque_minimo, patrimonio)
values (current_setting('t.empresa_a')::uuid, '', 'Furadeira de impacto', 'ferramenta', 'cx', 5, 'PAT-0099'),
       (current_setting('t.empresa_a')::uuid, 'BET-01', 'Betoneira 400 L', 'ferramenta', 'un', 0, null);
select tests.afirmar(
  (select string_agg(codigo, ',' order by codigo) from item_estoque where empresa_id = current_setting('t.empresa_a')::uuid)
    = 'BET-01,FER-0001,MAT-0001,MAT-0002',
  'almoxarife cadastra itens; código automático MAT-0001 / FER-0001 quando vazio');
select tests.afirmar(
  (select unidade = 'un' and estoque_minimo = 0 from item_estoque where nome = 'Furadeira de impacto'),
  'ferramenta é sempre 1 unidade, sem estoque mínimo');
select tests.deve_falhar(
  format($$insert into item_estoque (empresa_id, codigo, nome, tipo, unidade) values (%L, 'MAT-0001', 'Outro', 'material', 'kg')$$,
    current_setting('t.empresa_a')),
  'código repetido na empresa é recusado');
select tests.deve_falhar(
  format($$insert into item_estoque (empresa_id, codigo, nome, tipo, unidade, ncm) values (%L, '', 'NCM errado', 'material', 'kg', '123')$$,
    current_setting('t.empresa_a')),
  'NCM com formato errado é recusado');
select tests.deve_falhar(
  $$update item_estoque set tipo = 'ferramenta' where nome = 'Areia média'$$,
  'item não muda de material para ferramenta');
select tests.deve_falhar(
  format($$update item_estoque set empresa_id = %L where nome = 'Areia média'$$, current_setting('t.empresa_b')),
  'item não muda de empresa');
update item_estoque set estoque_minimo = 2 where nome = 'Areia média';
select tests.afirmar((select estoque_minimo from item_estoque where nome = 'Areia média') = 2, 'almoxarife edita o item');

select tests.entrar('00000000-0000-0000-0000-00000000000c');
select tests.afirmar((select count(*) from item_estoque where empresa_id = current_setting('t.empresa_a')::uuid) = 4,
  'mestre vê o catálogo da empresa');
select tests.deve_falhar(
  format($$insert into item_estoque (empresa_id, codigo, nome, tipo, unidade) values (%L, '', 'Pelo mestre', 'material', 'kg')$$,
    current_setting('t.empresa_a')),
  'mestre não cadastra itens');
select tests.afirmar(
  tests.linhas_afetadas($$update item_estoque set nome = 'Mudado pelo mestre' where nome = 'Areia média'$$) = 0,
  'mestre não edita itens');

select tests.entrar('00000000-0000-0000-0000-00000000000d');
select tests.afirmar((select count(*) from item_estoque where empresa_id = current_setting('t.empresa_a')::uuid) = 0,
  'outra empresa não vê o catálogo');
select tests.afirmar(
  tests.linhas_afetadas(format($$update item_estoque set nome = 'Hackeado' where empresa_id = %L$$, current_setting('t.empresa_a'))) = 0,
  'outra empresa não altera o catálogo');

-- ---------------------------------------------------------------- entradas e NF-e (RF-402)
select tests.entrar('00000000-0000-0000-0000-000000000011');
select tests.afirmar(
  registrar_entradas(current_setting('t.p')::uuid, tests.hoje(-5),
    jsonb_build_array(
      jsonb_build_object('item_id', tests.item('Cimento CP-II 50 kg'), 'quantidade', 100, 'valor_unitario', 30, 'codigo_fornecedor', 'CIM001'),
      jsonb_build_object('item_id', tests.item('Areia média'), 'quantidade', 10, 'valor_unitario', 120.5, 'codigo_fornecedor', 'AR-M')),
    'Depósito Bom Preço', '11.222.333/0001-81', '1234', '3526 1011 2223 3300 0181 5500 1000 0012 3410 0000 1239') = 2,
  'almoxarife lança a NF-e inteira (2 linhas)');
select tests.afirmar(
  tests.saldo('Cimento CP-II 50 kg') = 100 and (select custo_medio from saldo_estoque where item_id = tests.item('Cimento CP-II 50 kg')) = 30
  and tests.saldo('Areia média') = 10,
  'saldo e custo médio da obra depois da entrada');
select tests.afirmar(
  (select count(*) from movimento_estoque where tipo = 'entrada' and chave_nfe = '35261011222333000181550010000012341000001239'
     and cnpj_fornecedor = '11222333000181' and nota_fiscal = '1234') = 2
  and (select valor_total from movimento_estoque where item_id = tests.item('Areia média')) = 1205.00,
  'movimentos guardam a nota (chave e CNPJ só com dígitos) e o valor total calculado no banco');
select tests.afirmar(
  (select item_id from item_fornecedor where cnpj_fornecedor = '11222333000181' and codigo_fornecedor = 'CIM001') = tests.item('Cimento CP-II 50 kg'),
  'código do fornecedor fica ligado ao item (a próxima nota já vem casada)');
select tests.afirmar(
  tests.erro_de(format($$select registrar_entradas(%L, %L, %L::jsonb, 'Depósito Bom Preço', '11222333000181', '1234', %L)$$,
    current_setting('t.p'), tests.hoje(),
    jsonb_build_array(jsonb_build_object('item_id', tests.item('Areia média'), 'quantidade', 1, 'valor_unitario', 1)),
    '35261011222333000181550010000012341000001239'))
    = format('Esta NF-e já foi lançada (entrada de %s)', to_char(tests.hoje(-5), 'DD/MM/YYYY')),
  'a mesma NF-e não entra duas vezes (e diz quando entrou)');

select registrar_entradas(current_setting('t.p')::uuid, tests.hoje(-2),
  jsonb_build_array(jsonb_build_object('item_id', tests.item('Cimento CP-II 50 kg'), 'quantidade', 50, 'valor_unitario', 36)));
select tests.afirmar(
  tests.saldo('Cimento CP-II 50 kg') = 150 and (select custo_medio from saldo_estoque where item_id = tests.item('Cimento CP-II 50 kg')) = 32,
  'custo médio ponderado: (100 × 30 + 50 × 36) ÷ 150 = 32');

select tests.deve_falhar(
  format($$select registrar_entradas(%L, %L, %L::jsonb)$$, current_setting('t.p'), tests.hoje(1),
    jsonb_build_array(jsonb_build_object('item_id', tests.item('Areia média'), 'quantidade', 1, 'valor_unitario', 1))),
  'entrada com data futura é recusada');
select tests.deve_falhar(
  format($$select registrar_entradas(%L, %L, %L::jsonb)$$, current_setting('t.p'), tests.hoje(),
    jsonb_build_array(jsonb_build_object('item_id', tests.item('Furadeira de impacto'), 'quantidade', 1, 'valor_unitario', 500))),
  'ferramenta não entra como estoque');
select tests.deve_falhar(
  format($$select registrar_entradas(%L, %L, %L::jsonb)$$, current_setting('t.p'), tests.hoje(),
    jsonb_build_array(jsonb_build_object('item_id', current_setting('t.item_b'), 'quantidade', 1, 'valor_unitario', 1))),
  'item de outra empresa é recusado');
select tests.deve_falhar(
  format($$select registrar_entradas(%L, %L, '[]'::jsonb)$$, current_setting('t.p'), tests.hoje()),
  'entrada sem itens é recusada');
select tests.deve_falhar(
  format($$select registrar_entradas(%L, %L, %L::jsonb)$$, current_setting('t.p'), tests.hoje(),
    jsonb_build_array(
      jsonb_build_object('item_id', tests.item('Areia média'), 'quantidade', 5, 'valor_unitario', 100),
      jsonb_build_object('item_id', tests.item('Cimento CP-II 50 kg'), 'quantidade', 0, 'valor_unitario', 30))),
  'linha com quantidade zero derruba a entrada');
select tests.afirmar(tests.saldo('Areia média') = 10, 'entrada é tudo ou nada: a linha boa também não entrou');
select tests.deve_falhar(
  format($$select registrar_entradas(%L, %L, %L::jsonb)$$, current_setting('t.q'), tests.hoje(),
    jsonb_build_array(jsonb_build_object('item_id', tests.item('Areia média'), 'quantidade', 1, 'valor_unitario', 1))),
  'almoxarife não movimenta obra em que não está');
select tests.deve_falhar(
  $$insert into saldo_estoque (projeto_id, item_id, empresa_id, quantidade) select projeto_id, item_id, empresa_id, 999 from saldo_estoque limit 1$$,
  'cliente não grava saldo direto na tabela');
select tests.deve_falhar(
  $$update saldo_estoque set quantidade = 999$$,
  'cliente não altera saldo direto na tabela');
select tests.deve_falhar(
  $$update movimento_estoque set quantidade = 1$$,
  'movimento é imutável para o cliente');
select tests.deve_falhar(
  $$delete from movimento_estoque$$,
  'cliente não apaga movimentos');

select tests.entrar('00000000-0000-0000-0000-00000000000c');
select tests.deve_falhar(
  format($$select registrar_entradas(%L, %L, %L::jsonb)$$, current_setting('t.p'), tests.hoje(),
    jsonb_build_array(jsonb_build_object('item_id', tests.item('Areia média'), 'quantidade', 1, 'valor_unitario', 1))),
  'mestre não lança entrada');

-- ---------------------------------------------------------------- saídas por tarefa (RF-403)
select tests.entrar('00000000-0000-0000-0000-000000000011');
select tests.afirmar(
  registrar_saida(current_setting('t.p')::uuid, tests.item('Cimento CP-II 50 kg'), tests.hoje(-1), 40, tests.tarefa('Alvenaria'),
    current_setting('t.joao')::uuid) = 110,
  'saída para a tarefa devolve o saldo restante');
select tests.afirmar(
  (select valor_unitario = 32 and valor_total = 1280.00 and trabalhador_id = current_setting('t.joao')::uuid
     from movimento_estoque where tipo = 'saida'),
  'saída sai pelo custo médio (40 × 32) e registra quem retirou');
select tests.afirmar(
  tests.erro_de(format($$select registrar_saida(%L, %L, %L, 1, null)$$, current_setting('t.p'), tests.item('Cimento CP-II 50 kg'), tests.hoje()))
    like 'Saída sem tarefa não é permitida%',
  'saída sem tarefa é recusada');
select tests.deve_falhar(
  format($$select registrar_saida(%L, %L, %L, 1, %L)$$, current_setting('t.p'), tests.item('Cimento CP-II 50 kg'), tests.hoje(),
    current_setting('t.estrutura')),
  'saída para etapa (e não tarefa) é recusada');
select tests.deve_falhar(
  format($$select registrar_saida(%L, %L, %L, 1, %L)$$, current_setting('t.p'), tests.item('Cimento CP-II 50 kg'), tests.hoje(),
    current_setting('t.tarefa_q')),
  'saída para tarefa de outra obra é recusada');
select tests.afirmar(
  tests.erro_de(format($$select registrar_saida(%L, %L, %L, 200, %L)$$, current_setting('t.p'), tests.item('Cimento CP-II 50 kg'),
    tests.hoje(), tests.tarefa('Reboco')))
    = 'Saldo insuficiente de Cimento CP-II 50 kg: há 110 sc na obra',
  'saldo nunca fica negativo (e a mensagem diz quanto há)');
select tests.afirmar(
  tests.erro_de(format($$select registrar_saida(%L, %L, %L, 2.5, %L)$$, current_setting('t.p'), tests.item('Furadeira de impacto'),
    tests.hoje(), tests.tarefa('Reboco'))) = 'Material não encontrado no catálogo',
  'ferramenta não sai como material');
select tests.afirmar(tests.saldo('Cimento CP-II 50 kg') = 110, 'saídas recusadas não mexem no saldo');

select tests.entrar('00000000-0000-0000-0000-00000000000b');
select tests.afirmar(
  registrar_saida(current_setting('t.p')::uuid, tests.item('Areia média'), tests.hoje(), 2.5, tests.tarefa('Reboco'), null, 'Equipe do reboco') = 7.5,
  'engenheiro também registra saída (quantidade fracionada)');

select tests.entrar('00000000-0000-0000-0000-00000000000e');
select tests.afirmar(
  (select count(*) from saldo_estoque where projeto_id = current_setting('t.p')::uuid) = 2
  and (select count(*) from movimento_estoque where projeto_id = current_setting('t.p')::uuid) = 5,
  'leitura vê saldo e movimentos da obra');
select tests.deve_falhar(
  format($$select registrar_saida(%L, %L, %L, 1, %L)$$, current_setting('t.p'), tests.item('Cimento CP-II 50 kg'), tests.hoje(),
    tests.tarefa('Alvenaria')),
  'leitura não registra saída');

select tests.entrar('00000000-0000-0000-0000-00000000000d');
select tests.afirmar(
  (select count(*) from saldo_estoque) = 0 and (select count(*) from movimento_estoque) = 0
  and (select count(*) from item_fornecedor) = 0,
  'outra empresa não vê saldo, movimentos nem códigos de fornecedor');
select tests.deve_falhar(
  format($$select registrar_saida(%L, %L, %L, 1, %L)$$, current_setting('t.p'), current_setting('t.item_b'), tests.hoje(),
    current_setting('t.tarefa_q')),
  'outra empresa não movimenta a obra');

-- ---------------------------------------------------------------- inventário (ajuste)
select tests.entrar('00000000-0000-0000-0000-000000000011');
select tests.afirmar(
  registrar_ajuste(current_setting('t.p')::uuid, tests.item('Cimento CP-II 50 kg'), tests.hoje(), 105, 'Inventário: 5 sacos empedrados') = -5,
  'ajuste devolve a diferença contada');
select tests.afirmar(
  tests.saldo('Cimento CP-II 50 kg') = 105
  and (select quantidade = -5 and valor_unitario = 32 and valor_total = 160.00 and observacao like 'Inventário%'
         from movimento_estoque where tipo = 'ajuste'),
  'ajuste acerta o saldo e guarda o motivo e o valor da perda');
select tests.afirmar(
  registrar_ajuste(current_setting('t.p')::uuid, tests.item('Cimento CP-II 50 kg'), tests.hoje(), 105, 'Conferência') = 0,
  'contagem igual ao saldo não gera movimento');
select tests.afirmar((select count(*) from movimento_estoque where tipo = 'ajuste') = 1, 'só um ajuste gravado');
select tests.deve_falhar(
  format($$select registrar_ajuste(%L, %L, %L, 100, '  ')$$, current_setting('t.p'), tests.item('Cimento CP-II 50 kg'), tests.hoje()),
  'ajuste sem motivo é recusado');
select tests.deve_falhar(
  format($$select registrar_ajuste(%L, %L, %L, -1, 'Teste')$$, current_setting('t.p'), tests.item('Cimento CP-II 50 kg'), tests.hoje()),
  'contagem negativa é recusada');

select tests.entrar('00000000-0000-0000-0000-00000000000c');
select tests.deve_falhar(
  format($$select registrar_ajuste(%L, %L, %L, 0, 'Sumiu')$$, current_setting('t.p'), tests.item('Cimento CP-II 50 kg'), tests.hoje()),
  'mestre não faz ajuste de inventário');

-- ---------------------------------------------------------------- ferramentas (RF-404)
select tests.entrar('00000000-0000-0000-0000-000000000011');
select tests.afirmar(
  emprestar_ferramenta(current_setting('t.p')::uuid, tests.item('Furadeira de impacto'), current_setting('t.joao')::uuid,
    null, tests.hoje(3)) is not null,
  'almoxarife empresta a ferramenta para uma pessoa da equipe');
select tests.afirmar(
  (select responsavel = 'João Pedreiro' and devolvida_em is null and retirado_por = '00000000-0000-0000-0000-000000000011'
     from emprestimo_ferramenta),
  'o nome da pessoa vem do cadastro e o empréstimo fica aberto');
select tests.afirmar(
  tests.erro_de(format($$select emprestar_ferramenta(%L, %L, null, 'Outro')$$, current_setting('t.p'), tests.item('Furadeira de impacto')))
    = format('Esta ferramenta já está com João Pedreiro desde %s', to_char(tests.hoje(), 'DD/MM/YYYY')),
  'ferramenta emprestada não sai de novo (e diz com quem está)');
select tests.deve_falhar(
  format($$select emprestar_ferramenta(%L, %L)$$, current_setting('t.p'), tests.item('Betoneira 400 L')),
  'empréstimo sem responsável é recusado');
select tests.deve_falhar(
  format($$select emprestar_ferramenta(%L, %L, null, 'Fulano')$$, current_setting('t.p'), tests.item('Areia média')),
  'material não é emprestado');

select tests.entrar('00000000-0000-0000-0000-00000000000c');
select tests.deve_falhar(
  format($$select emprestar_ferramenta(%L, %L, null, 'Fulano')$$, current_setting('t.p'), tests.item('Betoneira 400 L')),
  'mestre não empresta ferramentas');
select tests.deve_falhar(
  format($$select devolver_ferramenta(%L)$$, tests.item('Furadeira de impacto')),
  'mestre não recebe a devolução');
select tests.deve_falhar(
  $$insert into emprestimo_ferramenta (empresa_id, projeto_id, item_id, responsavel) select empresa_id, projeto_id, item_id, 'x' from emprestimo_ferramenta$$,
  'cliente não grava empréstimo direto na tabela');

select tests.entrar('00000000-0000-0000-0000-000000000011');
select tests.afirmar(devolver_ferramenta(tests.item('Furadeira de impacto'), 'Voltou sem a broca de 8') = 0, 'devolução no mesmo dia: 0 dias fora');
select tests.afirmar(
  (select devolvida_em is not null and devolvido_por = '00000000-0000-0000-0000-000000000011' and observacao = 'Voltou sem a broca de 8'
     from emprestimo_ferramenta),
  'devolução fecha o empréstimo com quem recebeu e a observação');
select tests.deve_falhar(
  format($$select devolver_ferramenta(%L)$$, tests.item('Furadeira de impacto')),
  'devolver duas vezes é recusado');
select emprestar_ferramenta(current_setting('t.p')::uuid, tests.item('Furadeira de impacto'), null, 'Carlos (empreiteira)');
select tests.afirmar((select count(*) from emprestimo_ferramenta where item_id = tests.item('Furadeira de impacto')) = 2,
  'depois de devolvida, a ferramenta pode sair de novo');

update item_estoque set ativo = false where nome = 'Betoneira 400 L';
select tests.afirmar(
  tests.erro_de(format($$select emprestar_ferramenta(%L, %L, null, 'Fulano')$$, current_setting('t.p'), tests.item('Betoneira 400 L')))
    like 'Esta ferramenta está inativa%',
  'ferramenta baixada do patrimônio não sai');

select tests.entrar('00000000-0000-0000-0000-00000000000d');
select tests.afirmar((select count(*) from emprestimo_ferramenta) = 0, 'outra empresa não vê os empréstimos');

-- ---------------------------------------------------------------- auditoria
reset role;
select tests.afirmar(
  (select count(*) from audit_log where tabela = 'movimento_estoque' and acao = 'INSERT') = 6,
  'cada movimento fica no audit_log (3 entradas, 2 saídas, 1 ajuste)');
select tests.afirmar(
  exists (select 1 from audit_log where tabela = 'saldo_estoque' and acao = 'UPDATE'
            and antes ->> 'quantidade' = '110.0000' and depois ->> 'quantidade' = '105.0000'),
  'mudança de saldo fica no audit_log com antes e depois');
select tests.afirmar(
  (select count(distinct registro_id) from audit_log where tabela = 'saldo_estoque') = 2,
  'cada saldo tem um registro próprio no audit_log');
select tests.afirmar(
  exists (select 1 from audit_log where tabela = 'emprestimo_ferramenta' and acao = 'UPDATE' and depois ->> 'devolvida_em' is not null)
  and exists (select 1 from audit_log where tabela = 'item_estoque' and acao = 'UPDATE' and depois ->> 'ativo' = 'false'),
  'devolução e baixa de ferramenta ficam no audit_log');

rollback;
