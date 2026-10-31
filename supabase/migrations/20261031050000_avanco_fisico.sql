-- =============================================================================
-- Sprint 2 — RF-202: avanço físico das tarefas, apontado no campo.
--
-- * Cada apontamento é uma linha em avanco_tarefa (histórico). O id vem do
--   celular: reenviar o mesmo apontamento depois de ficar offline não duplica.
-- * eap_item.percentual_fisico guarda o valor do apontamento mais recente pela
--   DATA do serviço (empate: o que chegou por último). Assim, um apontamento
--   de ontem que sincroniza hoje não apaga o de hoje: "última edição vence,
--   com histórico".
-- * Quantidade feita no dia vira % quando a tarefa tem quantidade prevista.
-- * Quem aponta: engenheiro e mestre do projeto (admin da empresa conta como
--   engenheiro). Leitura para todos que veem o projeto.
-- =============================================================================

create or replace function app.pode_apontar_campo(p_projeto uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select coalesce(app.papel_no_projeto(p_projeto) in ('engenheiro', 'mestre'), false);
$$;
revoke all on function app.pode_apontar_campo(uuid) from public;
grant execute on function app.pode_apontar_campo(uuid) to authenticated;

alter table public.eap_item
  add column percentual_fisico numeric(5, 2) not null default 0
    check (percentual_fisico between 0 and 100),
  add column avanco_em date;

create table public.avanco_tarefa (
  id                uuid primary key,
  empresa_id        uuid not null references public.empresa(id) on delete cascade,
  projeto_id        uuid not null references public.projeto(id) on delete cascade,
  tarefa_id         uuid not null references public.eap_item(id) on delete cascade,
  data              date not null,
  percentual        numeric(5, 2) not null check (percentual between 0 and 100),
  quantidade_feita  numeric(16, 4) check (quantidade_feita is null or quantidade_feita >= 0),
  observacao        text check (observacao is null or length(observacao) <= 500),
  registrado_por    uuid references auth.users(id) on delete set null,
  registrado_em     timestamptz not null default now()
);
create index avanco_tarefa_tarefa_idx on public.avanco_tarefa (tarefa_id, data desc, registrado_em desc);
create index avanco_tarefa_projeto_idx on public.avanco_tarefa (projeto_id, data);
create index avanco_tarefa_empresa_idx on public.avanco_tarefa (empresa_id);

create trigger avanco_tarefa_auditoria after insert or update or delete on public.avanco_tarefa
  for each row execute function app.tg_auditoria();

alter table public.avanco_tarefa enable row level security;
create policy avanco_tarefa_select on public.avanco_tarefa for select to authenticated
  using (app.pode_ver_projeto(projeto_id));
revoke all on public.avanco_tarefa from anon, authenticated;
grant select on public.avanco_tarefa to authenticated;

-- -----------------------------------------------------------------------------
-- Apontar avanço. Informe o % acumulado OU a quantidade feita no dia.
-- Devolve o % físico atual da tarefa depois do apontamento.
-- -----------------------------------------------------------------------------
create or replace function public.registrar_avanco(
  p_id          uuid,
  p_tarefa_id   uuid,
  p_data        date,
  p_percentual  numeric default null,
  p_quantidade  numeric default null,
  p_observacao  text default null
)
returns numeric language plpgsql security definer set search_path = '' as $$
declare
  v        public.eap_item;
  v_pct    numeric;
  v_feito  numeric;
  v_hoje   date := (now() at time zone 'America/Sao_Paulo')::date;
begin
  select * into v from public.eap_item where id = p_tarefa_id;
  if not found or not app.pode_apontar_campo(v.projeto_id) then
    raise exception 'Tarefa não encontrada ou sem permissão para apontar avanço' using errcode = '42501';
  end if;

  -- Reenvio do mesmo apontamento (fila offline): não duplica.
  if exists (select 1 from public.avanco_tarefa where id = p_id) then
    if not exists (select 1 from public.avanco_tarefa where id = p_id and tarefa_id = p_tarefa_id) then
      raise exception 'Apontamento repetido com outra tarefa';
    end if;
    return v.percentual_fisico;
  end if;

  if v.tipo <> 'tarefa' then
    raise exception 'Avanço é apontado nas tarefas; a etapa soma as de dentro';
  end if;
  if p_data is null or p_data > v_hoje then
    raise exception 'A data do avanço não pode ser no futuro';
  end if;
  if p_data < v_hoje - 60 and app.papel_no_projeto(v.projeto_id) <> 'engenheiro' then
    raise exception 'Apontamentos de mais de 60 dias atrás só podem ser lançados pelo engenheiro';
  end if;

  if p_percentual is not null then
    v_pct := p_percentual;
  elsif p_quantidade is not null then
    if coalesce(v.quantidade, 0) <= 0 then
      raise exception 'Esta tarefa não tem quantidade prevista: informe o avanço em %%';
    end if;
    select coalesce(sum(quantidade_feita), 0) into v_feito from public.avanco_tarefa where tarefa_id = v.id;
    v_pct := least(100, round((v_feito + p_quantidade) / v.quantidade * 100, 2));
  else
    raise exception 'Informe o avanço em %% ou a quantidade feita';
  end if;

  if v_pct < 0 or v_pct > 100 then
    raise exception 'O avanço precisa ficar entre 0%% e 100%%';
  end if;

  insert into public.avanco_tarefa (id, empresa_id, projeto_id, tarefa_id, data, percentual, quantidade_feita, observacao, registrado_por)
  values (p_id, v.empresa_id, v.projeto_id, v.id, p_data, round(v_pct, 2), p_quantidade,
          nullif(btrim(p_observacao), ''), auth.uid());

  -- O apontamento mais recente pela data do serviço define o % da tarefa.
  update public.eap_item e
     set percentual_fisico = u.percentual, avanco_em = u.data
    from (select a.percentual, a.data from public.avanco_tarefa a
           where a.tarefa_id = v.id
           order by a.data desc, a.registrado_em desc, a.id desc
           limit 1) u
   where e.id = v.id
     and (e.percentual_fisico, e.avanco_em) is distinct from (u.percentual, u.data);

  return (select percentual_fisico from public.eap_item where id = v.id);
end;
$$;

revoke all on function public.registrar_avanco(uuid, uuid, date, numeric, numeric, text) from public, anon;
grant execute on function public.registrar_avanco(uuid, uuid, date, numeric, numeric, text) to authenticated;

-- -----------------------------------------------------------------------------
-- eap_do_projeto passa a trazer o % físico. Etapa = média ponderada das
-- tarefas de dentro: pelo custo previsto quando todas as tarefas do projeto
-- têm custo; senão, pela duração em dias (tarefa sem datas pesa 1 dia).
-- -----------------------------------------------------------------------------
drop function public.eap_do_projeto(uuid);

create function public.eap_do_projeto(p_projeto_id uuid)
returns table (
  id                uuid,
  pai_id            uuid,
  posicao           integer,
  nivel             integer,
  codigo            text,
  tipo              public.tipo_item_eap,
  nome              text,
  unidade           text,
  quantidade        numeric,
  custo_previsto    numeric,
  inicio_previsto   date,
  fim_previsto      date,
  codigo_externo    text,
  qtd_filhos        integer,
  qtd_tarefas       integer,
  inicio_base       date,
  fim_base          date,
  custo_base        numeric,
  percentual_fisico numeric,
  avanco_em         date
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
  criterio as (
    select bool_and(coalesce(t.custo_previsto, 0) > 0) as por_custo
      from arvore t where t.tipo = 'tarefa'
  ),
  pesos as (
    select t.*,
           case when c.por_custo then t.custo_previsto
                else coalesce(t.fim_previsto - t.inicio_previsto + 1, 1) end::numeric as peso
      from arvore t cross join criterio c
     where t.tipo = 'tarefa'
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
           max(t.fim_base)          as fim_b,
           sum(t.peso * t.percentual_fisico) / nullif(sum(t.peso), 0) as pct,
           max(t.avanco_em)         as avanco
      from pesos t
      cross join lateral unnest(t.linha) as anc(id)
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
         case when a.tipo = 'etapa' then s.custo_b  else a.custo_base  end,
         case when a.tipo = 'etapa' then round(coalesce(s.pct, 0), 2) else a.percentual_fisico end,
         case when a.tipo = 'etapa' then s.avanco else a.avanco_em end
    from arvore a
    left join somas  s  on s.item_id  = a.id
    left join filhos fi on fi.item_id = a.id
   order by a.caminho;
$$;

revoke all on function public.eap_do_projeto(uuid) from public, anon;
grant execute on function public.eap_do_projeto(uuid) to authenticated;
