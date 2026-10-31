-- =============================================================================
-- Sprint 2 — RF-201: dependências entre tarefas e linha de base.
--
-- * Dependências ligam duas tarefas do mesmo projeto: TI (término→início),
--   II (início→início) e TT (término→término), com defasagem em dias corridos.
-- * Recalcular empurra: quando uma predecessora termina mais tarde, a
--   sucessora anda para frente mantendo a duração. Nunca puxa para trás:
--   folga deixada pelo engenheiro é respeitada.
-- * Linha de base: cópia congelada de datas e custos das tarefas. Só a função
--   definir_linha_base escreve nela; o cliente continua só com SELECT.
-- * Tudo fica no audit_log (eap_item e eap_dependencia têm trigger).
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Linha de base: colunas no item + registro de quando foi definida
-- -----------------------------------------------------------------------------
alter table public.eap_item
  add column inicio_base date,
  add column fim_base    date,
  add column custo_base  numeric(16, 2);

comment on column public.eap_item.inicio_base is 'Início na linha de base (congelado por definir_linha_base).';

create table public.linha_base (
  projeto_id    uuid primary key references public.projeto(id) on delete cascade,
  empresa_id    uuid not null references public.empresa(id) on delete cascade,
  definida_em   timestamptz not null default now(),
  definida_por  uuid references auth.users(id) on delete set null,
  qtd_tarefas   integer not null check (qtd_tarefas >= 0)
);
create index linha_base_empresa_idx on public.linha_base (empresa_id);

create trigger linha_base_auditoria after insert or update or delete on public.linha_base
  for each row execute function app.tg_auditoria();

alter table public.linha_base enable row level security;
create policy linha_base_select on public.linha_base for select to authenticated
  using (app.pode_ver_projeto(projeto_id));
revoke all on public.linha_base from anon, authenticated;
grant select on public.linha_base to authenticated;

-- -----------------------------------------------------------------------------
-- Dependências
-- -----------------------------------------------------------------------------
create type public.tipo_dependencia as enum ('ti', 'ii', 'tt');

create table public.eap_dependencia (
  id               uuid primary key default gen_random_uuid(),
  empresa_id       uuid not null references public.empresa(id) on delete cascade,
  projeto_id       uuid not null references public.projeto(id) on delete cascade,
  predecessora_id  uuid not null references public.eap_item(id) on delete cascade,
  sucessora_id     uuid not null references public.eap_item(id) on delete cascade,
  tipo             public.tipo_dependencia not null default 'ti',
  defasagem_dias   integer not null default 0 check (defasagem_dias between -365 and 365),
  criado_em        timestamptz not null default now(),
  constraint eap_dependencia_distintas_ck check (predecessora_id <> sucessora_id),
  constraint eap_dependencia_par_uk unique (predecessora_id, sucessora_id)
);
create index eap_dependencia_sucessora_idx on public.eap_dependencia (sucessora_id);
create index eap_dependencia_projeto_idx on public.eap_dependencia (projeto_id);
create index eap_dependencia_empresa_idx on public.eap_dependencia (empresa_id);

-- Integridade: tarefas do mesmo projeto e sem ciclo.
create or replace function app.tg_eap_dependencia_integridade()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  v_pred public.eap_item;
  v_suc  public.eap_item;
  v_ciclo boolean;
begin
  select * into v_pred from public.eap_item where id = new.predecessora_id;
  select * into v_suc  from public.eap_item where id = new.sucessora_id;

  if v_pred.id is null or v_suc.id is null
     or v_pred.projeto_id <> new.projeto_id or v_suc.projeto_id <> new.projeto_id then
    raise exception 'As duas tarefas precisam ser deste projeto';
  end if;
  if v_pred.tipo <> 'tarefa' or v_suc.tipo <> 'tarefa' then
    raise exception 'Dependências ligam tarefas, não etapas';
  end if;

  select p.empresa_id into new.empresa_id from public.projeto p where p.id = new.projeto_id;

  -- Ciclo: a predecessora já depende (direta ou indiretamente) da sucessora?
  -- (union deduplica por tarefa: termina mesmo em redes densas)
  with recursive adiante as (
    select d.sucessora_id as id
      from public.eap_dependencia d
     where d.predecessora_id = new.sucessora_id and d.id is distinct from new.id
    union
    select d.sucessora_id
      from public.eap_dependencia d
      join adiante a on d.predecessora_id = a.id
     where d.id is distinct from new.id
  )
  select exists (select 1 from adiante where id = new.predecessora_id) into v_ciclo;
  if v_ciclo then
    raise exception 'Essa dependência fecha um ciclo: a predecessora já depende desta tarefa';
  end if;

  return new;
end;
$$;

create trigger eap_dependencia_integridade before insert or update on public.eap_dependencia
  for each row execute function app.tg_eap_dependencia_integridade();

create trigger eap_dependencia_auditoria after insert or update or delete on public.eap_dependencia
  for each row execute function app.tg_auditoria();

-- Tarefa com dependência não vira etapa (etapas não se ligam).
create or replace function app.tg_eap_item_sem_dependencia_em_etapa()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.tipo = 'etapa' and old.tipo = 'tarefa' and exists (
       select 1 from public.eap_dependencia
        where predecessora_id = new.id or sucessora_id = new.id) then
    raise exception 'Esta tarefa tem dependências. Remova as dependências antes de transformá-la em etapa.';
  end if;
  return new;
end;
$$;

create trigger eap_item_sem_dependencia_em_etapa before update of tipo on public.eap_item
  for each row execute function app.tg_eap_item_sem_dependencia_em_etapa();

alter table public.eap_dependencia enable row level security;
create policy eap_dependencia_select on public.eap_dependencia for select to authenticated
  using (app.pode_ver_projeto(projeto_id));
revoke all on public.eap_dependencia from anon, authenticated;
grant select on public.eap_dependencia to authenticated;

-- -----------------------------------------------------------------------------
-- Recalcular: empurra sucessoras até nenhuma dependência ser violada.
-- Cada volta resolve um "andar" da rede; como não há ciclo, termina.
-- Devolve quantas tarefas mudaram de data.
-- -----------------------------------------------------------------------------
create or replace function app.recalcular_cronograma(p_projeto_id uuid)
returns integer language plpgsql security definer set search_path = '' as $$
declare
  v_movidas uuid[] := '{}';
  v_lote    uuid[];
  v_voltas  integer := 0;
begin
  loop
    with exigido as (
      select d.sucessora_id as id,
             max(case d.tipo
                   when 'ti' then p.fim_previsto + 1 + d.defasagem_dias
                   when 'ii' then p.inicio_previsto + d.defasagem_dias
                   else p.fim_previsto + d.defasagem_dias - (s.fim_previsto - s.inicio_previsto)
                 end) as inicio_minimo
        from public.eap_dependencia d
        join public.eap_item p on p.id = d.predecessora_id
        join public.eap_item s on s.id = d.sucessora_id
       where d.projeto_id = p_projeto_id
         and p.inicio_previsto is not null and p.fim_previsto is not null
         and s.inicio_previsto is not null and s.fim_previsto is not null
       group by d.sucessora_id
    ),
    movidas as (
      update public.eap_item s
         set fim_previsto    = s.fim_previsto + (e.inicio_minimo - s.inicio_previsto),
             inicio_previsto = e.inicio_minimo
        from exigido e
       where s.id = e.id and s.inicio_previsto < e.inicio_minimo
      returning s.id
    )
    select coalesce(array_agg(id), '{}') into v_lote from movidas;

    exit when cardinality(v_lote) = 0;
    v_movidas := v_movidas || v_lote;
    v_voltas := v_voltas + 1;
    if v_voltas > 10000 then
      raise exception 'Recalcular o cronograma não convergiu';
    end if;
  end loop;

  return (select count(distinct x)::integer from unnest(v_movidas) as x);
end;
$$;

-- -----------------------------------------------------------------------------
-- Escrita: dependências e linha de base
-- -----------------------------------------------------------------------------

-- Cria (ou ajusta, se o par já existe) e devolve quantas tarefas foram empurradas.
create or replace function public.salvar_dependencia(
  p_predecessora_id uuid,
  p_sucessora_id    uuid,
  p_tipo            public.tipo_dependencia default 'ti',
  p_defasagem_dias  integer default 0
)
returns integer language plpgsql security definer set search_path = '' as $$
declare
  v_projeto uuid;
begin
  select projeto_id into v_projeto from public.eap_item where id = p_sucessora_id;
  if v_projeto is null or not app.pode_editar_projeto(v_projeto) then
    raise exception 'Tarefa não encontrada ou sem permissão' using errcode = '42501';
  end if;

  insert into public.eap_dependencia (projeto_id, predecessora_id, sucessora_id, tipo, defasagem_dias)
  values (v_projeto, p_predecessora_id, p_sucessora_id, coalesce(p_tipo, 'ti'), coalesce(p_defasagem_dias, 0))
  on conflict (predecessora_id, sucessora_id)
  do update set tipo = excluded.tipo, defasagem_dias = excluded.defasagem_dias;

  return app.recalcular_cronograma(v_projeto);
end;
$$;

create or replace function public.remover_dependencia(p_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare
  v_projeto uuid;
begin
  select projeto_id into v_projeto from public.eap_dependencia where id = p_id;
  if v_projeto is null or not app.pode_editar_projeto(v_projeto) then
    raise exception 'Dependência não encontrada ou sem permissão' using errcode = '42501';
  end if;
  delete from public.eap_dependencia where id = p_id;
end;
$$;

-- Congela datas e custos atuais das tarefas. Redefinir substitui a anterior
-- (o audit_log guarda os valores antigos). Devolve quantas tarefas entraram.
create or replace function public.definir_linha_base(p_projeto_id uuid)
returns integer language plpgsql security definer set search_path = '' as $$
declare
  v_qtd integer;
begin
  if not app.pode_editar_projeto(p_projeto_id) then
    raise exception 'Sem permissão para definir a linha de base deste projeto' using errcode = '42501';
  end if;

  select count(*) into v_qtd from public.eap_item where projeto_id = p_projeto_id and tipo = 'tarefa';
  if v_qtd = 0 then
    raise exception 'Monte a EAP com pelo menos uma tarefa antes de definir a linha de base';
  end if;

  update public.eap_item
     set inicio_base = case when tipo = 'tarefa' then inicio_previsto end,
         fim_base    = case when tipo = 'tarefa' then fim_previsto end,
         custo_base  = case when tipo = 'tarefa' then custo_previsto end
   where projeto_id = p_projeto_id
     and (inicio_base, fim_base, custo_base) is distinct from
         (case when tipo = 'tarefa' then inicio_previsto end,
          case when tipo = 'tarefa' then fim_previsto end,
          case when tipo = 'tarefa' then custo_previsto end);

  insert into public.linha_base (projeto_id, empresa_id, definida_em, definida_por, qtd_tarefas)
  select p.id, p.empresa_id, now(), auth.uid(), v_qtd from public.projeto p where p.id = p_projeto_id
  on conflict (projeto_id)
  do update set definida_em = excluded.definida_em, definida_por = excluded.definida_por, qtd_tarefas = excluded.qtd_tarefas;

  return v_qtd;
end;
$$;

-- -----------------------------------------------------------------------------
-- atualizar_item_eap passa a recalcular as sucessoras quando as datas mudam.
-- (Mesmo corpo da migração da EAP, mais o recálculo no fim.)
-- -----------------------------------------------------------------------------
create or replace function public.atualizar_item_eap(p_id uuid, p_campos jsonb)
returns void language plpgsql security definer set search_path = '' as $$
declare
  v      public.eap_item;
  v_tipo public.tipo_item_eap;
begin
  select * into v from public.eap_item where id = p_id;
  if not found or not app.pode_editar_projeto(v.projeto_id) then
    raise exception 'Item da EAP não encontrado ou sem permissão' using errcode = '42501';
  end if;
  perform app.validar_campos_eap(p_campos);

  v_tipo := coalesce((p_campos ->> 'tipo')::public.tipo_item_eap, v.tipo);

  if v_tipo = 'etapa' and v.tipo = 'tarefa' and (
       (case when p_campos ? 'unidade'         then nullif(btrim(p_campos ->> 'unidade'), '') else v.unidade end) is not null
    or (case when p_campos ? 'quantidade'      then nullif(p_campos ->> 'quantidade', '')      else v.quantidade::text end) is not null
    or (case when p_campos ? 'custo_previsto'  then nullif(p_campos ->> 'custo_previsto', '')  else v.custo_previsto::text end) is not null
    or (case when p_campos ? 'inicio_previsto' then nullif(p_campos ->> 'inicio_previsto', '') else v.inicio_previsto::text end) is not null
    or (case when p_campos ? 'fim_previsto'    then nullif(p_campos ->> 'fim_previsto', '')    else v.fim_previsto::text end) is not null
  ) then
    raise exception 'Etapas não têm unidade, quantidade, custo nem datas próprias: elas somam as tarefas de dentro. Limpe esses campos antes de transformar em etapa.';
  end if;

  update public.eap_item set
    tipo            = v_tipo,
    nome            = case when p_campos ? 'nome'            then btrim(p_campos ->> 'nome')                    else nome end,
    unidade         = case when p_campos ? 'unidade'         then nullif(btrim(p_campos ->> 'unidade'), '')    else unidade end,
    quantidade      = case when p_campos ? 'quantidade'      then nullif(p_campos ->> 'quantidade', '')::numeric else quantidade end,
    custo_previsto  = case when p_campos ? 'custo_previsto'  then nullif(p_campos ->> 'custo_previsto', '')::numeric else custo_previsto end,
    inicio_previsto = case when p_campos ? 'inicio_previsto' then nullif(p_campos ->> 'inicio_previsto', '')::date else inicio_previsto end,
    fim_previsto    = case when p_campos ? 'fim_previsto'    then nullif(p_campos ->> 'fim_previsto', '')::date   else fim_previsto end,
    codigo_externo  = case when p_campos ? 'codigo_externo'  then nullif(btrim(p_campos ->> 'codigo_externo'), '') else codigo_externo end
  where id = p_id;

  if p_campos ? 'inicio_previsto' or p_campos ? 'fim_previsto' then
    perform app.recalcular_cronograma(v.projeto_id);
  end if;
end;
$$;

-- -----------------------------------------------------------------------------
-- Leitura: a árvore passa a trazer a linha de base (etapas somam as tarefas).
-- -----------------------------------------------------------------------------
drop function public.eap_do_projeto(uuid);

create function public.eap_do_projeto(p_projeto_id uuid)
returns table (
  id              uuid,
  pai_id          uuid,
  posicao         integer,
  nivel           integer,
  codigo          text,
  tipo            public.tipo_item_eap,
  nome            text,
  unidade         text,
  quantidade      numeric,
  custo_previsto  numeric,
  inicio_previsto date,
  fim_previsto    date,
  codigo_externo  text,
  qtd_filhos      integer,
  qtd_tarefas     integer,
  inicio_base     date,
  fim_base        date,
  custo_base      numeric
)
language sql stable security invoker set search_path = '' as $$
  with recursive arvore as (
    select e.*, array[e.ordem] as caminho, array[e.id] as linha
      from public.eap_item e
     where e.projeto_id = p_projeto_id and e.pai_id is null
    union all
    select f.*, a.caminho || f.ordem, a.linha || f.id
      from public.eap_item f
      join arvore a on f.pai_id = a.id
  ),
  -- Cada tarefa soma em si mesma e em todos os ancestrais.
  somas as (
    select anc.id as item_id,
           sum(t.custo_previsto)    as custo,
           min(t.inicio_previsto)   as inicio,
           max(t.fim_previsto)      as fim,
           count(*)::integer        as tarefas,
           sum(t.custo_base)        as custo_b,
           min(t.inicio_base)       as inicio_b,
           max(t.fim_base)          as fim_b
      from arvore t
      cross join lateral unnest(t.linha) as anc(id)
     where t.tipo = 'tarefa'
     group by anc.id
  ),
  filhos as (
    select a.pai_id as item_id, count(*)::integer as qtd
      from arvore a
     where a.pai_id is not null
     group by a.pai_id
  )
  select a.id,
         a.pai_id,
         (row_number() over (order by a.caminho))::integer,
         cardinality(a.caminho),
         array_to_string(a.caminho, '.'),
         a.tipo,
         a.nome,
         a.unidade,
         a.quantidade,
         case when a.tipo = 'etapa' then s.custo  else a.custo_previsto  end,
         case when a.tipo = 'etapa' then s.inicio else a.inicio_previsto end,
         case when a.tipo = 'etapa' then s.fim    else a.fim_previsto    end,
         a.codigo_externo,
         coalesce(fi.qtd, 0),
         coalesce(s.tarefas, 0),
         case when a.tipo = 'etapa' then s.inicio_b else a.inicio_base end,
         case when a.tipo = 'etapa' then s.fim_b    else a.fim_base    end,
         case when a.tipo = 'etapa' then s.custo_b  else a.custo_base  end
    from arvore a
    left join somas  s  on s.item_id  = a.id
    left join filhos fi on fi.item_id = a.id
   order by a.caminho;
$$;

-- -----------------------------------------------------------------------------
-- Permissões das funções
-- -----------------------------------------------------------------------------
revoke all on function app.recalcular_cronograma(uuid) from public, anon, authenticated;

revoke all on function
  public.eap_do_projeto(uuid),
  public.salvar_dependencia(uuid, uuid, public.tipo_dependencia, integer),
  public.remover_dependencia(uuid),
  public.definir_linha_base(uuid)
from public, anon;

grant execute on function
  public.eap_do_projeto(uuid),
  public.salvar_dependencia(uuid, uuid, public.tipo_dependencia, integer),
  public.remover_dependencia(uuid),
  public.definir_linha_base(uuid)
to authenticated;
