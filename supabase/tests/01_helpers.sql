-- Ajudantes de teste. Funcionam tanto no Postgres puro (com o shim) quanto
-- num Supabase local, pois só dependem de auth.users e auth.uid().

create schema if not exists tests;
grant usage on schema tests to authenticated, anon;

-- Simula a requisição de um usuário logado (ou anônimo, se p_usuario for null).
create or replace function tests.entrar(p_usuario uuid)
returns void language plpgsql as $$
begin
  perform set_config('request.jwt.claims',
    case when p_usuario is null then '' else json_build_object('sub', p_usuario, 'role', 'authenticated')::text end,
    true);
  perform set_config('request.jwt.claim.sub', coalesce(p_usuario::text, ''), true);
end;
$$;

create or replace function tests.afirmar(p_condicao boolean, p_mensagem text)
returns void language plpgsql as $$
begin
  if p_condicao is distinct from true then
    raise exception 'FALHOU: %', p_mensagem;
  end if;
  raise notice 'ok - %', p_mensagem;
end;
$$;

-- Executa o SQL e exige que ele dê erro.
create or replace function tests.deve_falhar(p_sql text, p_mensagem text)
returns void language plpgsql as $$
begin
  begin
    execute p_sql;
  exception when others then
    raise notice 'ok - % (erro esperado: %)', p_mensagem, sqlerrm;
    return;
  end;
  raise exception 'FALHOU: % (o comando deveria ter falhado)', p_mensagem;
end;
$$;

-- Executa o SQL e devolve quantas linhas ele afetou.
create or replace function tests.linhas_afetadas(p_sql text)
returns integer language plpgsql as $$
declare
  v integer;
begin
  execute p_sql;
  get diagnostics v = row_count;
  return v;
end;
$$;

grant execute on all functions in schema tests to authenticated, anon;
