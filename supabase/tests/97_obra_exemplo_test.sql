-- Obra de exemplo: só o admin cria e apaga, uma por empresa, a marca não é forjada e o apagar não leva
-- nada de obra real. Confere também o volume (seed realista do PRD).
\set ON_ERROR_STOP 1
begin;

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-00000000000a', 'ana@a.test'),    -- admin da empresa A
  ('00000000-0000-0000-0000-00000000000b', 'bruno@a.test'),  -- engenheiro (não admin)
  ('00000000-0000-0000-0000-00000000000d', 'davi@b.test');   -- admin da empresa B

set local role authenticated;
select tests.entrar('00000000-0000-0000-0000-00000000000a');
select set_config('t.a', criar_empresa('Construtora A')::text, true);
select adicionar_membro_empresa(current_setting('t.a')::uuid, 'bruno@a.test');
select tests.entrar('00000000-0000-0000-0000-00000000000d');
select set_config('t.b', criar_empresa('Construtora B')::text, true);

-- ---------------------------------------------------------------- quem cria
select tests.entrar('00000000-0000-0000-0000-00000000000b');
select tests.deve_falhar(format($$select criar_obra_exemplo(%L)$$, current_setting('t.a')), 'quem não é admin não cria a obra de exemplo');
select tests.entrar('00000000-0000-0000-0000-00000000000d');
select tests.deve_falhar(format($$select criar_obra_exemplo(%L)$$, current_setting('t.a')), 'admin de outra empresa não cria');

select tests.entrar('00000000-0000-0000-0000-00000000000a');
select set_config('t.inicio', clock_timestamp()::text, true);
select set_config('t.p', criar_obra_exemplo(current_setting('t.a')::uuid)::text, true);
select tests.afirmar(clock_timestamp() - current_setting('t.inicio')::timestamptz < interval '8 seconds',
  format('cria em menos de 8 s (limite do Supabase): %s', clock_timestamp() - current_setting('t.inicio')::timestamptz));
select tests.deve_falhar(format($$select criar_obra_exemplo(%L)$$, current_setting('t.a')), 'só uma obra de exemplo por empresa');

-- ---------------------------------------------------------------- volume e coerência
select tests.afirmar((select exemplo and status = 'em_andamento' from projeto where id = current_setting('t.p')::uuid), 'obra marcada como exemplo');
select tests.afirmar((select count(*) from eap_item where projeto_id = current_setting('t.p')::uuid and tipo = 'tarefa') >= 130, 'EAP com mais de 130 tarefas');
select tests.afirmar((select count(*) from eap_dependencia where projeto_id = current_setting('t.p')::uuid) >= 80, 'tarefas ligadas por dependências');
select tests.afirmar((select qtd_tarefas from linha_base where projeto_id = current_setting('t.p')::uuid) >= 130, 'linha de base definida');
select tests.afirmar(
  (select count(*) from eap_item where projeto_id = current_setting('t.p')::uuid and fim_previsto > fim_base) > 20,
  'reprogramação: parte do cronograma passou da linha de base');
select tests.afirmar((select count(*) from avanco_tarefa where projeto_id = current_setting('t.p')::uuid) > 100, 'avanço apontado');
select tests.afirmar(
  (select percentual_fisico from eap_do_projeto(current_setting('t.p')::uuid) where nome = 'Fundação') = 100,
  'fundação concluída');
select tests.afirmar(
  (select percentual_fisico between 15 and 60 from eap_do_projeto(current_setting('t.p')::uuid) where nome = 'Estrutura'),
  'estrutura em andamento');
select tests.afirmar((select count(*) from trabalhador where exemplo) = 30, '30 pessoas (cadastros, sem login)');
reset role;
select tests.afirmar((select count(*) from auth.users) = 3, 'nenhuma conta de login criada');
set local role authenticated;
select tests.afirmar((select count(distinct data) from apontamento_mao_obra where projeto_id = current_setting('t.p')::uuid) >= 55, 'chamada de mais de 55 dias');
select tests.afirmar((select count(*) from custo_mao_obra_projeto(current_setting('t.p')::uuid)) > 1000, 'mais de 1.000 linhas de mão de obra (testa a paginação)');
select tests.afirmar((select count(*) from diario_obra where projeto_id = current_setting('t.p')::uuid and status = 'assinado') >= 50, 'diários assinados');
select tests.afirmar((select count(*) from diario_obra where projeto_id = current_setting('t.p')::uuid and status = 'rascunho') between 1 and 3, 'últimos diários como rascunho');
select tests.afirmar((select count(*) from item_estoque where exemplo) >= 130, 'catálogo com mais de 130 itens');
select tests.afirmar((select count(*) from movimento_estoque where projeto_id = current_setting('t.p')::uuid and tipo = 'saida') > 50, 'saídas para as tarefas');
select tests.afirmar(
  (select count(*) from saldo_estoque s join item_estoque i on i.id = s.item_id
    where s.projeto_id = current_setting('t.p')::uuid and s.quantidade < i.estoque_minimo) > 0,
  'há itens abaixo do mínimo (alerta aparece)');
select tests.afirmar((select count(*) from emprestimo_ferramenta where projeto_id = current_setting('t.p')::uuid and devolvida_em is null) = 3, 'três ferramentas emprestadas');
select tests.afirmar(
  (select sum(material) > 0 and sum(mao_obra) > 0 and sum(despesas) > 0 and sum(comprometido) > 0 from orcado_realizado(current_setting('t.p')::uuid)),
  'orçado × realizado com material, mão de obra, despesas e comprometido');

-- ---------------------------------------------------------------- outra empresa e a marca
select tests.entrar('00000000-0000-0000-0000-00000000000d');
select tests.afirmar((select count(*) from projeto where id = current_setting('t.p')::uuid) = 0, 'outra empresa não vê a obra de exemplo');
select tests.deve_falhar(format($$select excluir_obra_exemplo(%L)$$, current_setting('t.a')), 'admin de outra empresa não apaga');

select tests.entrar('00000000-0000-0000-0000-00000000000a');
select set_config('t.real', criar_projeto(current_setting('t.a')::uuid, 'Obra real')::text, true);
select tests.deve_falhar(format($$update projeto set exemplo = true where id = %L$$, current_setting('t.real')),
  'não dá para marcar uma obra real como exemplo');
select tests.deve_falhar(format($$insert into item_estoque (empresa_id, codigo, nome, tipo, unidade, exemplo) values (%L, '', 'Forjado', 'material', 'un', true)$$,
  current_setting('t.a')), 'não dá para cadastrar item como exemplo');
select tests.deve_falhar(format($$update projeto set exemplo = false where id = %L$$, current_setting('t.p')),
  'nem desmarcar a obra de exemplo');

-- Uma pessoa do exemplo passou a trabalhar na obra real: ela fica ao apagar o exemplo.
insert into equipe_projeto (projeto_id, trabalhador_id, empresa_id)
select current_setting('t.real')::uuid, id, current_setting('t.a')::uuid from trabalhador where nome = 'Antônio Carlos Ribeiro';

select tests.entrar('00000000-0000-0000-0000-00000000000b');
select tests.deve_falhar(format($$select excluir_obra_exemplo(%L)$$, current_setting('t.a')), 'quem não é admin não apaga');

-- ---------------------------------------------------------------- apagar
select tests.entrar('00000000-0000-0000-0000-00000000000a');
select tests.afirmar(excluir_obra_exemplo(current_setting('t.a')::uuid) = 1, 'admin apaga a obra de exemplo');
select tests.afirmar((select count(*) from projeto where exemplo) = 0, 'a obra sumiu');
select tests.afirmar((select count(*) from projeto where id = current_setting('t.real')::uuid) = 1, 'a obra real ficou');
select tests.afirmar((select count(*) from trabalhador where exemplo) = 1, 'só fica a pessoa do exemplo que está na obra real');
select tests.afirmar((select count(*) from item_estoque where exemplo) = 0 and (select count(*) from empreiteira where exemplo) = 0,
  'itens e empreiteiras do exemplo saíram');
select tests.afirmar(criar_obra_exemplo(current_setting('t.a')::uuid) is not null, 'dá para criar de novo depois de apagar');

rollback;
