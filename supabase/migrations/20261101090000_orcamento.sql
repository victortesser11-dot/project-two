-- =============================================================================
-- Sprint 6 — RF-501 a 504, 601 e 602: orçamento, físico-financeiro,
-- orçado × comprometido × realizado, curva S financeira e semáforo do portfólio.
--
-- * Composição do custo da tarefa (material, mão de obra, equipamento, outros).
--   Com composição, o custo previsto da tarefa passa a ser a soma dela e só
--   muda por definir_composicao_custo (trigger barra a mudança direta).
-- * Versões do orçamento: fotografia datada e imutável da EAP com custos.
-- * Despesas lançadas (aluguel de equipamento, frete, taxas, serviços avulsos),
--   sempre de uma tarefa, e compromissos (contratos e pedidos) para o comprometido.
-- * orcado_realizado: por tarefa, orçado, material aplicado (saídas do
--   almoxarifado), mão de obra (custo_mao_obra_projeto), despesas e comprometido.
--   Custo calculado no banco (regra 3); o app só soma na árvore.
-- * Regras do semáforo por empresa (dias de atraso e % de custo acima).
-- * Financeiro (despesas, compromissos, realizado) é de quem vê custos da obra:
--   engenheiro (admin conta como engenheiro) e financeiro.
-- =============================================================================

create type public.categoria_despesa as enum ('equipamento', 'servico', 'material', 'frete', 'taxa', 'administracao', 'outros');
create type public.tipo_compromisso as enum ('contrato', 'pedido');

-- Engenheiro (admin conta como engenheiro) ou financeiro da obra.
create or replace function app.pode_financeiro_projeto(p_projeto uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select coalesce(app.papel_no_projeto(p_projeto) in ('engenheiro', 'financeiro'), false);
$$;
revoke all on function app.pode_financeiro_projeto(uuid) from public;
grant execute on function app.pode_financeiro_projeto(uuid) to authenticated;

-- -----------------------------------------------------------------------------
-- Composição do custo da tarefa (RF-501)
-- -----------------------------------------------------------------------------
create table public.composicao_custo (
  tarefa_id      uuid primary key references public.eap_item(id) on delete cascade,
  empresa_id     uuid not null references public.empresa(id) on delete cascade,
  projeto_id     uuid not null references public.projeto(id) on delete cascade,
  material       numeric(16, 2) not null default 0 check (material >= 0),
  mao_obra       numeric(16, 2) not null default 0 check (mao_obra >= 0),
  equipamento    numeric(16, 2) not null default 0 check (equipamento >= 0),
  outros         numeric(16, 2) not null default 0 check (outros >= 0),
  total          numeric(16, 2) generated always as (material + mao_obra + equipamento + outros) stored,
  atualizado_em  timestamptz not null default now()
);
create index composicao_custo_projeto_idx on public.composicao_custo (projeto_id);
create index composicao_custo_empresa_idx on public.composicao_custo (empresa_id);

create trigger composicao_custo_auditoria after insert or update or delete on public.composicao_custo
  for each row execute function app.tg_auditoria('atualizado_em');

-- Tarefa com composição: o custo previsto é a soma dela e não muda por fora.
create or replace function app.tg_eap_custo_composto()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if new.custo_previsto is distinct from old.custo_previsto and exists (
       select 1 from public.composicao_custo c where c.tarefa_id = new.id and nullif(c.total, 0) is distinct from new.custo_previsto) then
    raise exception 'O custo desta tarefa vem da composição (material, mão de obra, equipamento e outros): altere por lá';
  end if;
  return new;
end;
$$;
create trigger eap_item_custo_composto before update of custo_previsto on public.eap_item
  for each row execute function app.tg_eap_custo_composto();

-- Define a composição da tarefa e atualiza o custo previsto com a soma. Tudo nulo tira a composição.
create or replace function public.definir_composicao_custo(
  p_tarefa_id   uuid,
  p_material    numeric,
  p_mao_obra    numeric,
  p_equipamento numeric,
  p_outros      numeric
)
returns numeric language plpgsql security definer set search_path = '' as $$
declare
  t       public.eap_item;
  v_total numeric;
begin
  select * into t from public.eap_item where id = p_tarefa_id;
  if t.id is null or not app.pode_editar_projeto(t.projeto_id) then
    raise exception 'Tarefa não encontrada ou sem permissão' using errcode = '42501';
  end if;
  if t.tipo <> 'tarefa' then
    raise exception 'Etapas não têm custo próprio: componha o custo das tarefas de dentro';
  end if;
  if coalesce(p_material, p_mao_obra, p_equipamento, p_outros) is null then
    delete from public.composicao_custo where tarefa_id = t.id;
    return t.custo_previsto;
  end if;
  if least(coalesce(p_material, 0), coalesce(p_mao_obra, 0), coalesce(p_equipamento, 0), coalesce(p_outros, 0)) < 0 then
    raise exception 'Valores da composição não podem ser negativos';
  end if;

  insert into public.composicao_custo (tarefa_id, empresa_id, projeto_id, material, mao_obra, equipamento, outros)
  values (t.id, t.empresa_id, t.projeto_id, coalesce(p_material, 0), coalesce(p_mao_obra, 0), coalesce(p_equipamento, 0), coalesce(p_outros, 0))
  on conflict (tarefa_id) do update set
    material = excluded.material, mao_obra = excluded.mao_obra, equipamento = excluded.equipamento,
    outros = excluded.outros, atualizado_em = now()
  returning total into v_total;

  update public.eap_item set custo_previsto = nullif(v_total, 0) where id = t.id;
  return v_total;
end;
$$;

-- -----------------------------------------------------------------------------
-- Versões do orçamento (RF-501): fotografia datada e imutável
-- -----------------------------------------------------------------------------
create table public.orcamento_versao (
  id          uuid primary key default gen_random_uuid(),
  empresa_id  uuid not null references public.empresa(id) on delete cascade,
  projeto_id  uuid not null references public.projeto(id) on delete cascade,
  nome        text not null check (length(btrim(nome)) between 2 and 80),
  total       numeric(16, 2) not null,
  itens       jsonb not null,
  criado_por  uuid references auth.users(id) on delete set null,
  criado_em   timestamptz not null default now()
);
create index orcamento_versao_projeto_idx on public.orcamento_versao (projeto_id, criado_em desc);
create index orcamento_versao_empresa_idx on public.orcamento_versao (empresa_id);
create index orcamento_versao_criado_por_idx on public.orcamento_versao (criado_por);

create trigger orcamento_versao_auditoria after insert or update or delete on public.orcamento_versao
  for each row execute function app.tg_auditoria();

-- Guarda a EAP com custos e composição como está agora. Devolve o id da versão.
create or replace function public.salvar_versao_orcamento(p_projeto_id uuid, p_nome text)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_empresa uuid;
  v_itens   jsonb;
  v_total   numeric;
  v_id      uuid;
begin
  if not app.pode_editar_projeto(p_projeto_id) then
    raise exception 'Só o engenheiro da obra ou o admin salvam versões do orçamento' using errcode = '42501';
  end if;
  select empresa_id into v_empresa from public.projeto where id = p_projeto_id;
  select coalesce(jsonb_agg(jsonb_build_object(
           'id', e.id, 'codigo', e.codigo, 'tipo', e.tipo, 'nome', e.nome, 'custo', e.custo_previsto,
           'material', c.material, 'mao_obra', c.mao_obra, 'equipamento', c.equipamento, 'outros', c.outros
         ) order by e.posicao), '[]'::jsonb),
         coalesce(sum(e.custo_previsto) filter (where e.tipo = 'tarefa'), 0)
    into v_itens, v_total
    from public.eap_do_projeto(p_projeto_id) e
    left join public.composicao_custo c on c.tarefa_id = e.id;
  if jsonb_array_length(v_itens) = 0 then
    raise exception 'A obra ainda não tem EAP para guardar como versão';
  end if;
  insert into public.orcamento_versao (empresa_id, projeto_id, nome, total, itens, criado_por)
  values (v_empresa, p_projeto_id, btrim(coalesce(p_nome, '')), v_total, v_itens, auth.uid())
  returning id into v_id;
  return v_id;
end;
$$;

-- -----------------------------------------------------------------------------
-- Compromissos (contratos e pedidos) e despesas (RF-503)
-- -----------------------------------------------------------------------------
create table public.compromisso (
  id              uuid primary key default gen_random_uuid(),
  empresa_id      uuid not null references public.empresa(id) on delete cascade,
  projeto_id      uuid not null references public.projeto(id) on delete cascade,
  tarefa_id       uuid references public.eap_item(id) on delete set null,
  tipo            public.tipo_compromisso not null,
  descricao       text not null check (length(btrim(descricao)) between 2 and 200),
  fornecedor      text check (fornecedor is null or length(fornecedor) <= 160),
  cnpj            text check (cnpj is null or cnpj ~ '^\d{14}$'),
  empreiteira_id  uuid references public.empreiteira(id) on delete set null,
  valor           numeric(16, 2) not null check (valor > 0),
  data            date not null,
  encerrado       boolean not null default false,
  encerrado_em    date,
  criado_por      uuid references auth.users(id) on delete set null,
  criado_em       timestamptz not null default now(),
  atualizado_em   timestamptz not null default now()
);
create index compromisso_projeto_idx on public.compromisso (projeto_id, data desc);
create index compromisso_tarefa_idx on public.compromisso (tarefa_id);
create index compromisso_empresa_idx on public.compromisso (empresa_id);
create index compromisso_empreiteira_idx on public.compromisso (empreiteira_id);
create index compromisso_criado_por_idx on public.compromisso (criado_por);

create trigger compromisso_atualizado_em before update on public.compromisso
  for each row execute function app.tg_atualizado_em();
create trigger compromisso_auditoria after insert or update or delete on public.compromisso
  for each row execute function app.tg_auditoria('atualizado_em');

create table public.despesa (
  id              uuid primary key default gen_random_uuid(),
  empresa_id      uuid not null references public.empresa(id) on delete cascade,
  projeto_id      uuid not null references public.projeto(id) on delete cascade,
  tarefa_id       uuid references public.eap_item(id) on delete set null,
  data            date not null,
  categoria       public.categoria_despesa not null,
  descricao       text not null check (length(btrim(descricao)) between 2 and 200),
  valor           numeric(16, 2) not null check (valor > 0),
  fornecedor      text check (fornecedor is null or length(fornecedor) <= 160),
  documento       text check (documento is null or length(documento) <= 60),
  compromisso_id  uuid references public.compromisso(id) on delete set null,
  registrado_por  uuid references auth.users(id) on delete set null,
  registrado_em   timestamptz not null default now()
);
create index despesa_projeto_idx on public.despesa (projeto_id, data desc);
create index despesa_tarefa_idx on public.despesa (tarefa_id);
create index despesa_compromisso_idx on public.despesa (compromisso_id);
create index despesa_empresa_idx on public.despesa (empresa_id);
create index despesa_registrado_por_idx on public.despesa (registrado_por);

create trigger despesa_auditoria after insert or update or delete on public.despesa
  for each row execute function app.tg_auditoria();

-- Cria (p_id nulo) ou altera um compromisso. p_campos: tarefa_id, tipo, descricao, fornecedor, cnpj,
-- empreiteira_id, valor, data.
create or replace function public.salvar_compromisso(p_id uuid, p_projeto_id uuid, p_campos jsonb)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_empresa uuid;
  v_tarefa  uuid := nullif(p_campos ->> 'tarefa_id', '')::uuid;
  v_emp     uuid := nullif(p_campos ->> 'empreiteira_id', '')::uuid;
  v_id      uuid;
begin
  if not app.pode_financeiro_projeto(p_projeto_id) then
    raise exception 'Só o engenheiro ou o financeiro da obra lançam contratos e pedidos' using errcode = '42501';
  end if;
  select empresa_id into v_empresa from public.projeto where id = p_projeto_id;
  if v_tarefa is null or not exists (
       select 1 from public.eap_item where id = v_tarefa and projeto_id = p_projeto_id and tipo = 'tarefa') then
    raise exception 'Escolha a tarefa desta obra a que o contrato ou pedido se refere';
  end if;
  if v_emp is not null and not exists (select 1 from public.empreiteira where id = v_emp and empresa_id = v_empresa) then
    raise exception 'Empreiteira não encontrada nesta empresa';
  end if;

  if p_id is null then
    insert into public.compromisso (empresa_id, projeto_id, tarefa_id, tipo, descricao, fornecedor, cnpj, empreiteira_id, valor, data, criado_por)
    values (v_empresa, p_projeto_id, v_tarefa, (p_campos ->> 'tipo')::public.tipo_compromisso, btrim(p_campos ->> 'descricao'),
            nullif(btrim(p_campos ->> 'fornecedor'), ''), nullif(regexp_replace(coalesce(p_campos ->> 'cnpj', ''), '\D', '', 'g'), ''),
            v_emp, (p_campos ->> 'valor')::numeric, (p_campos ->> 'data')::date, auth.uid())
    returning id into v_id;
  else
    update public.compromisso set
      tarefa_id = v_tarefa,
      tipo = (p_campos ->> 'tipo')::public.tipo_compromisso,
      descricao = btrim(p_campos ->> 'descricao'),
      fornecedor = nullif(btrim(p_campos ->> 'fornecedor'), ''),
      cnpj = nullif(regexp_replace(coalesce(p_campos ->> 'cnpj', ''), '\D', '', 'g'), ''),
      empreiteira_id = v_emp,
      valor = (p_campos ->> 'valor')::numeric,
      data = (p_campos ->> 'data')::date
    where id = p_id and projeto_id = p_projeto_id
    returning id into v_id;
    if v_id is null then
      raise exception 'Contrato ou pedido não encontrado nesta obra';
    end if;
  end if;
  return v_id;
end;
$$;

-- Encerra (ou reabre) o contrato/pedido. Encerrado, o comprometido passa a ser o que foi pago por ele.
create or replace function public.encerrar_compromisso(p_id uuid, p_encerrado boolean default true)
returns void language plpgsql security definer set search_path = '' as $$
declare
  v_projeto uuid;
begin
  select projeto_id into v_projeto from public.compromisso where id = p_id;
  if v_projeto is null or not app.pode_financeiro_projeto(v_projeto) then
    raise exception 'Contrato ou pedido não encontrado ou sem permissão' using errcode = '42501';
  end if;
  update public.compromisso
     set encerrado = coalesce(p_encerrado, true),
         encerrado_em = case when coalesce(p_encerrado, true) then (now() at time zone 'America/Sao_Paulo')::date end
   where id = p_id;
end;
$$;

-- Lança uma despesa da obra, sempre de uma tarefa. Devolve o id.
create or replace function public.registrar_despesa(
  p_projeto_id     uuid,
  p_tarefa_id      uuid,
  p_data           date,
  p_categoria      public.categoria_despesa,
  p_descricao      text,
  p_valor          numeric,
  p_fornecedor     text default null,
  p_documento      text default null,
  p_compromisso_id uuid default null
)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_empresa uuid;
  v_id      uuid;
begin
  if not app.pode_financeiro_projeto(p_projeto_id) then
    raise exception 'Só o engenheiro ou o financeiro da obra lançam despesas' using errcode = '42501';
  end if;
  select empresa_id into v_empresa from public.projeto where id = p_projeto_id;
  if p_tarefa_id is null or not exists (
       select 1 from public.eap_item where id = p_tarefa_id and projeto_id = p_projeto_id and tipo = 'tarefa') then
    raise exception 'Despesa sem tarefa não é permitida: escolha a tarefa desta obra';
  end if;
  if p_data is null or p_data > (now() at time zone 'America/Sao_Paulo')::date then
    raise exception 'A despesa não pode ser de um dia futuro';
  end if;
  if p_compromisso_id is not null and not exists (
       select 1 from public.compromisso where id = p_compromisso_id and projeto_id = p_projeto_id) then
    raise exception 'Contrato ou pedido não encontrado nesta obra';
  end if;
  insert into public.despesa (empresa_id, projeto_id, tarefa_id, data, categoria, descricao, valor, fornecedor, documento, compromisso_id, registrado_por)
  values (v_empresa, p_projeto_id, p_tarefa_id, p_data, p_categoria, btrim(coalesce(p_descricao, '')), p_valor,
          nullif(btrim(p_fornecedor), ''), nullif(btrim(p_documento), ''), p_compromisso_id, auth.uid())
  returning id into v_id;
  return v_id;
end;
$$;

-- Tira uma despesa lançada errada (fica no audit_log).
create or replace function public.excluir_despesa(p_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare
  v_projeto uuid;
begin
  select projeto_id into v_projeto from public.despesa where id = p_id;
  if v_projeto is null or not app.pode_financeiro_projeto(v_projeto) then
    raise exception 'Despesa não encontrada ou sem permissão' using errcode = '42501';
  end if;
  delete from public.despesa where id = p_id;
end;
$$;

-- -----------------------------------------------------------------------------
-- Orçado × comprometido × realizado por tarefa (RF-503) e realizado por dia (RF-504)
-- -----------------------------------------------------------------------------

-- Uma linha por tarefa com algum valor (e uma com tarefa nula para o que perdeu a tarefa).
-- comprometido: valor dos contratos/pedidos abertos + o que foi pago pelos encerrados.
create or replace function public.orcado_realizado(p_projeto_id uuid)
returns table (
  tarefa_id     uuid,
  orcado        numeric,
  material      numeric,
  mao_obra      numeric,
  despesas      numeric,
  comprometido  numeric
)
language plpgsql stable security definer set search_path = '' as $$
#variable_conflict use_column
begin
  if not app.pode_financeiro_projeto(p_projeto_id) then
    raise exception 'Sem permissão para ver custos desta obra' using errcode = '42501';
  end if;
  return query
  with orc as (
    select e.id as tarefa_id, e.custo_previsto as valor from public.eap_item e
     where e.projeto_id = p_projeto_id and e.tipo = 'tarefa'
  ),
  mat as (
    select m.tarefa_id, sum(m.valor_total) as valor from public.movimento_estoque m
     where m.projeto_id = p_projeto_id and m.tipo = 'saida' group by m.tarefa_id
  ),
  mo as (
    select c.tarefa_id, sum(c.custo) as valor from public.custo_mao_obra_projeto(p_projeto_id) c group by c.tarefa_id
  ),
  desp as (
    select d.tarefa_id, sum(d.valor) as valor from public.despesa d where d.projeto_id = p_projeto_id group by d.tarefa_id
  ),
  comp as (
    select c.tarefa_id,
           sum(case when c.encerrado
                    then coalesce((select sum(d.valor) from public.despesa d where d.compromisso_id = c.id), 0)
                    else c.valor end) as valor
      from public.compromisso c
     where c.projeto_id = p_projeto_id
     group by c.tarefa_id
  ),
  chaves as (
    select tarefa_id from orc union select tarefa_id from mat union select tarefa_id from mo
    union select tarefa_id from desp union select tarefa_id from comp
  )
  select k.tarefa_id,
         coalesce(orc.valor, 0), coalesce(mat.valor, 0), coalesce(mo.valor, 0), coalesce(desp.valor, 0), coalesce(comp.valor, 0)
    from chaves k
    left join orc  on orc.tarefa_id  is not distinct from k.tarefa_id
    left join mat  on mat.tarefa_id  is not distinct from k.tarefa_id
    left join mo   on mo.tarefa_id   is not distinct from k.tarefa_id
    left join desp on desp.tarefa_id is not distinct from k.tarefa_id
    left join comp on comp.tarefa_id is not distinct from k.tarefa_id
   where coalesce(orc.valor, 0) + coalesce(mat.valor, 0) + coalesce(mo.valor, 0) + coalesce(desp.valor, 0) + coalesce(comp.valor, 0) > 0;
end;
$$;

-- Custo realizado por dia (para a curva S financeira real).
create or replace function public.custo_realizado_por_dia(p_projeto_id uuid)
returns table (data date, material numeric, mao_obra numeric, despesas numeric)
language plpgsql stable security definer set search_path = '' as $$
#variable_conflict use_column
begin
  if not app.pode_financeiro_projeto(p_projeto_id) then
    raise exception 'Sem permissão para ver custos desta obra' using errcode = '42501';
  end if;
  return query
  with tudo as (
    select m.data, m.valor_total as material, 0::numeric as mao_obra, 0::numeric as despesas
      from public.movimento_estoque m where m.projeto_id = p_projeto_id and m.tipo = 'saida'
    union all
    select c.data, 0, coalesce(c.custo, 0), 0 from public.custo_mao_obra_projeto(p_projeto_id) c
    union all
    select d.data, 0, 0, d.valor from public.despesa d where d.projeto_id = p_projeto_id
  )
  select t.data, sum(t.material), sum(t.mao_obra), sum(t.despesas) from tudo t group by t.data order by t.data;
end;
$$;

-- -----------------------------------------------------------------------------
-- Regras do semáforo do portfólio (RF-602), por empresa
-- -----------------------------------------------------------------------------
create table public.regra_semaforo (
  empresa_id            uuid primary key references public.empresa(id) on delete cascade,
  atraso_amarelo_dias   integer not null default 7 check (atraso_amarelo_dias >= 0),
  atraso_vermelho_dias  integer not null default 30,
  custo_amarelo_pct     numeric(6, 2) not null default 5 check (custo_amarelo_pct >= 0),
  custo_vermelho_pct    numeric(6, 2) not null default 10,
  atualizado_em         timestamptz not null default now(),
  constraint regra_semaforo_ordem_ck check (atraso_vermelho_dias >= atraso_amarelo_dias and custo_vermelho_pct >= custo_amarelo_pct)
);
create trigger regra_semaforo_auditoria after insert or update or delete on public.regra_semaforo
  for each row execute function app.tg_auditoria('atualizado_em');

create or replace function public.definir_regras_semaforo(
  p_empresa_id uuid,
  p_atraso_amarelo_dias integer,
  p_atraso_vermelho_dias integer,
  p_custo_amarelo_pct numeric,
  p_custo_vermelho_pct numeric
)
returns void language plpgsql security definer set search_path = '' as $$
begin
  if not coalesce(app.e_admin_empresa(p_empresa_id), false) then
    raise exception 'Só o admin da empresa muda as regras do semáforo' using errcode = '42501';
  end if;
  insert into public.regra_semaforo (empresa_id, atraso_amarelo_dias, atraso_vermelho_dias, custo_amarelo_pct, custo_vermelho_pct)
  values (p_empresa_id, p_atraso_amarelo_dias, p_atraso_vermelho_dias, p_custo_amarelo_pct, p_custo_vermelho_pct)
  on conflict (empresa_id) do update set
    atraso_amarelo_dias = excluded.atraso_amarelo_dias, atraso_vermelho_dias = excluded.atraso_vermelho_dias,
    custo_amarelo_pct = excluded.custo_amarelo_pct, custo_vermelho_pct = excluded.custo_vermelho_pct, atualizado_em = now();
end;
$$;

-- -----------------------------------------------------------------------------
-- RLS e grants
-- -----------------------------------------------------------------------------
alter table public.composicao_custo enable row level security;
alter table public.orcamento_versao enable row level security;
alter table public.compromisso      enable row level security;
alter table public.despesa          enable row level security;
alter table public.regra_semaforo   enable row level security;

-- Orçamento (planejamento) é de quem vê a obra, como o custo previsto da EAP.
create policy composicao_custo_select on public.composicao_custo for select to authenticated
  using (app.pode_ver_projeto(projeto_id));
create policy orcamento_versao_select on public.orcamento_versao for select to authenticated
  using (app.pode_ver_projeto(projeto_id));
-- Contratos, pedidos e despesas são do financeiro da obra.
create policy compromisso_select on public.compromisso for select to authenticated
  using (app.pode_financeiro_projeto(projeto_id));
create policy despesa_select on public.despesa for select to authenticated
  using (app.pode_financeiro_projeto(projeto_id));
create policy regra_semaforo_select on public.regra_semaforo for select to authenticated
  using (app.e_membro_empresa(empresa_id));

revoke all on public.composicao_custo, public.orcamento_versao, public.compromisso, public.despesa, public.regra_semaforo
  from anon, authenticated;
grant select on public.composicao_custo, public.orcamento_versao, public.compromisso, public.despesa, public.regra_semaforo
  to authenticated;

revoke all on function
  public.definir_composicao_custo(uuid, numeric, numeric, numeric, numeric),
  public.salvar_versao_orcamento(uuid, text),
  public.salvar_compromisso(uuid, uuid, jsonb),
  public.encerrar_compromisso(uuid, boolean),
  public.registrar_despesa(uuid, uuid, date, public.categoria_despesa, text, numeric, text, text, uuid),
  public.excluir_despesa(uuid),
  public.orcado_realizado(uuid),
  public.custo_realizado_por_dia(uuid),
  public.definir_regras_semaforo(uuid, integer, integer, numeric, numeric)
from public, anon;
grant execute on function
  public.definir_composicao_custo(uuid, numeric, numeric, numeric, numeric),
  public.salvar_versao_orcamento(uuid, text),
  public.salvar_compromisso(uuid, uuid, jsonb),
  public.encerrar_compromisso(uuid, boolean),
  public.registrar_despesa(uuid, uuid, date, public.categoria_despesa, text, numeric, text, text, uuid),
  public.excluir_despesa(uuid),
  public.orcado_realizado(uuid),
  public.custo_realizado_por_dia(uuid),
  public.definir_regras_semaforo(uuid, integer, integer, numeric, numeric)
to authenticated;
