-- Testes de isolamento entre empresas e de papéis no projeto.
-- Tudo roda numa transação e é desfeito no final.
\set ON_ERROR_STOP 1
begin;

-- Pessoas do cenário
insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-00000000000a', 'ana@a.test'),    -- admin da empresa A
  ('00000000-0000-0000-0000-00000000000b', 'bruno@a.test'),  -- membro de A, engenheiro do projeto
  ('00000000-0000-0000-0000-00000000000c', 'carla@a.test'),  -- membro de A, só leitura no projeto
  ('00000000-0000-0000-0000-00000000000d', 'davi@b.test'),   -- admin da empresa B
  ('00000000-0000-0000-0000-00000000000e', 'eva@x.test');    -- sem empresa

set local role authenticated;

-- ---------------------------------------------------------------- anônimo
select tests.entrar(null);
select tests.deve_falhar($$select criar_empresa('Anônima Ltda')$$, 'anônimo não cria empresa');

-- ---------------------------------------------------------------- empresas
select tests.entrar('00000000-0000-0000-0000-00000000000a');
select set_config('t.empresa_a', criar_empresa('Construtora A')::text, true);
select tests.afirmar(
  (select papel from membro_empresa where usuario_id = auth.uid()) = 'admin',
  'quem cria a empresa vira admin');
select tests.afirmar((select count(*) from empresa) = 1, 'admin vê a própria empresa');

select tests.entrar('00000000-0000-0000-0000-00000000000d');
select set_config('t.empresa_b', criar_empresa('Construtora B')::text, true);
select tests.afirmar((select count(*) from empresa) = 1, 'admin de B vê só a empresa B');
select tests.afirmar(
  (select count(*) from empresa where id = current_setting('t.empresa_a')::uuid) = 0,
  'admin de B não vê a empresa A');

select tests.deve_falhar(
  $$insert into empresa (nome) values ('Direta Ltda')$$,
  'empresa não é criada por insert direto');

-- ---------------------------------------------------------------- membros da empresa
select tests.entrar('00000000-0000-0000-0000-00000000000a');
select adicionar_membro_empresa(current_setting('t.empresa_a')::uuid, 'bruno@a.test');
select adicionar_membro_empresa(current_setting('t.empresa_a')::uuid, 'CARLA@a.test');
select tests.afirmar((select count(*) from membro_empresa) = 3, 'admin adiciona membros por e-mail (sem diferenciar maiúsculas)');
select tests.deve_falhar(
  format($$select adicionar_membro_empresa(%L, 'ninguem@x.test')$$, current_setting('t.empresa_a')),
  'e-mail sem conta é recusado');

select tests.entrar('00000000-0000-0000-0000-00000000000c');
select tests.deve_falhar(
  format($$select adicionar_membro_empresa(%L, 'eva@x.test')$$, current_setting('t.empresa_a')),
  'membro comum não adiciona pessoas à empresa');
select tests.deve_falhar(
  format($$insert into membro_empresa (empresa_id, usuario_id) values (%L, '00000000-0000-0000-0000-00000000000e')$$,
         current_setting('t.empresa_a')),
  'membro comum não insere direto em membro_empresa');
select tests.afirmar(
  tests.linhas_afetadas($$update membro_empresa set papel = 'admin' where usuario_id = auth.uid()$$) = 0,
  'membro comum não se promove a admin');

select tests.entrar('00000000-0000-0000-0000-00000000000a');
select tests.deve_falhar(
  $$delete from membro_empresa where usuario_id = auth.uid()$$,
  'o último admin não pode sair da empresa');
select tests.deve_falhar(
  $$update membro_empresa set papel = 'membro' where usuario_id = auth.uid()$$,
  'o último admin não pode rebaixar a si mesmo');

-- ---------------------------------------------------------------- projetos
select tests.entrar('00000000-0000-0000-0000-00000000000b');
select set_config('t.projeto', criar_projeto(
  current_setting('t.empresa_a')::uuid, 'Residencial Aurora', 'Rua das Obras, 100',
  '2026-11-03', '2027-08-30', 4500000, 'em_andamento')::text, true);
select tests.afirmar(
  (select papel from membro_projeto where projeto_id = current_setting('t.projeto')::uuid and usuario_id = auth.uid()) = 'engenheiro',
  'quem cria o projeto vira engenheiro dele');
select tests.afirmar(
  (select responsavel_id from projeto where id = current_setting('t.projeto')::uuid) = auth.uid(),
  'criador é o responsável inicial');

select tests.deve_falhar(
  format($$select criar_projeto(%L, 'Datas trocadas', null, '2027-01-10', '2026-12-01')$$, current_setting('t.empresa_a')),
  'fim previsto antes do início é recusado');
select tests.deve_falhar(
  format($$select criar_projeto(%L, 'Sem verba', null, null, null, 0)$$, current_setting('t.empresa_a')),
  'orçamento zero é recusado');
select tests.deve_falhar(
  format($$insert into projeto (empresa_id, nome) values (%L, 'Direto')$$, current_setting('t.empresa_a')),
  'projeto não é criado por insert direto');

select tests.entrar('00000000-0000-0000-0000-00000000000d');
select tests.deve_falhar(
  format($$select criar_projeto(%L, 'Invasão')$$, current_setting('t.empresa_a')),
  'admin de outra empresa não cria projeto em A');
select tests.afirmar((select count(*) from projeto) = 0, 'admin de B não vê projetos de A');
select tests.afirmar(
  tests.linhas_afetadas(format($$update projeto set nome = 'Hackeado' where id = %L$$, current_setting('t.projeto'))) = 0,
  'admin de B não altera projetos de A');

select tests.entrar('00000000-0000-0000-0000-00000000000e');
select tests.afirmar((select count(*) from projeto) = 0, 'usuário sem empresa não vê projetos');
select tests.afirmar((select count(*) from empresa) = 0, 'usuário sem empresa não vê empresas');

-- ---------------------------------------------------------------- membros do projeto
select tests.entrar('00000000-0000-0000-0000-00000000000c');
select tests.afirmar((select count(*) from projeto) = 0, 'membro da empresa sem vínculo não vê o projeto');

select tests.entrar('00000000-0000-0000-0000-00000000000b');
insert into membro_projeto (projeto_id, usuario_id, empresa_id, papel)
values (current_setting('t.projeto')::uuid, '00000000-0000-0000-0000-00000000000c',
        current_setting('t.empresa_b')::uuid, 'leitura');
select tests.afirmar(
  (select empresa_id from membro_projeto where usuario_id = '00000000-0000-0000-0000-00000000000c')
    = current_setting('t.empresa_a')::uuid,
  'empresa_id do vínculo vem do projeto, não do cliente');
select tests.deve_falhar(
  format($$insert into membro_projeto (projeto_id, usuario_id, empresa_id) values (%L, '00000000-0000-0000-0000-00000000000d', %L)$$,
         current_setting('t.projeto'), current_setting('t.empresa_a')),
  'engenheiro não adiciona ao projeto quem é de outra empresa');

select tests.entrar('00000000-0000-0000-0000-00000000000c');
select tests.afirmar((select count(*) from projeto) = 1, 'leitura vê o projeto');
select tests.afirmar(
  tests.linhas_afetadas(format($$update projeto set nome = 'Alterado' where id = %L$$, current_setting('t.projeto'))) = 0,
  'leitura não altera o projeto');
select tests.deve_falhar(
  format($$insert into membro_projeto (projeto_id, usuario_id, empresa_id) values (%L, '00000000-0000-0000-0000-00000000000a', %L)$$,
         current_setting('t.projeto'), current_setting('t.empresa_a')),
  'leitura não convida pessoas');
select tests.afirmar(
  tests.linhas_afetadas($$update membro_projeto set papel = 'engenheiro' where usuario_id = auth.uid()$$) = 0,
  'leitura não se promove a engenheiro');

select tests.entrar('00000000-0000-0000-0000-00000000000b');
select tests.afirmar(
  tests.linhas_afetadas(format($$update projeto set status = 'pausado' where id = %L$$, current_setting('t.projeto'))) = 1,
  'engenheiro altera o projeto');
select tests.afirmar(
  tests.linhas_afetadas(format($$delete from projeto where id = %L$$, current_setting('t.projeto'))) = 0,
  'engenheiro não apaga o projeto');

select tests.entrar('00000000-0000-0000-0000-00000000000a');
select tests.afirmar((select count(*) from projeto) = 1, 'admin da empresa vê todos os projetos dela');
select tests.afirmar(
  tests.linhas_afetadas(format($$update projeto set status = 'em_andamento' where id = %L$$, current_setting('t.projeto'))) = 1,
  'admin da empresa altera qualquer projeto');

-- ---------------------------------------------------------------- auditoria
select tests.afirmar(
  (select count(*) from audit_log where tabela = 'projeto' and acao = 'UPDATE') = 2,
  'cada alteração de projeto gera uma linha de auditoria');
select tests.afirmar(
  (select usuario_id from audit_log where tabela = 'projeto' and acao = 'UPDATE' order by id limit 1)
    = '00000000-0000-0000-0000-00000000000b',
  'a auditoria registra quem alterou');
select tests.afirmar(
  (select count(*) from audit_log where empresa_id = current_setting('t.empresa_b')::uuid) = 0,
  'admin de A não lê a auditoria de B');
select tests.deve_falhar($$delete from audit_log$$, 'ninguém apaga a auditoria');
select tests.deve_falhar($$update audit_log set acao = 'INSERT'$$, 'ninguém altera a auditoria');

select tests.entrar('00000000-0000-0000-0000-00000000000b');
select tests.afirmar((select count(*) from audit_log) = 0, 'quem não é admin não lê a auditoria');

-- ---------------------------------------------------------------- exclusão em cascata
select tests.entrar('00000000-0000-0000-0000-00000000000a');
select tests.afirmar(
  tests.linhas_afetadas(format($$delete from projeto where id = %L$$, current_setting('t.projeto'))) = 1,
  'admin apaga o projeto');
select tests.afirmar((select count(*) from membro_projeto) = 0, 'vínculos do projeto somem junto');

reset role;
select tests.afirmar(
  (select count(*) from audit_log where tabela = 'projeto' and acao = 'DELETE') = 1,
  'a exclusão fica registrada na auditoria');

rollback;
