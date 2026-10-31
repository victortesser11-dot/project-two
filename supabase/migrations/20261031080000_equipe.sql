-- =============================================================================
-- Sprint 3 — RF-301 a 303: pessoas, empreiteiras, custo com vigência, chamada
-- diária e custo de mão de obra por tarefa.
--
-- * Cadastro (empreiteiras e pessoas) é da empresa e vale para todas as obras.
--   Gere o cadastro: admin da empresa ou engenheiro de alguma obra dela.
-- * CPF: validado pelo dígito verificador (no banco e no Zod). O cliente NÃO lê
--   a coluna cpf (grant por coluna); vê só cpf_mascarado (***.456.789-**). LGPD.
-- * Custo (hora, diária ou produção) tem vigência: vale o mais recente com
--   vigente_desde ≤ dia. Só muda por definir_custo_mao_obra (regra 3) e só quem
--   vê custos lê (admin, engenheiro, financeiro).
-- * Chamada: registrar_chamada grava presença e divide o dia de cada pessoa
--   entre tarefas (horas e, se houver, quantidade produzida). Substitui o que
--   já havia para aquela pessoa naquele dia e obra.
-- * Custo de mão de obra é calculado no banco (custo_mao_obra_projeto): hora =
--   horas × valor; diária = valor rateado pelas horas do dia na obra;
--   produção = quantidade × valor.
-- =============================================================================

create type public.tipo_custo_mao_obra as enum ('hora', 'diaria', 'producao');

-- -----------------------------------------------------------------------------
-- Permissões
-- -----------------------------------------------------------------------------
create or replace function app.pode_gerir_equipe(p_empresa uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select coalesce(app.e_admin_empresa(p_empresa) or exists (
    select 1 from public.membro_projeto mp
      join public.projeto p on p.id = mp.projeto_id
     where p.empresa_id = p_empresa and mp.usuario_id = auth.uid() and mp.papel = 'engenheiro'), false);
$$;

create or replace function app.pode_ver_custos(p_empresa uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select coalesce(app.e_admin_empresa(p_empresa) or exists (
    select 1 from public.membro_projeto mp
      join public.projeto p on p.id = mp.projeto_id
     where p.empresa_id = p_empresa and mp.usuario_id = auth.uid() and mp.papel in ('engenheiro', 'financeiro')), false);
$$;

revoke all on function app.pode_gerir_equipe(uuid), app.pode_ver_custos(uuid) from public;
grant execute on function app.pode_gerir_equipe(uuid), app.pode_ver_custos(uuid) to authenticated;

-- CPF válido pelos dois dígitos verificadores (rejeita 000.000.000-00 etc.).
create or replace function app.cpf_valido(p text)
returns boolean language plpgsql immutable set search_path = '' as $$
declare
  d integer[];
  s integer;
  r integer;
  i integer;
begin
  if p is null or p !~ '^\d{11}$' or p ~ '^(\d)\1{10}$' then
    return false;
  end if;
  d := array(select substr(p, g, 1)::integer from generate_series(1, 11) as g);
  s := 0;
  for i in 1..9 loop s := s + d[i] * (11 - i); end loop;
  r := (s * 10) % 11;
  if r = 10 then r := 0; end if;
  if r <> d[10] then return false; end if;
  s := 0;
  for i in 1..10 loop s := s + d[i] * (12 - i); end loop;
  r := (s * 10) % 11;
  if r = 10 then r := 0; end if;
  return r = d[11];
end;
$$;

-- -----------------------------------------------------------------------------
-- Empreiteiras e pessoas (cadastro da empresa)
-- -----------------------------------------------------------------------------
create table public.empreiteira (
  id             uuid primary key default gen_random_uuid(),
  empresa_id     uuid not null references public.empresa(id) on delete cascade,
  nome           text not null check (length(btrim(nome)) between 2 and 160),
  cnpj           text check (cnpj is null or cnpj ~ '^\d{14}$'),
  situacao_cnpj  text check (situacao_cnpj is null or length(situacao_cnpj) <= 40),
  telefone       text check (telefone is null or length(telefone) <= 30),
  ativa          boolean not null default true,
  criado_em      timestamptz not null default now(),
  atualizado_em  timestamptz not null default now(),
  constraint empreiteira_cnpj_uk unique (empresa_id, cnpj)
);
create index empreiteira_empresa_idx on public.empreiteira (empresa_id);

create table public.trabalhador (
  id              uuid primary key default gen_random_uuid(),
  empresa_id      uuid not null references public.empresa(id) on delete cascade,
  nome            text not null check (length(btrim(nome)) between 2 and 160),
  cpf             text check (cpf is null or app.cpf_valido(cpf)),
  cpf_mascarado   text generated always as (
                    case when cpf is null then null
                         else '***.' || substr(cpf, 4, 3) || '.' || substr(cpf, 7, 3) || '-**' end) stored,
  funcao          text not null check (length(btrim(funcao)) between 1 and 80),
  empreiteira_id  uuid references public.empreiteira(id) on delete set null,
  telefone        text check (telefone is null or length(telefone) <= 30),
  ativo           boolean not null default true,
  criado_em       timestamptz not null default now(),
  atualizado_em   timestamptz not null default now(),
  constraint trabalhador_cpf_uk unique (empresa_id, cpf)
);
create index trabalhador_empresa_idx on public.trabalhador (empresa_id, nome);
create index trabalhador_empreiteira_idx on public.trabalhador (empreiteira_id);

-- Empreiteira da pessoa é da mesma empresa.
create or replace function app.tg_trabalhador_integridade()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.empreiteira_id is not null and not exists (
       select 1 from public.empreiteira where id = new.empreiteira_id and empresa_id = new.empresa_id) then
    raise exception 'Empreiteira não encontrada nesta empresa';
  end if;
  if tg_op = 'UPDATE' and new.empresa_id <> old.empresa_id then
    raise exception 'Uma pessoa não muda de empresa';
  end if;
  return new;
end;
$$;
create trigger trabalhador_integridade before insert or update on public.trabalhador
  for each row execute function app.tg_trabalhador_integridade();

create trigger empreiteira_atualizado_em before update on public.empreiteira
  for each row execute function app.tg_atualizado_em();
create trigger trabalhador_atualizado_em before update on public.trabalhador
  for each row execute function app.tg_atualizado_em();
create trigger empreiteira_auditoria after insert or update or delete on public.empreiteira
  for each row execute function app.tg_auditoria('atualizado_em');
create trigger trabalhador_auditoria after insert or update or delete on public.trabalhador
  for each row execute function app.tg_auditoria('atualizado_em');

-- -----------------------------------------------------------------------------
-- Custo com vigência
-- -----------------------------------------------------------------------------
create table public.custo_mao_obra (
  id                uuid primary key default gen_random_uuid(),
  empresa_id        uuid not null references public.empresa(id) on delete cascade,
  trabalhador_id    uuid not null references public.trabalhador(id) on delete cascade,
  tipo              public.tipo_custo_mao_obra not null,
  valor             numeric(12, 2) not null check (valor > 0),
  unidade_producao  text check (unidade_producao is null or length(btrim(unidade_producao)) between 1 and 20),
  vigente_desde     date not null,
  criado_por        uuid references auth.users(id) on delete set null,
  criado_em         timestamptz not null default now(),
  constraint custo_mao_obra_vigencia_uk unique (trabalhador_id, vigente_desde),
  constraint custo_mao_obra_unidade_ck check ((tipo = 'producao') = (unidade_producao is not null))
);
create index custo_mao_obra_empresa_idx on public.custo_mao_obra (empresa_id);
create index custo_mao_obra_criado_por_idx on public.custo_mao_obra (criado_por);

create trigger custo_mao_obra_auditoria after insert or update or delete on public.custo_mao_obra
  for each row execute function app.tg_auditoria();

-- -----------------------------------------------------------------------------
-- Equipe da obra e chamada
-- -----------------------------------------------------------------------------
create table public.equipe_projeto (
  projeto_id      uuid not null references public.projeto(id) on delete cascade,
  trabalhador_id  uuid not null references public.trabalhador(id) on delete cascade,
  empresa_id      uuid not null references public.empresa(id) on delete cascade,
  ativo           boolean not null default true,
  incluido_em     timestamptz not null default now(),
  primary key (projeto_id, trabalhador_id)
);
create index equipe_projeto_trabalhador_idx on public.equipe_projeto (trabalhador_id);
create index equipe_projeto_empresa_idx on public.equipe_projeto (empresa_id);

-- Empresa vem do projeto; a pessoa precisa ser da mesma empresa.
create or replace function app.tg_equipe_projeto_integridade()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  select p.empresa_id into new.empresa_id from public.projeto p where p.id = new.projeto_id;
  if new.empresa_id is null then
    raise exception 'Projeto não encontrado';
  end if;
  if not exists (select 1 from public.trabalhador where id = new.trabalhador_id and empresa_id = new.empresa_id) then
    raise exception 'Pessoa não encontrada nesta empresa';
  end if;
  return new;
end;
$$;
create trigger equipe_projeto_integridade before insert or update on public.equipe_projeto
  for each row execute function app.tg_equipe_projeto_integridade();
create trigger equipe_projeto_auditoria after insert or update or delete on public.equipe_projeto
  for each row execute function app.tg_auditoria();

create table public.apontamento_mao_obra (
  id              uuid primary key default gen_random_uuid(),
  empresa_id      uuid not null references public.empresa(id) on delete cascade,
  projeto_id      uuid not null references public.projeto(id) on delete cascade,
  data            date not null,
  trabalhador_id  uuid not null references public.trabalhador(id) on delete cascade,
  presente        boolean not null,
  tarefa_id       uuid references public.eap_item(id) on delete set null,
  horas           numeric(4, 2) check (horas is null or (horas > 0 and horas <= 24)),
  quantidade      numeric(16, 4) check (quantidade is null or quantidade >= 0),
  registrado_por  uuid references auth.users(id) on delete set null,
  registrado_em   timestamptz not null default now(),
  constraint apontamento_mao_obra_presenca_ck check (
    (presente and horas is not null) or (not presente and horas is null and quantidade is null and tarefa_id is null))
);
create index apontamento_mao_obra_projeto_idx on public.apontamento_mao_obra (projeto_id, data);
create index apontamento_mao_obra_trabalhador_idx on public.apontamento_mao_obra (trabalhador_id, data);
create index apontamento_mao_obra_tarefa_idx on public.apontamento_mao_obra (tarefa_id);
create index apontamento_mao_obra_empresa_idx on public.apontamento_mao_obra (empresa_id);
create index apontamento_mao_obra_registrado_por_idx on public.apontamento_mao_obra (registrado_por);

create trigger apontamento_mao_obra_auditoria after insert or update or delete on public.apontamento_mao_obra
  for each row execute function app.tg_auditoria();

-- -----------------------------------------------------------------------------
-- RLS e grants
-- -----------------------------------------------------------------------------
alter table public.empreiteira          enable row level security;
alter table public.trabalhador          enable row level security;
alter table public.custo_mao_obra       enable row level security;
alter table public.equipe_projeto       enable row level security;
alter table public.apontamento_mao_obra enable row level security;

create policy empreiteira_select on public.empreiteira for select to authenticated
  using (app.e_membro_empresa(empresa_id));
create policy empreiteira_insert on public.empreiteira for insert to authenticated
  with check (app.pode_gerir_equipe(empresa_id));
create policy empreiteira_update on public.empreiteira for update to authenticated
  using (app.pode_gerir_equipe(empresa_id)) with check (app.pode_gerir_equipe(empresa_id));

create policy trabalhador_select on public.trabalhador for select to authenticated
  using (app.e_membro_empresa(empresa_id));
create policy trabalhador_insert on public.trabalhador for insert to authenticated
  with check (app.pode_gerir_equipe(empresa_id));
create policy trabalhador_update on public.trabalhador for update to authenticated
  using (app.pode_gerir_equipe(empresa_id)) with check (app.pode_gerir_equipe(empresa_id));

create policy custo_mao_obra_select on public.custo_mao_obra for select to authenticated
  using (app.pode_ver_custos(empresa_id));

create policy equipe_projeto_select on public.equipe_projeto for select to authenticated
  using (app.pode_ver_projeto(projeto_id));
create policy equipe_projeto_insert on public.equipe_projeto for insert to authenticated
  with check (app.pode_editar_projeto(projeto_id));
create policy equipe_projeto_update on public.equipe_projeto for update to authenticated
  using (app.pode_editar_projeto(projeto_id)) with check (app.pode_editar_projeto(projeto_id));
create policy equipe_projeto_delete on public.equipe_projeto for delete to authenticated
  using (app.pode_editar_projeto(projeto_id));

create policy apontamento_mao_obra_select on public.apontamento_mao_obra for select to authenticated
  using (app.pode_ver_projeto(projeto_id));

revoke all on public.empreiteira, public.trabalhador, public.custo_mao_obra, public.equipe_projeto,
  public.apontamento_mao_obra from anon, authenticated;

grant select, insert, update on public.empreiteira to authenticated;
-- CPF completo não sai para o cliente: só as colunas abaixo (cpf_mascarado no lugar de cpf).
grant select (id, empresa_id, nome, cpf_mascarado, funcao, empreiteira_id, telefone, ativo, criado_em, atualizado_em)
  on public.trabalhador to authenticated;
grant insert (empresa_id, nome, cpf, funcao, empreiteira_id, telefone, ativo) on public.trabalhador to authenticated;
grant update (nome, cpf, funcao, empreiteira_id, telefone, ativo) on public.trabalhador to authenticated;
grant select on public.custo_mao_obra to authenticated;
grant select, insert, update, delete on public.equipe_projeto to authenticated;
grant select on public.apontamento_mao_obra to authenticated;

-- -----------------------------------------------------------------------------
-- Funções de escrita
-- -----------------------------------------------------------------------------

-- Lança (ou corrige, na mesma data) o custo de uma pessoa a partir de uma data.
create or replace function public.definir_custo_mao_obra(
  p_trabalhador_id   uuid,
  p_tipo             public.tipo_custo_mao_obra,
  p_valor            numeric,
  p_vigente_desde    date,
  p_unidade_producao text default null
)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_empresa uuid;
  v_id      uuid;
begin
  select empresa_id into v_empresa from public.trabalhador where id = p_trabalhador_id;
  if v_empresa is null or not app.pode_gerir_equipe(v_empresa) then
    raise exception 'Pessoa não encontrada ou sem permissão para lançar custos' using errcode = '42501';
  end if;
  if p_vigente_desde is null then
    raise exception 'Informe a partir de quando o custo vale';
  end if;

  insert into public.custo_mao_obra (empresa_id, trabalhador_id, tipo, valor, unidade_producao, vigente_desde, criado_por)
  values (v_empresa, p_trabalhador_id, p_tipo, p_valor,
          case when p_tipo = 'producao' then nullif(btrim(p_unidade_producao), '') end, p_vigente_desde, auth.uid())
  on conflict (trabalhador_id, vigente_desde)
  do update set tipo = excluded.tipo, valor = excluded.valor, unidade_producao = excluded.unidade_producao,
                criado_por = excluded.criado_por, criado_em = now()
  returning id into v_id;
  return v_id;
end;
$$;

-- Chamada do dia. p_linhas: [{trabalhador_id, presente, alocacoes: [{tarefa_id, horas, quantidade}]}].
-- Substitui o que havia para cada pessoa da lista naquele dia e obra. Devolve quantos vieram.
create or replace function public.registrar_chamada(p_projeto_id uuid, p_data date, p_linhas jsonb)
returns integer language plpgsql security definer set search_path = '' as $$
declare
  v_empresa  uuid;
  v_hoje     date := (now() at time zone 'America/Sao_Paulo')::date;
  v_problema text;
begin
  if not app.pode_apontar_campo(p_projeto_id) then
    raise exception 'Sem permissão para fazer a chamada desta obra' using errcode = '42501';
  end if;
  if p_data is null or p_data > v_hoje then
    raise exception 'A chamada não pode ser de um dia futuro';
  end if;
  if p_data < v_hoje - 60 and app.papel_no_projeto(p_projeto_id) <> 'engenheiro' then
    raise exception 'Chamadas de mais de 60 dias atrás só podem ser lançadas pelo engenheiro';
  end if;
  if p_linhas is null or jsonb_typeof(p_linhas) <> 'array' or jsonb_array_length(p_linhas) = 0 then
    raise exception 'Chamada vazia';
  end if;
  if jsonb_array_length(p_linhas) > 500 then
    raise exception 'A chamada aceita até 500 pessoas por vez';
  end if;
  select empresa_id into v_empresa from public.projeto where id = p_projeto_id;

  -- Cada pessoa da chamada está na equipe desta obra.
  select string_agg(coalesce(l ->> 'trabalhador_id', '(vazio)'), ', ') into v_problema
    from jsonb_array_elements(p_linhas) l
   where not exists (select 1 from public.equipe_projeto e
                      where e.projeto_id = p_projeto_id
                        and e.trabalhador_id::text = l ->> 'trabalhador_id');
  if v_problema is not null then
    raise exception 'Pessoas fora da equipe desta obra: %', v_problema;
  end if;

  -- Pessoa repetida na mesma chamada.
  select string_agg(t, ', ') into v_problema
    from (select l ->> 'trabalhador_id' as t from jsonb_array_elements(p_linhas) l group by 1 having count(*) > 1) r;
  if v_problema is not null then
    raise exception 'Pessoa repetida na chamada: %', v_problema;
  end if;

  -- Presente precisa de pelo menos uma tarefa e de no máximo 24 h no dia.
  select string_agg(l ->> 'trabalhador_id', ', ') into v_problema
    from jsonb_array_elements(p_linhas) l
   where coalesce((l ->> 'presente')::boolean, false)
     and (jsonb_typeof(l -> 'alocacoes') is distinct from 'array' or jsonb_array_length(l -> 'alocacoes') = 0
          or (select coalesce(sum((a ->> 'horas')::numeric), 0) from jsonb_array_elements(l -> 'alocacoes') a) > 24
          or exists (select 1 from jsonb_array_elements(l -> 'alocacoes') a where coalesce((a ->> 'horas')::numeric, 0) <= 0));
  if v_problema is not null then
    raise exception 'Quem veio precisa de pelo menos uma tarefa, cada uma com horas, e de no máximo 24 h no dia: %', v_problema;
  end if;

  -- Tarefas são desta obra (alocação sem tarefa também é recusada).
  select string_agg(distinct coalesce(a ->> 'tarefa_id', '(sem tarefa)'), ', ') into v_problema
    from jsonb_array_elements(p_linhas) l
    cross join lateral jsonb_array_elements(case when jsonb_typeof(l -> 'alocacoes') = 'array' then l -> 'alocacoes' else '[]'::jsonb end) a
   where coalesce((l ->> 'presente')::boolean, false)
     and not exists (select 1 from public.eap_item t
                      where t.id::text = a ->> 'tarefa_id' and t.projeto_id = p_projeto_id and t.tipo = 'tarefa');
  if v_problema is not null then
    raise exception 'Tarefa não encontrada nesta obra: %', v_problema;
  end if;

  delete from public.apontamento_mao_obra
   where projeto_id = p_projeto_id and data = p_data
     and trabalhador_id in (select (l ->> 'trabalhador_id')::uuid from jsonb_array_elements(p_linhas) l);

  insert into public.apontamento_mao_obra (empresa_id, projeto_id, data, trabalhador_id, presente, tarefa_id, horas, quantidade, registrado_por)
  select v_empresa, p_projeto_id, p_data, (l ->> 'trabalhador_id')::uuid, true,
         (a ->> 'tarefa_id')::uuid, (a ->> 'horas')::numeric, nullif(a ->> 'quantidade', '')::numeric, auth.uid()
    from jsonb_array_elements(p_linhas) l
    cross join lateral jsonb_array_elements(l -> 'alocacoes') a
   where coalesce((l ->> 'presente')::boolean, false)
  union all
  select v_empresa, p_projeto_id, p_data, (l ->> 'trabalhador_id')::uuid, false, null, null, null, auth.uid()
    from jsonb_array_elements(p_linhas) l
   where not coalesce((l ->> 'presente')::boolean, false);

  return (select count(*)::integer from jsonb_array_elements(p_linhas) l where coalesce((l ->> 'presente')::boolean, false));
end;
$$;

-- -----------------------------------------------------------------------------
-- Custo de mão de obra (RF-303): uma linha por apontamento, com o custo vigente
-- no dia. Só engenheiro e financeiro do projeto (admin conta como engenheiro).
-- -----------------------------------------------------------------------------
create or replace function public.custo_mao_obra_projeto(p_projeto_id uuid, p_de date default null, p_ate date default null)
returns table (
  data            date,
  trabalhador_id  uuid,
  tarefa_id       uuid,
  horas           numeric,
  quantidade      numeric,
  tipo            public.tipo_custo_mao_obra,
  valor_unitario  numeric,
  custo           numeric
)
language plpgsql stable security definer set search_path = '' as $$
#variable_conflict use_column
begin
  if coalesce(app.papel_no_projeto(p_projeto_id) in ('engenheiro', 'financeiro'), false) is false then
    raise exception 'Sem permissão para ver custos desta obra' using errcode = '42501';
  end if;

  return query
  with ap as (
    select a.*, sum(a.horas) over (partition by a.trabalhador_id, a.data) as horas_dia
      from public.apontamento_mao_obra a
     where a.projeto_id = p_projeto_id and a.presente
       and (p_de is null or a.data >= p_de) and (p_ate is null or a.data <= p_ate)
  )
  select ap.data, ap.trabalhador_id, ap.tarefa_id, ap.horas, ap.quantidade, c.tipo, c.valor,
         round(case c.tipo
                 when 'hora'   then ap.horas * c.valor
                 when 'diaria' then c.valor * ap.horas / nullif(ap.horas_dia, 0)
                 else coalesce(ap.quantidade, 0) * c.valor
               end, 2)
    from ap
    left join lateral (
      select cm.tipo, cm.valor from public.custo_mao_obra cm
       where cm.trabalhador_id = ap.trabalhador_id and cm.vigente_desde <= ap.data
       order by cm.vigente_desde desc limit 1
    ) c on true
   order by ap.data, ap.trabalhador_id;
end;
$$;

revoke all on function app.cpf_valido(text) from public;
grant execute on function app.cpf_valido(text) to authenticated;

revoke all on function
  public.definir_custo_mao_obra(uuid, public.tipo_custo_mao_obra, numeric, date, text),
  public.registrar_chamada(uuid, date, jsonb),
  public.custo_mao_obra_projeto(uuid, date, date)
from public, anon;
grant execute on function
  public.definir_custo_mao_obra(uuid, public.tipo_custo_mao_obra, numeric, date, text),
  public.registrar_chamada(uuid, date, jsonb),
  public.custo_mao_obra_projeto(uuid, date, date)
to authenticated;
