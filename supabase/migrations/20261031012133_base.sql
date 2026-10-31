-- =============================================================================
-- Sprint 0 — base multiempresa: empresas, membros, projetos e auditoria.
--
-- Regras (ver CLAUDE.md):
--   * toda tabela de negócio tem empresa_id e RLS ligada;
--   * escrita sensível passa por funções do banco e gera audit_log;
--   * o cliente nunca recebe permissão além do que as políticas liberam.
-- =============================================================================

create extension if not exists pgcrypto with schema extensions;

create schema if not exists app;
comment on schema app is 'Funções auxiliares internas (permissões, auditoria). Não expor via API.';

-- -----------------------------------------------------------------------------
-- Tipos
-- -----------------------------------------------------------------------------
create type public.papel_empresa as enum ('admin', 'membro');

create type public.papel_projeto as enum (
  'engenheiro',  -- cria/edita o projeto, lança orçamento e materiais
  'mestre',      -- tarefas do dia, chamada da equipe
  'almoxarife',  -- entradas, saídas, ferramentas
  'financeiro',  -- orçamento, medições, fiscal
  'leitura'      -- cliente/investidor: só visualiza
);

create type public.status_projeto as enum ('planejamento', 'em_andamento', 'pausado', 'concluido');

-- -----------------------------------------------------------------------------
-- Tabelas
-- -----------------------------------------------------------------------------
create table public.empresa (
  id          uuid primary key default gen_random_uuid(),
  nome        text not null check (length(trim(nome)) between 2 and 120),
  criado_em   timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);

create table public.membro_empresa (
  empresa_id  uuid not null references public.empresa(id) on delete cascade,
  usuario_id  uuid not null references auth.users(id) on delete cascade,
  papel       public.papel_empresa not null default 'membro',
  criado_em   timestamptz not null default now(),
  primary key (empresa_id, usuario_id)
);
create index membro_empresa_usuario_idx on public.membro_empresa (usuario_id);

create table public.projeto (
  id                uuid primary key default gen_random_uuid(),
  empresa_id        uuid not null references public.empresa(id) on delete cascade,
  nome              text not null check (length(trim(nome)) between 2 and 160),
  endereco          text,
  data_inicio       date,
  data_fim_prevista date,
  orcamento_total   numeric(16, 2),
  status            public.status_projeto not null default 'planejamento',
  responsavel_id    uuid references auth.users(id) on delete set null,
  criado_por        uuid references auth.users(id) on delete set null,
  criado_em         timestamptz not null default now(),
  atualizado_em     timestamptz not null default now(),
  constraint projeto_datas_ck check (data_fim_prevista is null or data_inicio is null or data_fim_prevista >= data_inicio),
  constraint projeto_orcamento_ck check (orcamento_total is null or orcamento_total > 0)
);
create index projeto_empresa_idx on public.projeto (empresa_id);

create table public.membro_projeto (
  projeto_id  uuid not null references public.projeto(id) on delete cascade,
  usuario_id  uuid not null references auth.users(id) on delete cascade,
  empresa_id  uuid not null references public.empresa(id) on delete cascade,
  papel       public.papel_projeto not null default 'leitura',
  criado_em   timestamptz not null default now(),
  primary key (projeto_id, usuario_id)
);
create index membro_projeto_usuario_idx on public.membro_projeto (usuario_id);

-- Log imutável: só triggers escrevem; ninguém atualiza nem apaga pela API.
create table public.audit_log (
  id          bigint generated always as identity primary key,
  empresa_id  uuid not null,
  tabela      text not null,
  registro_id text not null,
  acao        text not null check (acao in ('INSERT', 'UPDATE', 'DELETE')),
  antes       jsonb,
  depois      jsonb,
  usuario_id  uuid,
  criado_em   timestamptz not null default now()
);
create index audit_log_empresa_idx on public.audit_log (empresa_id, criado_em desc);

-- -----------------------------------------------------------------------------
-- Funções de permissão (security definer para não recursar nas políticas)
-- -----------------------------------------------------------------------------
create or replace function app.e_membro_empresa(p_empresa uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.membro_empresa
    where empresa_id = p_empresa and usuario_id = auth.uid()
  );
$$;

create or replace function app.e_admin_empresa(p_empresa uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.membro_empresa
    where empresa_id = p_empresa and usuario_id = auth.uid() and papel = 'admin'
  );
$$;

-- Papel efetivo no projeto. Admin da empresa vale como 'engenheiro' em todos.
create or replace function app.papel_no_projeto(p_projeto uuid)
returns public.papel_projeto language sql stable security definer set search_path = '' as $$
  select coalesce(
    (select 'engenheiro'::public.papel_projeto
       from public.projeto p
       join public.membro_empresa me on me.empresa_id = p.empresa_id
      where p.id = p_projeto and me.usuario_id = auth.uid() and me.papel = 'admin'),
    (select mp.papel from public.membro_projeto mp
      where mp.projeto_id = p_projeto and mp.usuario_id = auth.uid())
  );
$$;

create or replace function app.pode_ver_projeto(p_projeto uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select app.papel_no_projeto(p_projeto) is not null;
$$;

create or replace function app.pode_editar_projeto(p_projeto uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select app.papel_no_projeto(p_projeto) = 'engenheiro';
$$;

create or replace function app.usuario_na_empresa(p_usuario uuid, p_empresa uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select exists (
    select 1 from public.membro_empresa where empresa_id = p_empresa and usuario_id = p_usuario
  );
$$;

revoke all on function app.e_membro_empresa(uuid), app.e_admin_empresa(uuid),
  app.papel_no_projeto(uuid), app.pode_ver_projeto(uuid), app.pode_editar_projeto(uuid),
  app.usuario_na_empresa(uuid, uuid) from public;
grant usage on schema app to authenticated;
grant execute on function app.e_membro_empresa(uuid), app.e_admin_empresa(uuid),
  app.papel_no_projeto(uuid), app.pode_ver_projeto(uuid), app.pode_editar_projeto(uuid),
  app.usuario_na_empresa(uuid, uuid) to authenticated;

-- -----------------------------------------------------------------------------
-- Triggers: atualizado_em, auditoria e regras de integridade
-- -----------------------------------------------------------------------------
create or replace function app.tg_atualizado_em()
returns trigger language plpgsql set search_path = '' as $$
begin
  new.atualizado_em := now();
  return new;
end;
$$;

create trigger empresa_atualizado_em before update on public.empresa
  for each row execute function app.tg_atualizado_em();
create trigger projeto_atualizado_em before update on public.projeto
  for each row execute function app.tg_atualizado_em();

create or replace function app.tg_auditoria()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  v_linha   jsonb := to_jsonb(coalesce(new, old));
  v_empresa uuid  := coalesce((v_linha ->> 'empresa_id')::uuid, (v_linha ->> 'id')::uuid);
  v_id      text  := coalesce(
                       v_linha ->> 'id',
                       concat_ws(':', v_linha ->> 'projeto_id', v_linha ->> 'empresa_id', v_linha ->> 'usuario_id'));
begin
  insert into public.audit_log (empresa_id, tabela, registro_id, acao, antes, depois, usuario_id)
  values (
    v_empresa,
    tg_table_name,
    v_id,
    tg_op,
    case when tg_op in ('UPDATE', 'DELETE') then to_jsonb(old) end,
    case when tg_op in ('INSERT', 'UPDATE') then to_jsonb(new) end,
    auth.uid()
  );
  return coalesce(new, old);
end;
$$;

create trigger empresa_auditoria after insert or update or delete on public.empresa
  for each row execute function app.tg_auditoria();
create trigger membro_empresa_auditoria after insert or update or delete on public.membro_empresa
  for each row execute function app.tg_auditoria();
create trigger projeto_auditoria after insert or update or delete on public.projeto
  for each row execute function app.tg_auditoria();
create trigger membro_projeto_auditoria after insert or update or delete on public.membro_projeto
  for each row execute function app.tg_auditoria();

-- membro_projeto.empresa_id sempre igual ao do projeto (não confia no cliente).
create or replace function app.tg_membro_projeto_empresa()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  select p.empresa_id into new.empresa_id from public.projeto p where p.id = new.projeto_id;
  if new.empresa_id is null then
    raise exception 'Projeto % não encontrado', new.projeto_id;
  end if;
  return new;
end;
$$;

create trigger membro_projeto_empresa before insert or update on public.membro_projeto
  for each row execute function app.tg_membro_projeto_empresa();

-- Uma empresa nunca fica sem administrador.
create or replace function app.tg_ultimo_admin()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if old.papel = 'admin'
     and (tg_op = 'DELETE' or new.papel <> 'admin')
     and exists (select 1 from public.empresa where id = old.empresa_id)
     and not exists (
       select 1 from public.membro_empresa
       where empresa_id = old.empresa_id and papel = 'admin' and usuario_id <> old.usuario_id
     ) then
    raise exception 'A empresa precisa de pelo menos um administrador';
  end if;
  return coalesce(new, old);
end;
$$;

create trigger membro_empresa_ultimo_admin before update or delete on public.membro_empresa
  for each row execute function app.tg_ultimo_admin();

-- -----------------------------------------------------------------------------
-- RLS
-- -----------------------------------------------------------------------------
alter table public.empresa        enable row level security;
alter table public.membro_empresa enable row level security;
alter table public.projeto        enable row level security;
alter table public.membro_projeto enable row level security;
alter table public.audit_log      enable row level security;

-- empresa: criada só pela função criar_empresa
create policy empresa_select on public.empresa for select to authenticated
  using (app.e_membro_empresa(id));
create policy empresa_update on public.empresa for update to authenticated
  using (app.e_admin_empresa(id)) with check (app.e_admin_empresa(id));

-- membro_empresa
create policy membro_empresa_select on public.membro_empresa for select to authenticated
  using (app.e_membro_empresa(empresa_id));
create policy membro_empresa_insert on public.membro_empresa for insert to authenticated
  with check (app.e_admin_empresa(empresa_id));
create policy membro_empresa_update on public.membro_empresa for update to authenticated
  using (app.e_admin_empresa(empresa_id)) with check (app.e_admin_empresa(empresa_id));
create policy membro_empresa_delete on public.membro_empresa for delete to authenticated
  using (app.e_admin_empresa(empresa_id));

-- projeto: criado só pela função criar_projeto (cria o vínculo do engenheiro junto)
create policy projeto_select on public.projeto for select to authenticated
  using (app.pode_ver_projeto(id));
create policy projeto_update on public.projeto for update to authenticated
  using (app.pode_editar_projeto(id)) with check (app.pode_editar_projeto(id));
create policy projeto_delete on public.projeto for delete to authenticated
  using (app.e_admin_empresa(empresa_id));

-- membro_projeto
create policy membro_projeto_select on public.membro_projeto for select to authenticated
  using (app.pode_ver_projeto(projeto_id));
create policy membro_projeto_insert on public.membro_projeto for insert to authenticated
  with check (app.pode_editar_projeto(projeto_id) and app.usuario_na_empresa(usuario_id, empresa_id));
create policy membro_projeto_update on public.membro_projeto for update to authenticated
  using (app.pode_editar_projeto(projeto_id))
  with check (app.pode_editar_projeto(projeto_id) and app.usuario_na_empresa(usuario_id, empresa_id));
create policy membro_projeto_delete on public.membro_projeto for delete to authenticated
  using (app.pode_editar_projeto(projeto_id));

-- audit_log: leitura só para admin da empresa; escrita só por trigger
create policy audit_log_select on public.audit_log for select to authenticated
  using (app.e_admin_empresa(empresa_id));

-- Privilégios: anon não acessa nada; authenticated passa pelas políticas.
revoke all on public.empresa, public.membro_empresa, public.projeto, public.membro_projeto, public.audit_log
  from anon, authenticated;
grant select, update                 on public.empresa        to authenticated;
grant select, insert, update, delete on public.membro_empresa to authenticated;
grant select, update, delete         on public.projeto        to authenticated;
grant select, insert, update, delete on public.membro_projeto to authenticated;
grant select                         on public.audit_log      to authenticated;

-- -----------------------------------------------------------------------------
-- Funções públicas (RPC)
-- -----------------------------------------------------------------------------

-- Cria a empresa e torna quem chamou o administrador.
create or replace function public.criar_empresa(p_nome text)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_usuario uuid := auth.uid();
  v_id      uuid;
begin
  if v_usuario is null then
    raise exception 'Faça login para criar uma empresa' using errcode = '42501';
  end if;

  insert into public.empresa (nome) values (trim(p_nome)) returning id into v_id;
  insert into public.membro_empresa (empresa_id, usuario_id, papel) values (v_id, v_usuario, 'admin');
  return v_id;
end;
$$;

-- Cria o projeto e torna quem chamou o engenheiro dele.
create or replace function public.criar_projeto(
  p_empresa_id        uuid,
  p_nome              text,
  p_endereco          text default null,
  p_data_inicio       date default null,
  p_data_fim_prevista date default null,
  p_orcamento_total   numeric default null,
  p_status            public.status_projeto default 'planejamento'
)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_usuario uuid := auth.uid();
  v_id      uuid;
begin
  if v_usuario is null or not app.e_membro_empresa(p_empresa_id) then
    raise exception 'Sem permissão para criar projetos nesta empresa' using errcode = '42501';
  end if;

  insert into public.projeto (
    empresa_id, nome, endereco, data_inicio, data_fim_prevista, orcamento_total, status,
    responsavel_id, criado_por
  ) values (
    p_empresa_id, trim(p_nome), nullif(trim(p_endereco), ''), p_data_inicio, p_data_fim_prevista,
    p_orcamento_total, p_status, v_usuario, v_usuario
  ) returning id into v_id;

  insert into public.membro_projeto (projeto_id, usuario_id, empresa_id, papel)
  values (v_id, v_usuario, p_empresa_id, 'engenheiro');

  return v_id;
end;
$$;

-- Admin adiciona à empresa alguém que já tem conta, pelo e-mail.
create or replace function public.adicionar_membro_empresa(
  p_empresa_id uuid,
  p_email      text,
  p_papel      public.papel_empresa default 'membro'
)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_usuario uuid;
begin
  if not app.e_admin_empresa(p_empresa_id) then
    raise exception 'Só administradores adicionam membros' using errcode = '42501';
  end if;

  select id into v_usuario from auth.users where lower(email) = lower(trim(p_email));
  if v_usuario is null then
    raise exception 'Nenhuma conta com o e-mail %', p_email using errcode = 'P0002';
  end if;

  insert into public.membro_empresa (empresa_id, usuario_id, papel)
  values (p_empresa_id, v_usuario, p_papel)
  on conflict (empresa_id, usuario_id) do update set papel = excluded.papel;
  return v_usuario;
end;
$$;

revoke all on function public.criar_empresa(text),
  public.criar_projeto(uuid, text, text, date, date, numeric, public.status_projeto),
  public.adicionar_membro_empresa(uuid, text, public.papel_empresa) from public, anon;
grant execute on function public.criar_empresa(text),
  public.criar_projeto(uuid, text, text, date, date, numeric, public.status_projeto),
  public.adicionar_membro_empresa(uuid, text, public.papel_empresa) to authenticated;
