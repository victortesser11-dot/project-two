-- =============================================================================
-- Medição (RF-505, ampliado com a reunião de 03/11 com a engenharia): como o cliente paga
-- e como se paga o empreiteiro, pelo que foi executado.
--
-- * contrato_medicao: um contrato por parte (o cliente da obra ou uma empreiteira), com BDI,
--   retenção e prazo de pagamento. Itens = tarefas da EAP com critério de medição:
--     - quantidade: na unidade da tarefa (m², m³, kg...), com preço unitário;
--     - percentual: serviço medido em % (quantidade 100, unidade "%").
--   Gerado da EAP: preço unitário = custo previsto × (1 + BDI) ÷ quantidade. O engenheiro ajusta.
-- * medicao (boletim): período, itens medidos, bruto, retenção e líquido. Rascunho → aprovada
--   (só o engenheiro; vira "liberada para pagar" com vencimento) → paga. Aprovada não muda mais.
-- * O banco é o juiz: o medido acumulado de cada item nunca passa do executado (último avanço
--   apontado até o fim do período) nem do contratado. O boletim sugere exatamente
--   "executado − já medido"; a câmera com IA entra depois como mais uma evidência.
-- * Valores de venda e de contrato são financeiros: só quem vê o financeiro da obra lê
--   (app.pode_financeiro_projeto). Tudo muda só por função e vai para o audit_log.
-- =============================================================================

create type public.parte_medicao as enum ('cliente', 'empreiteiro');
create type public.criterio_medicao as enum ('quantidade', 'percentual');
create type public.status_medicao as enum ('rascunho', 'aprovada', 'paga');

create table public.contrato_medicao (
  id                    uuid primary key default gen_random_uuid(),
  empresa_id            uuid not null references public.empresa(id) on delete cascade,
  projeto_id            uuid not null references public.projeto(id) on delete cascade,
  parte                 public.parte_medicao not null,
  nome                  text not null check (length(btrim(nome)) between 2 and 160),
  empreiteira_id        uuid references public.empreiteira(id),
  bdi_pct               numeric(6, 2) not null default 0 check (bdi_pct between 0 and 200),
  retencao_pct          numeric(5, 2) not null default 0 check (retencao_pct between 0 and 30),
  prazo_pagamento_dias  integer not null default 10 check (prazo_pagamento_dias between 0 and 180),
  criado_por            uuid references auth.users(id) on delete set null,
  criado_em             timestamptz not null default now(),
  atualizado_em         timestamptz not null default now(),
  constraint contrato_medicao_parte_ck check ((parte = 'empreiteiro') = (empreiteira_id is not null))
);
create index contrato_medicao_projeto_idx on public.contrato_medicao (projeto_id);
create index contrato_medicao_empresa_idx on public.contrato_medicao (empresa_id);
create index contrato_medicao_empreiteira_idx on public.contrato_medicao (empreiteira_id);
create index contrato_medicao_criado_por_idx on public.contrato_medicao (criado_por);
create unique index contrato_medicao_cliente_uk on public.contrato_medicao (projeto_id) where parte = 'cliente';

create table public.contrato_medicao_item (
  id              uuid primary key default gen_random_uuid(),
  contrato_id     uuid not null references public.contrato_medicao(id) on delete cascade,
  empresa_id      uuid not null references public.empresa(id) on delete cascade,
  projeto_id      uuid not null references public.projeto(id) on delete cascade,
  tarefa_id       uuid not null references public.eap_item(id) on delete cascade,
  criterio        public.criterio_medicao not null,
  unidade         text not null check (length(btrim(unidade)) between 1 and 20),
  quantidade      numeric(16, 4) not null check (quantidade > 0),
  preco_unitario  numeric(16, 4) not null check (preco_unitario >= 0),
  valor_total     numeric(16, 2) generated always as (round(quantidade * preco_unitario, 2)) stored,
  atualizado_em   timestamptz not null default now(),
  constraint contrato_medicao_item_uk unique (contrato_id, tarefa_id),
  constraint contrato_medicao_item_percentual_ck check (criterio = 'quantidade' or (quantidade = 100 and unidade = '%'))
);
create index contrato_medicao_item_projeto_idx on public.contrato_medicao_item (projeto_id);
create index contrato_medicao_item_empresa_idx on public.contrato_medicao_item (empresa_id);
create index contrato_medicao_item_tarefa_idx on public.contrato_medicao_item (tarefa_id);

create table public.medicao (
  id              uuid primary key default gen_random_uuid(),
  empresa_id      uuid not null references public.empresa(id) on delete cascade,
  projeto_id      uuid not null references public.projeto(id) on delete cascade,
  contrato_id     uuid not null references public.contrato_medicao(id) on delete cascade,
  numero          integer not null check (numero > 0),
  inicio          date not null,
  fim             date not null,
  status          public.status_medicao not null default 'rascunho',
  observacao      text check (observacao is null or length(observacao) <= 2000),
  valor_bruto     numeric(16, 2) not null default 0,
  retencao        numeric(16, 2) not null default 0,
  valor_liquido   numeric(16, 2) generated always as (valor_bruto - retencao) stored,
  vencimento      date,
  aprovada_por    uuid references auth.users(id) on delete set null,
  aprovada_nome   text,
  aprovada_em     timestamptz,
  pago_em         date,
  pago_valor      numeric(16, 2) check (pago_valor is null or pago_valor >= 0),
  criado_por      uuid references auth.users(id) on delete set null,
  criado_em       timestamptz not null default now(),
  atualizado_em   timestamptz not null default now(),
  constraint medicao_numero_uk unique (contrato_id, numero),
  constraint medicao_periodo_ck check (fim >= inicio),
  constraint medicao_status_ck check (
    (status = 'rascunho' and aprovada_em is null and pago_em is null) or
    (status = 'aprovada' and aprovada_em is not null and vencimento is not null and pago_em is null) or
    (status = 'paga' and aprovada_em is not null and pago_em is not null and pago_valor is not null))
);
create index medicao_projeto_idx on public.medicao (projeto_id, fim desc);
create index medicao_empresa_idx on public.medicao (empresa_id);
create index medicao_aprovada_por_idx on public.medicao (aprovada_por);
create index medicao_criado_por_idx on public.medicao (criado_por);
create unique index medicao_um_rascunho_uk on public.medicao (contrato_id) where status = 'rascunho';

create table public.medicao_item (
  medicao_id           uuid not null references public.medicao(id) on delete cascade,
  -- Sem cascata: tarefa já medida não sai da EAP (a checagem roda no fim do comando, depois das cascatas da obra).
  contrato_item_id     uuid not null references public.contrato_medicao_item(id),
  empresa_id           uuid not null references public.empresa(id) on delete cascade,
  projeto_id           uuid not null references public.projeto(id) on delete cascade,
  quantidade           numeric(16, 4) not null check (quantidade > 0),
  valor                numeric(16, 2) not null,
  -- Evidência congelada: o executado (na unidade do item) até o fim do período, pelo avanço apontado.
  executado_acumulado  numeric(16, 4) not null,
  primary key (medicao_id, contrato_item_id)
);
create index medicao_item_contrato_item_idx on public.medicao_item (contrato_item_id);
create index medicao_item_projeto_idx on public.medicao_item (projeto_id);
create index medicao_item_empresa_idx on public.medicao_item (empresa_id);

create trigger contrato_medicao_atualizado_em before update on public.contrato_medicao
  for each row execute function app.tg_atualizado_em();
create trigger contrato_medicao_item_atualizado_em before update on public.contrato_medicao_item
  for each row execute function app.tg_atualizado_em();
create trigger medicao_atualizado_em before update on public.medicao
  for each row execute function app.tg_atualizado_em();

create trigger contrato_medicao_auditoria after insert or update or delete on public.contrato_medicao
  for each row execute function app.tg_auditoria('atualizado_em');
create trigger contrato_medicao_item_auditoria after insert or update or delete on public.contrato_medicao_item
  for each row execute function app.tg_auditoria('atualizado_em');
create trigger medicao_auditoria after insert or update or delete on public.medicao
  for each row execute function app.tg_auditoria('atualizado_em');
create trigger medicao_item_auditoria after insert or update or delete on public.medicao_item
  for each row execute function app.tg_auditoria();

-- Boletim aprovado não muda (só passa a pago). A exclusão em cascata da obra passa.
create or replace function app.tg_medicao_imutavel()
returns trigger language plpgsql set search_path = '' as $$
begin
  if tg_op = 'DELETE' then
    if old.status <> 'rascunho' and exists (select 1 from public.projeto where id = old.projeto_id)
       and exists (select 1 from public.contrato_medicao where id = old.contrato_id) then
      raise exception 'Medição aprovada não pode ser apagada';
    end if;
    return old;
  end if;
  if old.status = 'paga' then
    raise exception 'Medição paga não pode ser alterada';
  end if;
  if old.status = 'aprovada' and (
       new.status <> 'paga' or new.numero <> old.numero or new.inicio <> old.inicio or new.fim <> old.fim
       or new.valor_bruto <> old.valor_bruto or new.retencao <> old.retencao or new.vencimento <> old.vencimento
       or new.aprovada_em <> old.aprovada_em or new.contrato_id <> old.contrato_id) then
    raise exception 'Medição aprovada não pode ser alterada; só registrar o pagamento';
  end if;
  return new;
end;
$$;
revoke all on function app.tg_medicao_imutavel() from public, anon, authenticated;
create trigger medicao_imutavel before update or delete on public.medicao
  for each row execute function app.tg_medicao_imutavel();

create or replace function app.tg_medicao_item_rascunho()
returns trigger language plpgsql set search_path = '' as $$
declare
  v_status public.status_medicao;
begin
  select status into v_status from public.medicao where id = coalesce(new.medicao_id, old.medicao_id);
  if v_status is null or not exists (select 1 from public.projeto where id = coalesce(new.projeto_id, old.projeto_id)) then
    return coalesce(new, old);  -- cascata
  end if;
  if v_status <> 'rascunho' then
    raise exception 'Itens de medição aprovada não podem ser alterados';
  end if;
  return coalesce(new, old);
end;
$$;
revoke all on function app.tg_medicao_item_rascunho() from public, anon, authenticated;
create trigger medicao_item_rascunho before insert or update or delete on public.medicao_item
  for each row execute function app.tg_medicao_item_rascunho();

-- -----------------------------------------------------------------------------
-- Executado: fração da tarefa (0 a 1) pelo último avanço apontado até a data.
-- -----------------------------------------------------------------------------
create or replace function app.executado_tarefa(p_tarefa uuid, p_data date)
returns numeric language sql stable set search_path = '' as $$
  select coalesce((
    select a.percentual / 100 from public.avanco_tarefa a
     where a.tarefa_id = p_tarefa and a.data <= p_data
     order by a.data desc, a.registrado_em desc limit 1), 0);
$$;
revoke all on function app.executado_tarefa(uuid, date) from public, anon, authenticated;

-- Medido acumulado de um item nos boletins aprovados ou pagos (sem contar um boletim).
create or replace function app.medido_item(p_item uuid, p_exceto uuid default null)
returns numeric language sql stable set search_path = '' as $$
  select coalesce(sum(mi.quantidade), 0)
    from public.medicao_item mi join public.medicao m on m.id = mi.medicao_id
   where mi.contrato_item_id = p_item and m.status <> 'rascunho' and m.id is distinct from p_exceto;
$$;
revoke all on function app.medido_item(uuid, uuid) from public, anon, authenticated;

create or replace function app.totalizar_medicao(p_id uuid)
returns void language sql set search_path = '' as $$
  update public.medicao m
     set valor_bruto = t.bruto,
         retencao = round(t.bruto * c.retencao_pct / 100, 2)
    from (select coalesce(sum(valor), 0) as bruto from public.medicao_item where medicao_id = p_id) t,
         public.contrato_medicao c
   where m.id = p_id and c.id = m.contrato_id;
$$;
revoke all on function app.totalizar_medicao(uuid) from public, anon, authenticated;

-- -----------------------------------------------------------------------------
-- Contrato e itens
-- -----------------------------------------------------------------------------
-- p_campos: parte, nome, empreiteira_id, bdi_pct, retencao_pct, prazo_pagamento_dias; ao criar,
-- opcionais "tarefas" (lista de ids; padrão: todas as tarefas com custo) e "base" ('custo' ou
-- 'mao_obra': para empreiteiro, a mão de obra da composição quando houver).
create or replace function public.salvar_contrato_medicao(p_id uuid, p_projeto_id uuid, p_campos jsonb)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_empresa uuid;
  v_parte   public.parte_medicao;
  v_emp     uuid := nullif(p_campos ->> 'empreiteira_id', '')::uuid;
  v_bdi     numeric := coalesce(nullif(p_campos ->> 'bdi_pct', '')::numeric, 0);
  v_id      uuid;
begin
  if not app.pode_financeiro_projeto(p_projeto_id) then
    raise exception 'Só o engenheiro ou o financeiro da obra cuidam dos contratos de medição' using errcode = '42501';
  end if;
  select empresa_id into v_empresa from public.projeto where id = p_projeto_id;

  if p_id is not null then
    update public.contrato_medicao set
      nome = btrim(coalesce(p_campos ->> 'nome', nome)),
      bdi_pct = coalesce(nullif(p_campos ->> 'bdi_pct', '')::numeric, bdi_pct),
      retencao_pct = coalesce(nullif(p_campos ->> 'retencao_pct', '')::numeric, retencao_pct),
      prazo_pagamento_dias = coalesce(nullif(p_campos ->> 'prazo_pagamento_dias', '')::integer, prazo_pagamento_dias)
    where id = p_id and projeto_id = p_projeto_id
    returning id into v_id;
    if v_id is null then
      raise exception 'Contrato de medição não encontrado nesta obra';
    end if;
    return v_id;
  end if;

  v_parte := coalesce(nullif(p_campos ->> 'parte', '')::public.parte_medicao, 'cliente');
  if v_parte = 'cliente' then
    v_emp := null;
    if exists (select 1 from public.contrato_medicao where projeto_id = p_projeto_id and parte = 'cliente') then
      raise exception 'Esta obra já tem o contrato de medição com o cliente';
    end if;
  elsif v_emp is null or not exists (select 1 from public.empreiteira where id = v_emp and empresa_id = v_empresa) then
    raise exception 'Escolha a empreiteira deste contrato';
  end if;

  insert into public.contrato_medicao (empresa_id, projeto_id, parte, nome, empreiteira_id, bdi_pct, retencao_pct, prazo_pagamento_dias, criado_por)
  values (v_empresa, p_projeto_id, v_parte, btrim(coalesce(p_campos ->> 'nome', '')), v_emp, v_bdi,
          coalesce(nullif(p_campos ->> 'retencao_pct', '')::numeric, 0),
          coalesce(nullif(p_campos ->> 'prazo_pagamento_dias', '')::integer, 10), auth.uid())
  returning id into v_id;

  -- Itens da EAP: preço unitário = base × (1 + BDI) ÷ quantidade.
  insert into public.contrato_medicao_item (contrato_id, empresa_id, projeto_id, tarefa_id, criterio, unidade, quantidade, preco_unitario)
  select v_id, v_empresa, p_projeto_id, t.id,
         case when q.tem_qtd then 'quantidade' else 'percentual' end::public.criterio_medicao,
         case when q.tem_qtd then btrim(t.unidade) else '%' end,
         case when q.tem_qtd then t.quantidade else 100 end,
         round(b.base * (1 + v_bdi / 100) / case when q.tem_qtd then t.quantidade else 100 end, 4)
    from public.eap_item t
    left join public.composicao_custo cc on cc.tarefa_id = t.id
    cross join lateral (select coalesce(t.quantidade, 0) > 0 and coalesce(btrim(t.unidade), '') <> '' as tem_qtd) q
    cross join lateral (select case when p_campos ->> 'base' = 'mao_obra' and coalesce(cc.mao_obra, 0) > 0
                                    then cc.mao_obra else t.custo_previsto end as base) b
   where t.projeto_id = p_projeto_id and t.tipo = 'tarefa' and coalesce(b.base, 0) > 0
     and (not p_campos ? 'tarefas' or t.id in (select (x #>> '{}')::uuid from jsonb_array_elements(p_campos -> 'tarefas') x));
  return v_id;
end;
$$;

-- Cria ou ajusta o item de uma tarefa: criterio, unidade, quantidade, preco_unitario.
create or replace function public.definir_item_contrato(p_contrato_id uuid, p_tarefa_id uuid, p_campos jsonb)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  c        public.contrato_medicao;
  v_crit   public.criterio_medicao := coalesce(nullif(p_campos ->> 'criterio', '')::public.criterio_medicao, 'quantidade');
  v_qtd    numeric := case when v_crit = 'percentual' then 100 else nullif(p_campos ->> 'quantidade', '')::numeric end;
  v_un     text := case when v_crit = 'percentual' then '%' else nullif(btrim(p_campos ->> 'unidade'), '') end;
  v_pu     numeric := nullif(p_campos ->> 'preco_unitario', '')::numeric;
  v_item   uuid;
  v_medido numeric;
begin
  select * into c from public.contrato_medicao where id = p_contrato_id;
  if c.id is null or not app.pode_financeiro_projeto(c.projeto_id) then
    raise exception 'Contrato não encontrado ou sem permissão' using errcode = '42501';
  end if;
  if not exists (select 1 from public.eap_item where id = p_tarefa_id and projeto_id = c.projeto_id and tipo = 'tarefa') then
    raise exception 'Escolha uma tarefa desta obra';
  end if;
  if v_qtd is null or v_qtd <= 0 or v_un is null or v_pu is null or v_pu < 0 then
    raise exception 'Informe unidade, quantidade maior que zero e preço unitário';
  end if;
  select id into v_item from public.contrato_medicao_item where contrato_id = c.id and tarefa_id = p_tarefa_id;
  if v_item is not null then
    v_medido := app.medido_item(v_item);
    if v_medido > 0 and v_qtd < v_medido then
      raise exception 'Já foram medidos % %: a quantidade contratada não pode ficar abaixo disso', trim_scale(v_medido), v_un;
    end if;
    if v_medido > 0 and (select criterio from public.contrato_medicao_item where id = v_item) <> v_crit then
      raise exception 'Este item já foi medido: o critério de medição não muda mais';
    end if;
  end if;
  insert into public.contrato_medicao_item (contrato_id, empresa_id, projeto_id, tarefa_id, criterio, unidade, quantidade, preco_unitario)
  values (c.id, c.empresa_id, c.projeto_id, p_tarefa_id, v_crit, v_un, v_qtd, v_pu)
  on conflict (contrato_id, tarefa_id) do update set
    criterio = excluded.criterio, unidade = excluded.unidade, quantidade = excluded.quantidade, preco_unitario = excluded.preco_unitario
  returning id into v_item;
  return v_item;
end;
$$;

create or replace function public.remover_item_contrato(p_item_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare
  v_projeto uuid;
begin
  select projeto_id into v_projeto from public.contrato_medicao_item where id = p_item_id;
  if v_projeto is null or not app.pode_financeiro_projeto(v_projeto) then
    raise exception 'Item não encontrado ou sem permissão' using errcode = '42501';
  end if;
  if exists (select 1 from public.medicao_item where contrato_item_id = p_item_id) then
    raise exception 'Este item já aparece em medições e não pode sair do contrato';
  end if;
  delete from public.contrato_medicao_item where id = p_item_id;
end;
$$;

-- -----------------------------------------------------------------------------
-- Boletim
-- -----------------------------------------------------------------------------
-- Gera o rascunho do próximo boletim até p_fim, sugerindo em cada item "executado − já medido".
create or replace function public.gerar_medicao(p_contrato_id uuid, p_fim date)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  c        public.contrato_medicao;
  v_hoje   date := (now() at time zone 'America/Sao_Paulo')::date;
  v_ultimo public.medicao;
  v_inicio date;
  v_id     uuid;
begin
  select * into c from public.contrato_medicao where id = p_contrato_id;
  if c.id is null or not app.pode_financeiro_projeto(c.projeto_id) then
    raise exception 'Contrato não encontrado ou sem permissão' using errcode = '42501';
  end if;
  if p_fim is null or p_fim > v_hoje then
    raise exception 'A medição vai até hoje, no máximo';
  end if;
  if exists (select 1 from public.medicao where contrato_id = c.id and status = 'rascunho') then
    raise exception 'Já existe uma medição em rascunho neste contrato: aprove ou apague antes de gerar outra';
  end if;
  select * into v_ultimo from public.medicao where contrato_id = c.id order by numero desc limit 1;
  if v_ultimo.id is not null and p_fim <= v_ultimo.fim then
    raise exception 'A medição anterior (nº %) já vai até %: escolha uma data depois dela', v_ultimo.numero, to_char(v_ultimo.fim, 'DD/MM/YYYY');
  end if;
  v_inicio := coalesce(v_ultimo.fim + 1,
                       least(p_fim, coalesce((select data_inicio from public.projeto where id = c.projeto_id), p_fim)));

  insert into public.medicao (empresa_id, projeto_id, contrato_id, numero, inicio, fim, criado_por)
  values (c.empresa_id, c.projeto_id, c.id, coalesce(v_ultimo.numero, 0) + 1, v_inicio, p_fim, auth.uid())
  returning id into v_id;

  insert into public.medicao_item (medicao_id, contrato_item_id, empresa_id, projeto_id, quantidade, valor, executado_acumulado)
  select v_id, i.id, c.empresa_id, c.projeto_id, s.sugerido, round(s.sugerido * i.preco_unitario, 2), s.executado
    from public.contrato_medicao_item i
    cross join lateral (select round(app.executado_tarefa(i.tarefa_id, p_fim) * i.quantidade, 4) as executado) e
    cross join lateral (select e.executado, least(i.quantidade, e.executado) - app.medido_item(i.id) as sugerido) s
   where i.contrato_id = c.id and s.sugerido > 0;

  perform app.totalizar_medicao(v_id);
  return v_id;
end;
$$;

-- Ajusta a quantidade medida de um item no rascunho (0 tira o item). O banco é o juiz:
-- o acumulado não passa do executado no fim do período nem do contratado.
create or replace function public.ajustar_item_medicao(p_medicao_id uuid, p_contrato_item_id uuid, p_quantidade numeric)
returns numeric language plpgsql security definer set search_path = '' as $$
declare
  m          public.medicao;
  i          public.contrato_medicao_item;
  v_exec     numeric;
  v_anterior numeric;
  v_nome     text;
begin
  select * into m from public.medicao where id = p_medicao_id;
  if m.id is null or not app.pode_financeiro_projeto(m.projeto_id) then
    raise exception 'Medição não encontrada ou sem permissão' using errcode = '42501';
  end if;
  if m.status <> 'rascunho' then
    raise exception 'Só a medição em rascunho pode ser ajustada';
  end if;
  select * into i from public.contrato_medicao_item where id = p_contrato_item_id and contrato_id = m.contrato_id;
  if i.id is null then
    raise exception 'Item não pertence ao contrato desta medição';
  end if;
  if p_quantidade is null or p_quantidade < 0 then
    raise exception 'A quantidade medida não pode ser negativa';
  end if;
  select nome into v_nome from public.eap_item where id = i.tarefa_id;
  v_exec := round(app.executado_tarefa(i.tarefa_id, m.fim) * i.quantidade, 4);
  v_anterior := app.medido_item(i.id, m.id);
  if v_anterior + p_quantidade > i.quantidade then
    raise exception '%: o acumulado (% %) passaria do contratado (% %)', v_nome,
      trim_scale(v_anterior + p_quantidade), i.unidade, trim_scale(i.quantidade), i.unidade;
  end if;
  if v_anterior + p_quantidade > v_exec then
    raise exception '%: o acumulado (% %) passaria do executado até % (% %, pelo avanço apontado). Aponte o avanço antes de medir.',
      v_nome, trim_scale(v_anterior + p_quantidade), i.unidade, to_char(m.fim, 'DD/MM/YYYY'), trim_scale(v_exec), i.unidade;
  end if;

  if p_quantidade = 0 then
    delete from public.medicao_item where medicao_id = m.id and contrato_item_id = i.id;
  else
    insert into public.medicao_item (medicao_id, contrato_item_id, empresa_id, projeto_id, quantidade, valor, executado_acumulado)
    values (m.id, i.id, m.empresa_id, m.projeto_id, p_quantidade, round(p_quantidade * i.preco_unitario, 2), v_exec)
    on conflict (medicao_id, contrato_item_id) do update set
      quantidade = excluded.quantidade, valor = excluded.valor, executado_acumulado = excluded.executado_acumulado;
  end if;
  perform app.totalizar_medicao(m.id);
  return (select valor_bruto from public.medicao where id = m.id);
end;
$$;

create or replace function public.observar_medicao(p_medicao_id uuid, p_observacao text)
returns void language plpgsql security definer set search_path = '' as $$
declare
  m public.medicao;
begin
  select * into m from public.medicao where id = p_medicao_id;
  if m.id is null or not app.pode_financeiro_projeto(m.projeto_id) then
    raise exception 'Medição não encontrada ou sem permissão' using errcode = '42501';
  end if;
  if m.status <> 'rascunho' then
    raise exception 'Só a medição em rascunho pode ser alterada';
  end if;
  update public.medicao set observacao = nullif(btrim(p_observacao), '') where id = m.id;
end;
$$;

-- Aprova (só o engenheiro): confere de novo cada item contra o executado e libera para pagar.
create or replace function public.aprovar_medicao(p_medicao_id uuid)
returns date language plpgsql security definer set search_path = '' as $$
declare
  m          public.medicao;
  c          public.contrato_medicao;
  v_hoje     date := (now() at time zone 'America/Sao_Paulo')::date;
  v_problema text;
  v_nome     text;
begin
  select * into m from public.medicao where id = p_medicao_id;
  if m.id is null or not coalesce(app.papel_no_projeto(m.projeto_id) = 'engenheiro', false) then
    raise exception 'Só o engenheiro da obra aprova a medição' using errcode = '42501';
  end if;
  if m.status <> 'rascunho' then
    raise exception 'Esta medição já foi aprovada';
  end if;
  if m.valor_bruto <= 0 then
    raise exception 'A medição está vazia: nenhum item medido';
  end if;
  select string_agg(t.nome, ', ') into v_problema
    from public.medicao_item mi
    join public.contrato_medicao_item i on i.id = mi.contrato_item_id
    join public.eap_item t on t.id = i.tarefa_id
   where mi.medicao_id = m.id
     and app.medido_item(i.id, m.id) + mi.quantidade > round(app.executado_tarefa(i.tarefa_id, m.fim) * i.quantidade, 4);
  if v_problema is not null then
    raise exception 'O avanço apontado diminuiu depois do rascunho; o medido passou do executado em: %. Ajuste a medição.', v_problema;
  end if;
  select * into c from public.contrato_medicao where id = m.contrato_id;
  select u.email into v_nome from auth.users u where u.id = auth.uid();
  update public.medicao
     set status = 'aprovada', aprovada_por = auth.uid(), aprovada_nome = v_nome, aprovada_em = now(),
         vencimento = v_hoje + c.prazo_pagamento_dias
   where id = m.id;
  return v_hoje + c.prazo_pagamento_dias;
end;
$$;

create or replace function public.registrar_pagamento_medicao(p_medicao_id uuid, p_data date, p_valor numeric default null)
returns void language plpgsql security definer set search_path = '' as $$
declare
  m public.medicao;
begin
  select * into m from public.medicao where id = p_medicao_id;
  if m.id is null or not app.pode_financeiro_projeto(m.projeto_id) then
    raise exception 'Medição não encontrada ou sem permissão' using errcode = '42501';
  end if;
  if m.status <> 'aprovada' then
    raise exception 'Só a medição aprovada e ainda não paga recebe o pagamento';
  end if;
  if p_data is null or p_data > (now() at time zone 'America/Sao_Paulo')::date or p_data < (m.aprovada_em at time zone 'America/Sao_Paulo')::date - 1 then
    raise exception 'Data do pagamento inválida (entre a aprovação e hoje)';
  end if;
  update public.medicao set status = 'paga', pago_em = p_data, pago_valor = coalesce(p_valor, valor_liquido) where id = m.id;
end;
$$;

create or replace function public.excluir_medicao(p_medicao_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare
  m public.medicao;
begin
  select * into m from public.medicao where id = p_medicao_id;
  if m.id is null or not app.pode_financeiro_projeto(m.projeto_id) then
    raise exception 'Medição não encontrada ou sem permissão' using errcode = '42501';
  end if;
  if m.status <> 'rascunho' then
    raise exception 'Só a medição em rascunho pode ser apagada';
  end if;
  delete from public.medicao where id = m.id;
end;
$$;

-- -----------------------------------------------------------------------------
-- RLS e grants: leitura para quem vê o financeiro da obra; escrita só pelas funções.
-- -----------------------------------------------------------------------------
alter table public.contrato_medicao      enable row level security;
alter table public.contrato_medicao_item enable row level security;
alter table public.medicao               enable row level security;
alter table public.medicao_item          enable row level security;

create policy contrato_medicao_select on public.contrato_medicao for select to authenticated
  using (app.pode_financeiro_projeto(projeto_id));
create policy contrato_medicao_item_select on public.contrato_medicao_item for select to authenticated
  using (app.pode_financeiro_projeto(projeto_id));
create policy medicao_select on public.medicao for select to authenticated
  using (app.pode_financeiro_projeto(projeto_id));
create policy medicao_item_select on public.medicao_item for select to authenticated
  using (app.pode_financeiro_projeto(projeto_id));

grant select on public.contrato_medicao, public.contrato_medicao_item, public.medicao, public.medicao_item to authenticated;

revoke all on function
  public.salvar_contrato_medicao(uuid, uuid, jsonb),
  public.definir_item_contrato(uuid, uuid, jsonb),
  public.remover_item_contrato(uuid),
  public.gerar_medicao(uuid, date),
  public.ajustar_item_medicao(uuid, uuid, numeric),
  public.observar_medicao(uuid, text),
  public.aprovar_medicao(uuid),
  public.registrar_pagamento_medicao(uuid, date, numeric),
  public.excluir_medicao(uuid)
from public, anon;
grant execute on function
  public.salvar_contrato_medicao(uuid, uuid, jsonb),
  public.definir_item_contrato(uuid, uuid, jsonb),
  public.remover_item_contrato(uuid),
  public.gerar_medicao(uuid, date),
  public.ajustar_item_medicao(uuid, uuid, numeric),
  public.observar_medicao(uuid, text),
  public.aprovar_medicao(uuid),
  public.registrar_pagamento_medicao(uuid, date, numeric),
  public.excluir_medicao(uuid)
to authenticated;

-- -----------------------------------------------------------------------------
-- Obra de exemplo: o contrato com o cliente e as medições dos três meses.
-- A função antiga vira app.criar_obra_exemplo_base; a nova chama ela e acrescenta a medição.
-- -----------------------------------------------------------------------------
alter function public.criar_obra_exemplo(uuid) rename to criar_obra_exemplo_base;
alter function public.criar_obra_exemplo_base(uuid) set schema app;
revoke all on function app.criar_obra_exemplo_base(uuid) from public, anon, authenticated;

-- Correção (05/11): a saída de material da obra de exemplo usava o saldo lido no começo do dia; com o mesmo
-- material indo para duas tarefas no mesmo dia, a segunda saída passava do saldo e a criação falhava
-- (dependia da data). Agora relê o saldo antes de cada saída.
create or replace function app.criar_obra_exemplo_base(p_empresa_id uuid)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  -- app.exemplo_hoje: só os testes usam, para montar a obra como se "hoje" fosse outro dia (passado).
  v_hoje   date := coalesce(nullif(current_setting('app.exemplo_hoje', true), '')::date, (now() at time zone 'America/Sao_Paulo')::date);
  v_saldo  numeric;
  v_d0     date;
  v_proj   uuid;
  v_pav    text[] := array['Térreo', '1º pavimento', '2º pavimento', '3º pavimento', '4º pavimento'];
  v_sigla  text[] := array['térreo', '1º pav.', '2º pav.', '3º pav.', '4º pav.'];
  p        integer;
  b        integer;
  r        record;
  s        record;
  v_dia    date;
  v_linhas jsonb;
  v_id     uuid;
  v_n      integer;
  v_pct    numeric;
  v_qtd    numeric;
  v_emp_estr uuid;
  v_emp_ele  uuid;
  v_emp_hid  uuid;
  v_ctr_estr uuid;
  v_ped_conc uuid;
  v_ctr_ele  uuid;
  v_clima_m public.clima_periodo;
  v_clima_t public.clima_periodo;
  v_nf     integer := 1000;
begin
  if not coalesce(app.e_admin_empresa(p_empresa_id), false) then
    raise exception 'Só o admin da empresa cria a obra de exemplo' using errcode = '42501';
  end if;
  if exists (select 1 from public.projeto where empresa_id = p_empresa_id and exemplo) then
    raise exception 'A empresa já tem uma obra de exemplo: apague a atual antes de criar outra';
  end if;

  perform set_config('app.criando_exemplo', 'sim', true);
  perform setseed(0.2026);  -- mesma obra toda vez
  v_d0 := v_hoje - 90;

  v_proj := public.criar_projeto(p_empresa_id, 'Residencial Jardim das Acácias (exemplo)',
    'Rua das Acácias, 120 – Taquaral, Campinas/SP', v_d0, v_d0 + 245, 6400000, 'em_andamento');
  update public.projeto set exemplo = true, latitude = -22.874, longitude = -47.052 where id = v_proj;

  -- ------------------------------------------------------------------ EAP
  drop table if exists pg_temp._ex_tarefa;
  create temp table _ex_tarefa (
    ordem   integer generated always as identity,
    chave   text primary key,
    pai     text,
    tipo    text not null,
    nome    text not null,
    unidade text,
    qtd     numeric,
    ini     integer,
    fim     integer,
    custo   numeric,
    grupo   text,
    id      uuid,
    ini_real date,
    fim_real date
  ) on commit drop;

  insert into pg_temp._ex_tarefa (chave, pai, tipo, nome, unidade, qtd, ini, fim, custo, grupo) values
    ('E01', null, 'etapa', 'Serviços preliminares', null, null, null, null, null, null),
    ('E01.1', 'E01', 'tarefa', 'Mobilização e canteiro de obras', null, null, 0, 9, 52000, 'civil'),
    ('E01.2', 'E01', 'tarefa', 'Tapume e placa da obra', 'm', 140, 0, 4, 18500, 'civil'),
    ('E01.3', 'E01', 'tarefa', 'Limpeza do terreno', 'm²', 1200, 0, 6, 9800, 'civil'),
    ('E01.4', 'E01', 'tarefa', 'Ligações provisórias de água e energia', null, null, 3, 9, 7600, 'civil'),
    ('E01.5', 'E01', 'tarefa', 'Barracão, vestiário e almoxarifado', 'm²', 60, 5, 14, 34000, 'civil'),
    ('E01.6', 'E01', 'tarefa', 'Locação da obra', null, null, 8, 12, 6400, 'civil'),
    ('E02', null, 'etapa', 'Fundação', null, null, null, null, null, null),
    ('E02.1', 'E02', 'tarefa', 'Escavação mecânica', 'm³', 420, 13, 19, 31000, 'civil'),
    ('E02.2', 'E02', 'tarefa', 'Estacas hélice contínua', 'm', 860, 15, 26, 148000, 'estrutura'),
    ('E02.3', 'E02', 'tarefa', 'Formas dos blocos', 'm²', 210, 25, 31, 26000, 'estrutura'),
    ('E02.4', 'E02', 'tarefa', 'Armação dos blocos', 'kg', 6800, 27, 34, 61000, 'estrutura'),
    ('E02.5', 'E02', 'tarefa', 'Concretagem dos blocos', 'm³', 96, 35, 37, 54000, 'estrutura'),
    ('E02.6', 'E02', 'tarefa', 'Formas das vigas baldrame', 'm²', 260, 36, 41, 29000, 'estrutura'),
    ('E02.7', 'E02', 'tarefa', 'Armação das vigas baldrame', 'kg', 5200, 38, 44, 47000, 'estrutura'),
    ('E02.8', 'E02', 'tarefa', 'Concretagem das vigas baldrame', 'm³', 58, 45, 46, 33000, 'estrutura'),
    ('E02.9', 'E02', 'tarefa', 'Impermeabilização das vigas baldrame', 'm²', 310, 47, 50, 14500, 'civil'),
    ('E03', null, 'etapa', 'Estrutura', null, null, null, null, null, null),
    ('E04', null, 'etapa', 'Alvenaria', null, null, null, null, null, null),
    ('E05', null, 'etapa', 'Instalações elétricas', null, null, null, null, null, null),
    ('E06', null, 'etapa', 'Instalações hidrossanitárias', null, null, null, null, null, null),
    ('E07', null, 'etapa', 'Revestimentos', null, null, null, null, null, null);

  for p in 1..5 loop
    b := 51 + (p - 1) * 18;
    insert into pg_temp._ex_tarefa (chave, pai, tipo, nome, unidade, qtd, ini, fim, custo, grupo) values
      ('E03.' || p, 'E03', 'etapa', v_pav[p], null, null, null, null, null, null),
      ('E03.' || p || '.1', 'E03.' || p, 'tarefa', 'Formas de pilares – ' || v_sigla[p], 'm²', 190, b, b + 5, 36000, 'estrutura'),
      ('E03.' || p || '.2', 'E03.' || p, 'tarefa', 'Armação de pilares – ' || v_sigla[p], 'kg', 4300, b + 2, b + 7, 39000, 'estrutura'),
      ('E03.' || p || '.3', 'E03.' || p, 'tarefa', 'Concretagem de pilares – ' || v_sigla[p], 'm³', 28, b + 8, b + 8, 17500, 'estrutura'),
      ('E03.' || p || '.4', 'E03.' || p, 'tarefa', 'Formas de vigas e laje – ' || v_sigla[p], 'm²', 520, b + 9, b + 14, 71000, 'estrutura'),
      ('E03.' || p || '.5', 'E03.' || p, 'tarefa', 'Armação de vigas e laje – ' || v_sigla[p], 'kg', 7600, b + 11, b + 16, 68000, 'estrutura'),
      ('E03.' || p || '.6', 'E03.' || p, 'tarefa', 'Concretagem de vigas e laje – ' || v_sigla[p], 'm³', 74, b + 17, b + 17, 46000, 'estrutura');

    b := 72 + (p - 1) * 18;
    insert into pg_temp._ex_tarefa (chave, pai, tipo, nome, unidade, qtd, ini, fim, custo, grupo) values
      ('E04.' || p, 'E04', 'etapa', v_pav[p], null, null, null, null, null, null),
      ('E04.' || p || '.1', 'E04.' || p, 'tarefa', 'Marcação da alvenaria – ' || v_sigla[p], 'm', 310, b, b + 2, 6200, 'civil'),
      ('E04.' || p || '.2', 'E04.' || p, 'tarefa', 'Elevação da alvenaria – ' || v_sigla[p], 'm²', 640, b + 3, b + 13, 58000, 'civil'),
      ('E04.' || p || '.3', 'E04.' || p, 'tarefa', 'Vergas e contravergas – ' || v_sigla[p], 'm', 180, b + 9, b + 14, 8400, 'civil');

    b := 80 + (p - 1) * 18;
    insert into pg_temp._ex_tarefa (chave, pai, tipo, nome, unidade, qtd, ini, fim, custo, grupo) values
      ('E05.' || p, 'E05', 'etapa', v_pav[p], null, null, null, null, null, null),
      ('E05.' || p || '.1', 'E05.' || p, 'tarefa', 'Tubulação elétrica embutida – ' || v_sigla[p], 'm', 1400, b, b + 8, 21000, 'eletrica'),
      ('E05.' || p || '.2', 'E05.' || p, 'tarefa', 'Caixas e quadros – ' || v_sigla[p], 'un', 160, b + 6, b + 10, 9200, 'eletrica'),
      ('E05.' || p || '.3', 'E05.' || p, 'tarefa', 'Fiação e acabamentos elétricos – ' || v_sigla[p], 'm', 5200, b + 46, b + 54, 26500, 'eletrica'),
      ('E06.' || p, 'E06', 'etapa', v_pav[p], null, null, null, null, null, null),
      ('E06.' || p || '.1', 'E06.' || p, 'tarefa', 'Tubulação de água fria – ' || v_sigla[p], 'm', 620, b, b + 8, 18500, 'hidraulica'),
      ('E06.' || p || '.2', 'E06.' || p, 'tarefa', 'Esgoto e ventilação – ' || v_sigla[p], 'm', 380, b + 3, b + 11, 16800, 'hidraulica'),
      ('E06.' || p || '.3', 'E06.' || p, 'tarefa', 'Teste de estanqueidade – ' || v_sigla[p], null, null, b + 12, b + 13, 2400, 'hidraulica');

    b := 98 + (p - 1) * 18;
    insert into pg_temp._ex_tarefa (chave, pai, tipo, nome, unidade, qtd, ini, fim, custo, grupo) values
      ('E07.' || p, 'E07', 'etapa', v_pav[p], null, null, null, null, null, null),
      ('E07.' || p || '.1', 'E07.' || p, 'tarefa', 'Chapisco e reboco interno – ' || v_sigla[p], 'm²', 1900, b, b + 12, 64000, 'civil'),
      ('E07.' || p || '.2', 'E07.' || p, 'tarefa', 'Contrapiso – ' || v_sigla[p], 'm²', 480, b + 10, b + 16, 31000, 'civil'),
      ('E07.' || p || '.3', 'E07.' || p, 'tarefa', 'Piso porcelanato – ' || v_sigla[p], 'm²', 450, b + 18, b + 26, 74000, 'acabamento'),
      ('E07.' || p || '.4', 'E07.' || p, 'tarefa', 'Revestimento cerâmico das áreas molhadas – ' || v_sigla[p], 'm²', 380, b + 20, b + 28, 52000, 'acabamento');
  end loop;

  insert into pg_temp._ex_tarefa (chave, pai, tipo, nome, unidade, qtd, ini, fim, custo, grupo) values
    ('E08', null, 'etapa', 'Cobertura', null, null, null, null, null, null),
    ('E08.1', 'E08', 'tarefa', 'Estrutura metálica do telhado', 'm²', 520, 141, 150, 82000, 'estrutura'),
    ('E08.2', 'E08', 'tarefa', 'Impermeabilização da laje técnica', 'm²', 180, 145, 152, 24000, 'civil'),
    ('E08.3', 'E08', 'tarefa', 'Telhamento', 'm²', 540, 151, 158, 47000, 'civil'),
    ('E08.4', 'E08', 'tarefa', 'Reservatório de água', null, null, 153, 156, 21000, 'hidraulica'),
    ('E08.5', 'E08', 'tarefa', 'Calhas e rufos', 'm', 160, 157, 162, 15500, 'civil'),
    ('E09', null, 'etapa', 'Esquadrias', null, null, null, null, null, null),
    ('E09.1', 'E09', 'tarefa', 'Contramarcos das janelas', 'un', 96, 150, 160, 19000, 'acabamento'),
    ('E09.2', 'E09', 'tarefa', 'Janelas de alumínio', 'un', 96, 176, 190, 168000, 'acabamento'),
    ('E09.3', 'E09', 'tarefa', 'Portas de madeira', 'un', 72, 190, 200, 86000, 'acabamento'),
    ('E09.4', 'E09', 'tarefa', 'Vidros', 'm²', 140, 195, 202, 42000, 'acabamento'),
    ('E09.5', 'E09', 'tarefa', 'Ferragens e fechaduras', 'un', 72, 200, 205, 21500, 'acabamento'),
    ('E10', null, 'etapa', 'Fachada', null, null, null, null, null, null),
    ('E10.1', 'E10', 'tarefa', 'Chapisco e reboco externo', 'm²', 2100, 163, 186, 98000, 'civil'),
    ('E10.2', 'E10', 'tarefa', 'Juntas de dilatação', 'm', 260, 186, 189, 9800, 'civil'),
    ('E10.3', 'E10', 'tarefa', 'Pingadeiras e peitoris', 'm', 230, 187, 191, 14200, 'acabamento'),
    ('E10.4', 'E10', 'tarefa', 'Textura acrílica da fachada', 'm²', 2100, 192, 206, 61000, 'acabamento'),
    ('E10.5', 'E10', 'tarefa', 'Limpeza da fachada', 'm²', 2100, 207, 209, 6800, 'civil'),
    ('E11', null, 'etapa', 'Pintura', null, null, null, null, null, null);

  for p in 1..5 loop
    b := 132 + (p - 1) * 20;
    insert into pg_temp._ex_tarefa (chave, pai, tipo, nome, unidade, qtd, ini, fim, custo, grupo) values
      ('E11.' || p, 'E11', 'etapa', v_pav[p], null, null, null, null, null, null),
      ('E11.' || p || '.1', 'E11.' || p, 'tarefa', 'Massa corrida – ' || v_sigla[p], 'm²', 2300, b, b + 8, 28000, 'acabamento'),
      ('E11.' || p || '.2', 'E11.' || p, 'tarefa', 'Pintura final – ' || v_sigla[p], 'm²', 2300, b + 10, b + 16, 33000, 'acabamento');
  end loop;

  insert into pg_temp._ex_tarefa (chave, pai, tipo, nome, unidade, qtd, ini, fim, custo, grupo) values
    ('E12', null, 'etapa', 'Limpeza e entrega', null, null, null, null, null, null),
    ('E12.1', 'E12', 'tarefa', 'Limpeza fina', 'm²', 2600, 230, 236, 18000, 'civil'),
    ('E12.2', 'E12', 'tarefa', 'Vistoria com o cliente', null, null, 237, 238, 3500, 'civil'),
    ('E12.3', 'E12', 'tarefa', 'Habite-se e documentação', null, null, 238, 244, 9500, 'civil'),
    ('E12.4', 'E12', 'tarefa', 'Entrega das chaves', null, null, 245, 245, 4500, 'civil');

  perform public.importar_eap(v_proj, (
    select jsonb_agg(jsonb_strip_nulls(jsonb_build_object(
             'chave', t.chave, 'pai', t.pai, 'tipo', t.tipo, 'nome', t.nome, 'unidade', t.unidade,
             'quantidade', t.qtd, 'custo_previsto', t.custo,
             'inicio_previsto', v_d0 + t.ini, 'fim_previsto', v_d0 + t.fim)) order by t.ordem)
      from pg_temp._ex_tarefa t));

  -- Os nomes das tarefas são únicos: ligam a tabela temporária aos itens criados.
  update pg_temp._ex_tarefa t set id = e.id
    from public.eap_item e
   where e.projeto_id = v_proj and e.tipo = 'tarefa' and e.nome = t.nome and t.tipo = 'tarefa';

  -- ------------------------------------------------------------------ dependências
  for r in
    with pares(pred, succ) as (
      values ('E01.6', 'E02.1'), ('E02.1', 'E02.2'), ('E02.2', 'E02.3'), ('E02.3', 'E02.4'), ('E02.4', 'E02.5'),
             ('E02.5', 'E02.6'), ('E02.6', 'E02.7'), ('E02.7', 'E02.8'), ('E02.8', 'E02.9'), ('E02.8', 'E03.1.1'),
             ('E03.5.6', 'E08.1'), ('E08.1', 'E08.3'), ('E08.3', 'E08.5'), ('E08.3', 'E10.1'), ('E10.1', 'E10.4'),
             ('E10.4', 'E10.5'), ('E09.1', 'E09.2'), ('E09.2', 'E09.3'), ('E09.3', 'E09.5'), ('E11.5.2', 'E12.1'),
             ('E10.5', 'E12.1'), ('E12.1', 'E12.2'), ('E12.2', 'E12.3'), ('E12.3', 'E12.4')
      union all
      select 'E03.' || g || '.' || k, 'E03.' || g || '.' || (k + 1) from generate_series(1, 5) g, generate_series(1, 5) k
      union all
      select 'E03.' || g || '.6', 'E03.' || (g + 1) || '.1' from generate_series(1, 4) g
      union all
      select 'E03.' || g || '.6', 'E04.' || g || '.1' from generate_series(1, 5) g
      union all
      select 'E04.' || g || '.1', 'E04.' || g || '.2' from generate_series(1, 5) g
      union all
      select 'E04.' || g || '.2', 'E05.' || g || '.1' from generate_series(1, 5) g
      union all
      select 'E04.' || g || '.2', 'E06.' || g || '.1' from generate_series(1, 5) g
      union all
      select 'E06.' || g || '.2', 'E06.' || g || '.3' from generate_series(1, 5) g
      union all
      select 'E06.' || g || '.3', 'E07.' || g || '.1' from generate_series(1, 5) g
      union all
      select 'E07.' || g || '.1', 'E07.' || g || '.2' from generate_series(1, 5) g
      union all
      select 'E07.' || g || '.2', 'E07.' || g || '.3' from generate_series(1, 5) g
      union all
      select 'E07.' || g || '.1', 'E11.' || g || '.1' from generate_series(1, 5) g
      union all
      select 'E11.' || g || '.1', 'E11.' || g || '.2' from generate_series(1, 5) g
    )
    select a.id as pred_id, c.id as succ_id,
           case when c.ini > a.fim then 'ti' else 'ii' end::public.tipo_dependencia as tipo,
           case when c.ini > a.fim then c.ini - a.fim - 1 else c.ini - a.ini end as lag
      from pares
      join pg_temp._ex_tarefa a on a.chave = pares.pred
      join pg_temp._ex_tarefa c on c.chave = pares.succ
     where c.ini >= a.ini
  loop
    perform public.salvar_dependencia(r.pred_id, r.succ_id, r.tipo, r.lag);
  end loop;

  -- ------------------------------------------------------------------ custos, versão e linha de base
  for r in select * from pg_temp._ex_tarefa where tipo = 'tarefa' loop
    perform public.definir_composicao_custo(r.id,
      round(r.custo * case r.grupo when 'estrutura' then 0.47 when 'acabamento' then 0.58 when 'eletrica' then 0.55
                                   when 'hidraulica' then 0.52 else 0.42 end, 2),
      round(r.custo * case r.grupo when 'estrutura' then 0.36 when 'acabamento' then 0.34 when 'eletrica' then 0.40
                                   when 'hidraulica' then 0.42 else 0.46 end, 2),
      round(r.custo * case r.grupo when 'estrutura' then 0.12 when 'civil' then 0.07 else 0.02 end, 2),
      round(r.custo * case r.grupo when 'estrutura' then 0.05 when 'civil' then 0.05 when 'acabamento' then 0.06
                                   when 'eletrica' then 0.03 else 0.04 end, 2));
  end loop;
  perform public.salvar_versao_orcamento(v_proj, 'Orçamento aprovado pelo cliente');
  perform public.definir_linha_base(v_proj);

  -- Reprogramação: a estrutura do 2º pavimento atrasou 8 dias (chuva e falta de armador). O cronograma
  -- empurra as sucessoras e a linha de base guarda o plano original para comparar.
  select * into r from pg_temp._ex_tarefa where chave = 'E03.3.1';
  perform public.atualizar_item_eap(r.id, jsonb_build_object(
    'inicio_previsto', v_d0 + r.ini + 8, 'fim_previsto', v_d0 + r.fim + 8));

  -- Execução real: começa na data prevista (já reprogramada) com até 2 dias de folga e dura ~10% a mais.
  update pg_temp._ex_tarefa t
     set ini_real = e.inicio_previsto + floor(random()::numeric * 3)::integer
    from public.eap_item e
   where e.id = t.id;
  update pg_temp._ex_tarefa t
     set fim_real = t.ini_real + ceil((e.fim_previsto - e.inicio_previsto + 1) * 1.1)::integer - 1
    from public.eap_item e
   where e.id = t.id;

  -- ------------------------------------------------------------------ equipe (cadastros, sem login)
  insert into public.empreiteira (empresa_id, nome, telefone, exemplo) values
    (p_empresa_id, 'Estrutura Forte Empreiteira (exemplo)', '(19) 3251-0000', true) returning id into v_emp_estr;
  insert into public.empreiteira (empresa_id, nome, telefone, exemplo) values
    (p_empresa_id, 'Luz & Cia Instalações Elétricas (exemplo)', '(19) 3251-0001', true) returning id into v_emp_ele;
  insert into public.empreiteira (empresa_id, nome, telefone, exemplo) values
    (p_empresa_id, 'Hidro Fácil Instalações (exemplo)', '(19) 3251-0002', true) returning id into v_emp_hid;

  drop table if exists pg_temp._ex_pessoa;
  create temp table _ex_pessoa (n integer generated always as identity, id uuid, nome text, funcao text, emp uuid,
                                grupo text, tipo text, valor numeric) on commit drop;
  insert into pg_temp._ex_pessoa (nome, funcao, emp, grupo, tipo, valor) values
    ('Antônio Carlos Ribeiro', 'Mestre de obras', null, 'propria', 'diaria', 420),
    ('Marcos Vinícius Souza', 'Encarregado', null, 'propria', 'diaria', 300),
    ('José Aparecido Lima', 'Pedreiro', null, 'propria', 'diaria', 210),
    ('Francisco das Chagas', 'Pedreiro', null, 'propria', 'diaria', 210),
    ('Raimundo Nonato Silva', 'Pedreiro', null, 'propria', 'diaria', 210),
    ('Edson Pereira Santos', 'Pedreiro', null, 'propria', 'diaria', 205),
    ('Cícero Alves Batista', 'Pedreiro', null, 'propria', 'diaria', 205),
    ('Luiz Fernando Rocha', 'Pedreiro', null, 'propria', 'diaria', 200),
    ('João Batista Moreira', 'Servente', null, 'propria', 'diaria', 145),
    ('Paulo Roberto Dias', 'Servente', null, 'propria', 'diaria', 145),
    ('Severino Gomes', 'Servente', null, 'propria', 'diaria', 140),
    ('Wellington Cruz', 'Servente', null, 'propria', 'diaria', 140),
    ('Damião Ferreira', 'Servente', null, 'propria', 'diaria', 140),
    ('Gilberto Nascimento', 'Servente', null, 'propria', 'diaria', 140),
    ('Adilson Carvalho', 'Carpinteiro', null, 'propria', 'diaria', 230),
    ('Valdir Mendes', 'Carpinteiro', null, 'propria', 'diaria', 230),
    ('Reginaldo Teixeira', 'Carpinteiro', null, 'propria', 'diaria', 225),
    ('Sebastião Barbosa', 'Armador', null, 'propria', 'diaria', 225),
    ('Ivanildo Araújo', 'Armador', null, 'propria', 'diaria', 225),
    ('Claudinei Pinto', 'Armador', null, 'propria', 'diaria', 220),
    ('Rogério Cardoso', 'Carpinteiro', v_emp_estr, 'estrutura', 'hora', 31),
    ('Anderson Lopes', 'Carpinteiro', v_emp_estr, 'estrutura', 'hora', 31),
    ('Fábio Martins', 'Armador', v_emp_estr, 'estrutura', 'hora', 30),
    ('Leandro Freitas', 'Armador', v_emp_estr, 'estrutura', 'hora', 30),
    ('Robson Correia', 'Armador', v_emp_estr, 'estrutura', 'hora', 29),
    ('Thiago Moraes', 'Eletricista', v_emp_ele, 'eletrica', 'hora', 38),
    ('Diego Ramos', 'Eletricista', v_emp_ele, 'eletrica', 'hora', 38),
    ('Bruno Castro', 'Ajudante de eletricista', v_emp_ele, 'eletrica', 'hora', 22),
    ('Márcio Azevedo', 'Encanador', v_emp_hid, 'hidraulica', 'hora', 36),
    ('Everton Vieira', 'Encanador', v_emp_hid, 'hidraulica', 'hora', 35);

  for r in select * from pg_temp._ex_pessoa order by n loop
    insert into public.trabalhador (empresa_id, nome, funcao, empreiteira_id, exemplo)
    values (p_empresa_id, r.nome, r.funcao, r.emp, true) returning id into v_id;
    update pg_temp._ex_pessoa set id = v_id where n = r.n;
    insert into public.equipe_projeto (projeto_id, trabalhador_id, empresa_id) values (v_proj, v_id, p_empresa_id);
    perform public.definir_custo_mao_obra(v_id, r.tipo::public.tipo_custo_mao_obra, r.valor, v_d0 - 30);
  end loop;

  -- ------------------------------------------------------------------ catálogo do almoxarifado
  drop table if exists pg_temp._ex_item;
  create temp table _ex_item (n integer generated always as identity, id uuid, nome text, tipo text, unidade text,
                              categoria text, minimo numeric, preco numeric, grupo text, lote numeric) on commit drop;
  insert into pg_temp._ex_item (nome, tipo, unidade, categoria, minimo, preco, grupo, lote) values
    ('Cimento CP-II-E-32 50 kg', 'material', 'sc', 'Aglomerantes', 60, 36.90, 'estrutura', 300),
    ('Cimento CP-V ARI 50 kg', 'material', 'sc', 'Aglomerantes', 20, 42.50, 'estrutura', 80),
    ('Cal hidratada CH-III 20 kg', 'material', 'sc', 'Aglomerantes', 30, 18.40, 'civil', 120),
    ('Argamassa AC-I 20 kg', 'material', 'sc', 'Argamassas', 20, 14.90, 'acabamento', 120),
    ('Argamassa AC-II 20 kg', 'material', 'sc', 'Argamassas', 20, 24.90, 'acabamento', 100),
    ('Argamassa AC-III 20 kg', 'material', 'sc', 'Argamassas', 15, 39.90, 'acabamento', 80),
    ('Argamassa de assentamento 20 kg', 'material', 'sc', 'Argamassas', 40, 12.80, 'civil', 200),
    ('Rejunte cinza 1 kg', 'material', 'kg', 'Argamassas', 20, 6.50, 'acabamento', 80),
    ('Rejunte branco 1 kg', 'material', 'kg', 'Argamassas', 20, 7.20, 'acabamento', 80),
    ('Areia média lavada', 'material', 'm³', 'Agregados', 10, 145.00, 'civil', 40),
    ('Areia fina', 'material', 'm³', 'Agregados', 6, 150.00, 'civil', 20),
    ('Brita 0', 'material', 'm³', 'Agregados', 4, 128.00, 'estrutura', 12),
    ('Brita 1', 'material', 'm³', 'Agregados', 8, 122.00, 'estrutura', 25),
    ('Pedrisco', 'material', 'm³', 'Agregados', 3, 135.00, 'civil', 8),
    ('Bloco cerâmico 9x19x19', 'material', 'un', 'Alvenaria', 1500, 1.15, 'civil', 6000),
    ('Bloco cerâmico 14x19x29', 'material', 'un', 'Alvenaria', 2000, 2.35, 'civil', 9000),
    ('Bloco cerâmico 19x19x29', 'material', 'un', 'Alvenaria', 800, 2.95, 'civil', 3000),
    ('Bloco de concreto 14x19x39', 'material', 'un', 'Alvenaria', 400, 3.80, 'civil', 1500),
    ('Canaleta de concreto 14x19x39', 'material', 'un', 'Alvenaria', 100, 4.60, 'civil', 400),
    ('Vergalhão CA-50 6,3 mm (barra 12 m)', 'material', 'br', 'Aço', 80, 28.90, 'estrutura', 300),
    ('Vergalhão CA-50 8,0 mm (barra 12 m)', 'material', 'br', 'Aço', 80, 44.50, 'estrutura', 300),
    ('Vergalhão CA-50 10,0 mm (barra 12 m)', 'material', 'br', 'Aço', 80, 67.80, 'estrutura', 280),
    ('Vergalhão CA-50 12,5 mm (barra 12 m)', 'material', 'br', 'Aço', 60, 104.00, 'estrutura', 220),
    ('Vergalhão CA-50 16,0 mm (barra 12 m)', 'material', 'br', 'Aço', 40, 172.00, 'estrutura', 140),
    ('Vergalhão CA-50 20,0 mm (barra 12 m)', 'material', 'br', 'Aço', 20, 268.00, 'estrutura', 60),
    ('Vergalhão CA-60 4,2 mm (barra 12 m)', 'material', 'br', 'Aço', 60, 13.90, 'estrutura', 200),
    ('Vergalhão CA-60 5,0 mm (barra 12 m)', 'material', 'br', 'Aço', 80, 18.70, 'estrutura', 260),
    ('Tela soldada Q-138 (2x3 m)', 'material', 'un', 'Aço', 20, 129.00, 'estrutura', 80),
    ('Arame recozido 18', 'material', 'kg', 'Aço', 40, 16.50, 'estrutura', 150),
    ('Espaçador plástico para laje', 'material', 'un', 'Aço', 500, 0.28, 'estrutura', 3000),
    ('Prego 17x21 com cabeça', 'material', 'kg', 'Formas', 20, 19.90, 'estrutura', 80),
    ('Prego 18x27 com cabeça', 'material', 'kg', 'Formas', 20, 18.90, 'estrutura', 80),
    ('Prego 18x27 duas cabeças', 'material', 'kg', 'Formas', 10, 24.50, 'estrutura', 40),
    ('Tábua de pinus 30 cm', 'material', 'm', 'Formas', 100, 12.80, 'estrutura', 600),
    ('Sarrafo de pinus 10 cm', 'material', 'm', 'Formas', 150, 4.90, 'estrutura', 800),
    ('Pontalete de eucalipto 3 m', 'material', 'un', 'Formas', 60, 14.00, 'estrutura', 300),
    ('Compensado plastificado 18 mm', 'material', 'ch', 'Formas', 20, 189.00, 'estrutura', 90),
    ('Desmoldante para formas 18 L', 'material', 'bd', 'Formas', 2, 159.00, 'estrutura', 8),
    ('Eletroduto corrugado 3/4" (rolo 50 m)', 'material', 'rl', 'Elétrica', 10, 78.00, 'eletrica', 40),
    ('Eletroduto corrugado 1" (rolo 25 m)', 'material', 'rl', 'Elétrica', 6, 69.00, 'eletrica', 20),
    ('Caixa de luz 4x2 embutir', 'material', 'un', 'Elétrica', 100, 1.45, 'eletrica', 500),
    ('Caixa de luz 4x4 embutir', 'material', 'un', 'Elétrica', 50, 2.30, 'eletrica', 200),
    ('Caixa octogonal para laje', 'material', 'un', 'Elétrica', 40, 4.90, 'eletrica', 160),
    ('Quadro de distribuição 12 disjuntores', 'material', 'un', 'Elétrica', 4, 98.00, 'eletrica', 20),
    ('Quadro de distribuição 24 disjuntores', 'material', 'un', 'Elétrica', 2, 189.00, 'eletrica', 6),
    ('Disjuntor DIN 10 A', 'material', 'un', 'Elétrica', 20, 13.90, 'eletrica', 80),
    ('Disjuntor DIN 16 A', 'material', 'un', 'Elétrica', 20, 13.90, 'eletrica', 80),
    ('Disjuntor DIN 20 A', 'material', 'un', 'Elétrica', 20, 14.50, 'eletrica', 80),
    ('Disjuntor DIN 25 A', 'material', 'un', 'Elétrica', 10, 15.90, 'eletrica', 40),
    ('Disjuntor DIN 32 A', 'material', 'un', 'Elétrica', 10, 17.90, 'eletrica', 40),
    ('Disjuntor DIN 40 A bipolar', 'material', 'un', 'Elétrica', 6, 54.00, 'eletrica', 20),
    ('Dispositivo DR 40 A', 'material', 'un', 'Elétrica', 4, 129.00, 'eletrica', 20),
    ('Tomada 10 A com placa', 'material', 'un', 'Elétrica', 40, 12.50, 'eletrica', 300),
    ('Tomada 20 A com placa', 'material', 'un', 'Elétrica', 20, 14.90, 'eletrica', 120),
    ('Interruptor simples com placa', 'material', 'un', 'Elétrica', 30, 10.90, 'eletrica', 150),
    ('Interruptor paralelo com placa', 'material', 'un', 'Elétrica', 10, 16.90, 'eletrica', 40),
    ('Fita isolante 20 m', 'material', 'un', 'Elétrica', 10, 7.90, 'eletrica', 60),
    ('Tubo PVC soldável 20 mm (barra 6 m)', 'material', 'br', 'Hidráulica', 20, 15.90, 'hidraulica', 120),
    ('Tubo PVC soldável 25 mm (barra 6 m)', 'material', 'br', 'Hidráulica', 30, 19.90, 'hidraulica', 160),
    ('Tubo PVC soldável 32 mm (barra 6 m)', 'material', 'br', 'Hidráulica', 15, 34.90, 'hidraulica', 80),
    ('Tubo PVC soldável 40 mm (barra 6 m)', 'material', 'br', 'Hidráulica', 10, 52.00, 'hidraulica', 40),
    ('Tubo PVC soldável 50 mm (barra 6 m)', 'material', 'br', 'Hidráulica', 6, 69.00, 'hidraulica', 30),
    ('Tubo PVC esgoto 40 mm (barra 6 m)', 'material', 'br', 'Hidráulica', 20, 26.90, 'hidraulica', 100),
    ('Tubo PVC esgoto 50 mm (barra 6 m)', 'material', 'br', 'Hidráulica', 20, 34.90, 'hidraulica', 100),
    ('Tubo PVC esgoto 75 mm (barra 6 m)', 'material', 'br', 'Hidráulica', 10, 49.90, 'hidraulica', 50),
    ('Tubo PVC esgoto 100 mm (barra 6 m)', 'material', 'br', 'Hidráulica', 15, 69.90, 'hidraulica', 70),
    ('Joelho 90° soldável 20 mm', 'material', 'un', 'Hidráulica', 50, 0.95, 'hidraulica', 300),
    ('Joelho 90° soldável 25 mm', 'material', 'un', 'Hidráulica', 50, 1.20, 'hidraulica', 300),
    ('Joelho 90° soldável 32 mm', 'material', 'un', 'Hidráulica', 30, 2.60, 'hidraulica', 150),
    ('Tê soldável 25 mm', 'material', 'un', 'Hidráulica', 30, 1.70, 'hidraulica', 200),
    ('Tê soldável 32 mm', 'material', 'un', 'Hidráulica', 20, 3.40, 'hidraulica', 100),
    ('Joelho 90° esgoto 40 mm', 'material', 'un', 'Hidráulica', 30, 1.90, 'hidraulica', 200),
    ('Joelho 90° esgoto 100 mm', 'material', 'un', 'Hidráulica', 20, 7.90, 'hidraulica', 100),
    ('Junção 45° esgoto 100 mm', 'material', 'un', 'Hidráulica', 10, 14.90, 'hidraulica', 60),
    ('Caixa sifonada 150x150', 'material', 'un', 'Hidráulica', 10, 29.90, 'hidraulica', 60),
    ('Ralo seco 100 mm', 'material', 'un', 'Hidráulica', 10, 12.90, 'hidraulica', 60),
    ('Registro de gaveta 3/4"', 'material', 'un', 'Hidráulica', 10, 48.00, 'hidraulica', 60),
    ('Registro de pressão 3/4"', 'material', 'un', 'Hidráulica', 10, 52.00, 'hidraulica', 60),
    ('Adesivo para PVC 175 g', 'material', 'un', 'Hidráulica', 10, 16.90, 'hidraulica', 60),
    ('Fita veda-rosca 18 mm', 'material', 'un', 'Hidráulica', 20, 4.50, 'hidraulica', 100),
    ('Porcelanato 60x60 acetinado', 'material', 'm²', 'Revestimentos', 100, 69.90, 'acabamento', 700),
    ('Revestimento cerâmico 30x60 branco', 'material', 'm²', 'Revestimentos', 80, 42.90, 'acabamento', 500),
    ('Rodapé de porcelanato 10 cm', 'material', 'm', 'Revestimentos', 60, 14.90, 'acabamento', 400),
    ('Soleira de granito 15 cm', 'material', 'm', 'Revestimentos', 20, 59.00, 'acabamento', 100),
    ('Massa corrida PVA 25 kg', 'material', 'bd', 'Pintura', 10, 72.00, 'acabamento', 60),
    ('Massa acrílica 25 kg', 'material', 'bd', 'Pintura', 6, 118.00, 'acabamento', 30),
    ('Selador acrílico 18 L', 'material', 'lt', 'Pintura', 4, 189.00, 'acabamento', 20),
    ('Tinta acrílica fosca branca 18 L', 'material', 'lt', 'Pintura', 6, 329.00, 'acabamento', 40),
    ('Tinta acrílica semibrilho 18 L', 'material', 'lt', 'Pintura', 4, 389.00, 'acabamento', 20),
    ('Textura acrílica 25 kg', 'material', 'bd', 'Pintura', 6, 98.00, 'acabamento', 60),
    ('Lixa para massa nº 150', 'material', 'fl', 'Pintura', 50, 1.10, 'acabamento', 400),
    ('Rolo de lã 23 cm', 'material', 'un', 'Pintura', 6, 29.90, 'acabamento', 30),
    ('Fita crepe 48 mm', 'material', 'un', 'Pintura', 20, 11.90, 'acabamento', 100),
    ('Manta asfáltica 3 mm (rolo 10 m²)', 'material', 'rl', 'Impermeabilização', 6, 289.00, 'civil', 30),
    ('Impermeabilizante flexível 18 kg', 'material', 'bd', 'Impermeabilização', 4, 219.00, 'civil', 20),
    ('Primer asfáltico 18 L', 'material', 'lt', 'Impermeabilização', 2, 249.00, 'civil', 8),
    ('Telha termoacústica 0,5 mm', 'material', 'm²', 'Cobertura', 50, 98.00, 'civil', 560),
    ('Cumeeira termoacústica', 'material', 'm', 'Cobertura', 10, 69.00, 'civil', 40),
    ('Parafuso autobrocante para telha', 'material', 'un', 'Cobertura', 200, 0.65, 'civil', 2500),
    ('Calha galvanizada nº 26', 'material', 'm', 'Cobertura', 20, 54.00, 'civil', 160),
    ('Lona plástica preta 4x50 m', 'material', 'rl', 'Canteiro', 1, 289.00, 'civil', 4),
    ('Disco de corte para aço 7"', 'material', 'un', 'Consumíveis', 20, 9.90, 'estrutura', 100),
    ('Disco diamantado 110 mm', 'material', 'un', 'Consumíveis', 4, 39.90, 'acabamento', 20),
    ('Broca SDS 8 mm', 'material', 'un', 'Consumíveis', 4, 18.90, 'eletrica', 20),
    ('Capacete de segurança', 'material', 'un', 'EPI', 10, 24.90, 'civil', 40),
    ('Luva de raspa (par)', 'material', 'par', 'EPI', 30, 12.90, 'civil', 150),
    ('Bota de segurança (par)', 'material', 'par', 'EPI', 6, 89.00, 'civil', 30),
    ('Óculos de proteção', 'material', 'un', 'EPI', 10, 9.90, 'civil', 50),
    ('Protetor auricular tipo plug', 'material', 'un', 'EPI', 30, 1.90, 'civil', 200),
    ('Cinto paraquedista com talabarte', 'material', 'un', 'EPI', 2, 249.00, 'estrutura', 10),
    ('Betoneira 400 L', 'ferramenta', 'un', 'Equipamentos', 0, null, null, null),
    ('Vibrador de concreto 2 HP', 'ferramenta', 'un', 'Equipamentos', 0, null, null, null),
    ('Vibrador de concreto 1 HP', 'ferramenta', 'un', 'Equipamentos', 0, null, null, null),
    ('Martelete rompedor 10 kg', 'ferramenta', 'un', 'Ferramentas elétricas', 0, null, null, null),
    ('Furadeira de impacto 750 W', 'ferramenta', 'un', 'Ferramentas elétricas', 0, null, null, null),
    ('Furadeira de impacto 650 W', 'ferramenta', 'un', 'Ferramentas elétricas', 0, null, null, null),
    ('Parafusadeira a bateria 12 V', 'ferramenta', 'un', 'Ferramentas elétricas', 0, null, null, null),
    ('Serra circular 7 1/4"', 'ferramenta', 'un', 'Ferramentas elétricas', 0, null, null, null),
    ('Serra circular de bancada', 'ferramenta', 'un', 'Ferramentas elétricas', 0, null, null, null),
    ('Esmerilhadeira 4 1/2"', 'ferramenta', 'un', 'Ferramentas elétricas', 0, null, null, null),
    ('Esmerilhadeira 7"', 'ferramenta', 'un', 'Ferramentas elétricas', 0, null, null, null),
    ('Serra mármore 1300 W', 'ferramenta', 'un', 'Ferramentas elétricas', 0, null, null, null),
    ('Policorte 14"', 'ferramenta', 'un', 'Ferramentas elétricas', 0, null, null, null),
    ('Nível a laser de linhas', 'ferramenta', 'un', 'Medição', 0, null, null, null),
    ('Trena a laser 50 m', 'ferramenta', 'un', 'Medição', 0, null, null, null),
    ('Compactador de solo tipo sapo', 'ferramenta', 'un', 'Equipamentos', 0, null, null, null),
    ('Cortador de piso 90 cm', 'ferramenta', 'un', 'Ferramentas manuais', 0, null, null, null),
    ('Escada extensível 7 m', 'ferramenta', 'un', 'Acesso', 0, null, null, null),
    ('Escada tesoura 2,5 m', 'ferramenta', 'un', 'Acesso', 0, null, null, null),
    ('Carrinho de mão reforçado', 'ferramenta', 'un', 'Ferramentas manuais', 0, null, null, null),
    ('Carrinho de mão reforçado (2)', 'ferramenta', 'un', 'Ferramentas manuais', 0, null, null, null),
    ('Máquina de solda inversora', 'ferramenta', 'un', 'Equipamentos', 0, null, null, null),
    ('Gerador a gasolina 5 kVA', 'ferramenta', 'un', 'Equipamentos', 0, null, null, null),
    ('Lavadora de alta pressão', 'ferramenta', 'un', 'Equipamentos', 0, null, null, null);

  for r in select * from pg_temp._ex_item order by n loop
    insert into public.item_estoque (empresa_id, codigo, nome, tipo, unidade, categoria, estoque_minimo, patrimonio, exemplo)
    values (p_empresa_id,
            case when r.tipo = 'ferramenta' then 'EX-FER-' else 'EX-MAT-' end || lpad(r.n::text, 3, '0'),
            r.nome, r.tipo::public.tipo_item_estoque, r.unidade, r.categoria, coalesce(r.minimo, 0),
            case when r.tipo = 'ferramenta' then 'PAT-EX-' || lpad(r.n::text, 3, '0') end, true)
    returning id into v_id;
    update pg_temp._ex_item set id = v_id where n = r.n;
  end loop;

  -- ------------------------------------------------------------------ o dia a dia, em ordem
  for v_dia in select d::date from generate_series(v_d0, v_hoje - 1, interval '1 day') d loop
    -- Entrega de material a cada 12 dias: o que as tarefas dos próximos 20 dias vão usar.
    if (v_dia - v_d0) % 12 = 1 then
      v_nf := v_nf + 1;
      select jsonb_agg(jsonb_build_object(
               'item_id', i.id,
               'quantidade', greatest(1, round(i.lote * (0.25 + random()::numeric * 0.2))),
               'valor_unitario', round(i.preco * (0.96 + random()::numeric * 0.1), 2)))
        into v_linhas
        from pg_temp._ex_item i
       where i.tipo = 'material'
         and exists (select 1 from pg_temp._ex_tarefa t
                      where t.tipo = 'tarefa' and t.grupo = i.grupo
                        and t.ini_real <= v_dia + 20 and t.fim_real >= v_dia);
      if v_linhas is not null then
        perform public.registrar_entradas(v_proj, v_dia, v_linhas,
          case (v_nf % 3) when 0 then 'Depósito Campinas Materiais (exemplo)'
                          when 1 then 'Aço Forte Distribuidora (exemplo)' else 'Casa do Construtor Taquaral (exemplo)' end,
          null, v_nf::text, null);
      end if;
    end if;

    continue when extract(isodow from v_dia) in (6, 7);  -- obra de segunda a sexta

    -- Saídas para as tarefas em andamento (às terças e quintas).
    if extract(isodow from v_dia) in (2, 4) then
      for r in
        select t.id as tarefa_id, i.id as item_id, sa.quantidade
          from pg_temp._ex_tarefa t
          join pg_temp._ex_item i on i.grupo = t.grupo and i.tipo = 'material'
          join public.saldo_estoque sa on sa.projeto_id = v_proj and sa.item_id = i.id and sa.quantidade > 0
         where t.tipo = 'tarefa' and v_dia between t.ini_real and t.fim_real
           and random()::numeric < 0.18
      loop
        -- O mesmo material pode sair para duas tarefas no mesmo dia: relê o saldo antes de cada saída.
        select quantidade into v_saldo from public.saldo_estoque where projeto_id = v_proj and item_id = r.item_id;
        v_qtd := greatest(1, floor(v_saldo * (0.10 + random()::numeric * 0.2)));
        if v_saldo >= 1 and v_qtd <= v_saldo then
          perform public.registrar_saida(v_proj, r.item_id, v_dia, v_qtd, r.tarefa_id, null, 'Antônio (mestre)', null);
        end if;
      end loop;
    end if;

    -- Chamada: cada pessoa numa tarefa da sua frente de trabalho que está em andamento.
    select jsonb_agg(linha) into v_linhas from (
      select jsonb_build_object(
               'trabalhador_id', pe.id,
               'presente', presente,
               'alocacoes', case when presente then jsonb_build_array(jsonb_build_object('tarefa_id', tarefa, 'horas', 8)) else '[]'::jsonb end
             ) as linha
        from (
          select pe.id, pe.n,
                 random()::numeric > 0.07 as presente,
                 (select t.id from pg_temp._ex_tarefa t
                   where t.tipo = 'tarefa' and v_dia between t.ini_real and t.fim_real
                     and (case pe.grupo when 'propria' then t.grupo in ('civil', 'estrutura', 'acabamento') else t.grupo = pe.grupo end)
                   order by t.ordem
                   offset (pe.n + (v_dia - v_d0)) % greatest(1, (
                     select count(*) from pg_temp._ex_tarefa t2
                      where t2.tipo = 'tarefa' and v_dia between t2.ini_real and t2.fim_real
                        and (case pe.grupo when 'propria' then t2.grupo in ('civil', 'estrutura', 'acabamento') else t2.grupo = pe.grupo end)))
                   limit 1) as tarefa
            from pg_temp._ex_pessoa pe
        ) pe
       where tarefa is not null
    ) x;
    if v_linhas is not null then
      perform public.registrar_chamada(v_proj, v_dia, v_linhas);
    end if;

    -- Diário do dia, com clima, equipe pela chamada e, de vez em quando, uma ocorrência.
    v_pct := random()::numeric;
    v_clima_m := case when v_pct < 0.55 then 'sol' when v_pct < 0.80 then 'nublado' when v_pct < 0.95 then 'chuva' else 'chuva_forte' end;
    v_pct := random()::numeric;
    v_clima_t := case when v_pct < 0.45 then 'sol' when v_pct < 0.75 then 'nublado' when v_pct < 0.93 then 'chuva' else 'chuva_forte' end;
    v_id := public.salvar_diario(v_proj, v_dia, jsonb_build_object(
      'clima_manha', v_clima_m, 'clima_tarde', v_clima_t,
      'praticavel_manha', v_clima_m <> 'chuva_forte', 'praticavel_tarde', v_clima_t <> 'chuva_forte',
      'temp_min', 14 + floor(random()::numeric * 6), 'temp_max', 24 + floor(random()::numeric * 8),
      'chuva_mm', case when v_clima_m in ('chuva', 'chuva_forte') or v_clima_t in ('chuva', 'chuva_forte')
                       then round((2 + random()::numeric * 25)::numeric, 1) end,
      'ocorrencias', case when random()::numeric < 0.12 then (array[
          'Concreteira atrasou 1 h; lançamento terminou às 17h30.',
          'Visita do fiscal da prefeitura; sem pendências.',
          'Falta de energia das 9h às 11h; serra e betoneira paradas.',
          'Entrega de aço conferida e descarregada no pátio.',
          'Chuva forte à tarde: equipe deslocada para serviços internos.',
          'Reunião de segurança (DDS) sobre trabalho em altura.',
          'Cliente visitou a obra e aprovou o apartamento decorado.'])[1 + floor(random()::numeric * 7)::integer] end));
    select coalesce(jsonb_agg(jsonb_build_object('funcao', f.funcao, 'empresa_terceira', f.empreiteira, 'quantidade', f.n)), '[]'::jsonb)
      into v_linhas
      from (select tr.funcao, em.nome as empreiteira, count(distinct a.trabalhador_id) as n
              from public.apontamento_mao_obra a
              join public.trabalhador tr on tr.id = a.trabalhador_id
              left join public.empreiteira em on em.id = tr.empreiteira_id
             where a.projeto_id = v_proj and a.data = v_dia and a.presente
             group by tr.funcao, em.nome
             order by em.nome nulls first, tr.funcao) f;
    if jsonb_array_length(v_linhas) > 0 then
      perform public.definir_efetivo(v_id, v_linhas);
    end if;
  end loop;

  -- Avanço apontado segunda, quarta e sexta (e no dia em que a tarefa terminou), pela execução real.
  for r in select * from pg_temp._ex_tarefa where tipo = 'tarefa' and ini_real < v_hoje loop
    for v_dia in
      select d::date from generate_series(r.ini_real, least(r.fim_real, v_hoje - 1), interval '1 day') d
       where extract(isodow from d) in (1, 3, 5) or d::date = r.fim_real
    loop
      v_pct := least(100, round(100.0 * (v_dia - r.ini_real + 1) / (r.fim_real - r.ini_real + 1)));
      perform public.registrar_avanco(gen_random_uuid(), r.id, v_dia, v_pct, null,
        case when v_pct = 100 then 'Serviço concluído e conferido.' end);
    end loop;
  end loop;

  -- Diários assinados pelo engenheiro, menos os dos últimos 3 dias (ficam como rascunho para revisar).
  for v_id in select id from public.diario_obra where projeto_id = v_proj and data < v_hoje - 3 order by data loop
    perform public.assinar_diario(v_id);
  end loop;

  -- Inventário: quebra de blocos encontrada na contagem.
  select i.id, sa.quantidade into s
    from pg_temp._ex_item i join public.saldo_estoque sa on sa.item_id = i.id and sa.projeto_id = v_proj
   where i.nome = 'Bloco cerâmico 14x19x29';
  if s.id is not null and s.quantidade > 50 then
    perform public.registrar_ajuste(v_proj, s.id, v_hoje - 6, s.quantidade - 42, 'Inventário: blocos quebrados no descarregamento');
  end if;

  -- Consumo forte na última semana: alguns itens ficam abaixo do mínimo e o alerta aparece.
  for r in
    select i.id as item_id, i.minimo, sa.quantidade,
           (select t.id from pg_temp._ex_tarefa t
             where t.tipo = 'tarefa' and t.grupo = i.grupo and t.ini_real <= v_hoje - 1 and t.fim_real >= v_hoje - 7
             order by t.ini_real desc limit 1) as tarefa_id
      from pg_temp._ex_item i
      join public.saldo_estoque sa on sa.item_id = i.id and sa.projeto_id = v_proj
     where i.nome in ('Cimento CP-II-E-32 50 kg', 'Vergalhão CA-50 10,0 mm (barra 12 m)', 'Arame recozido 18',
                      'Argamassa de assentamento 20 kg', 'Caixa de luz 4x2 embutir')
  loop
    v_qtd := r.quantidade - floor(r.minimo * 0.4);
    if r.tarefa_id is not null and v_qtd > 0 then
      perform public.registrar_saida(v_proj, r.item_id, v_hoje - 1, v_qtd, r.tarefa_id, null, 'Antônio (mestre)', null);
    end if;
  end loop;

  -- Ferramentas emprestadas (uma com devolução atrasada).
  for r in
    select i.id as item_id, pe.id as trabalhador_id, k
      from (values (1, 'Furadeira de impacto 750 W', 'Thiago Moraes', 5),
                   (2, 'Nível a laser de linhas', 'Antônio Carlos Ribeiro', -2),
                   (3, 'Serra circular 7 1/4"', 'Adilson Carvalho', 3),
                   (4, 'Vibrador de concreto 2 HP', 'Rogério Cardoso', 1)) as e(k, ferramenta, pessoa, prazo)
      join pg_temp._ex_item i on i.nome = e.ferramenta
      join pg_temp._ex_pessoa pe on pe.nome = e.pessoa
  loop
    perform public.emprestar_ferramenta(v_proj, r.item_id, r.trabalhador_id, null,
      v_hoje + (case r.k when 1 then 5 when 2 then -2 when 3 then 3 else 1 end), null);
  end loop;
  select id into v_id from pg_temp._ex_item where nome = 'Serra circular 7 1/4"';
  perform public.devolver_ferramenta(v_id, 'Devolvida em ordem');

  -- ------------------------------------------------------------------ contratos, pedidos e despesas
  v_ctr_estr := public.salvar_compromisso(null, v_proj, jsonb_build_object(
    'tipo', 'contrato', 'descricao', 'Mão de obra de estrutura (formas e armação), por empreitada',
    'empreiteira_id', v_emp_estr, 'valor', 412000, 'data', v_d0 + 20,
    'tarefa_id', (select id from pg_temp._ex_tarefa where chave = 'E03.1.4')));
  v_ped_conc := public.salvar_compromisso(null, v_proj, jsonb_build_object(
    'tipo', 'pedido', 'descricao', 'Concreto usinado fck 30 MPa bombeado',
    'fornecedor', 'Concreteira Vale do Atibaia (exemplo)', 'valor', 268000, 'data', v_d0 + 30,
    'tarefa_id', (select id from pg_temp._ex_tarefa where chave = 'E03.1.6')));
  v_ctr_ele := public.salvar_compromisso(null, v_proj, jsonb_build_object(
    'tipo', 'contrato', 'descricao', 'Instalações elétricas completas', 'empreiteira_id', v_emp_ele,
    'valor', 182000, 'data', v_d0 + 70, 'tarefa_id', (select id from pg_temp._ex_tarefa where chave = 'E05.1.1')));
  perform public.salvar_compromisso(null, v_proj, jsonb_build_object(
    'tipo', 'pedido', 'descricao', 'Janelas de alumínio linha 25 com vidro', 'fornecedor', 'Esquadrias Campinas (exemplo)',
    'valor', 176000, 'data', v_hoje - 5, 'tarefa_id', (select id from pg_temp._ex_tarefa where chave = 'E09.2')));
  v_id := public.salvar_compromisso(null, v_proj, jsonb_build_object(
    'tipo', 'pedido', 'descricao', 'Estacas hélice contínua (execução)', 'fornecedor', 'Fundações Paulista (exemplo)',
    'valor', 151000, 'data', v_d0 + 10, 'tarefa_id', (select id from pg_temp._ex_tarefa where chave = 'E02.2')));
  perform public.registrar_despesa(v_proj, (select id from pg_temp._ex_tarefa where chave = 'E02.2'), v_d0 + 28, 'servico',
    'Estacas hélice contínua: 860 m executados', 149600, 'Fundações Paulista (exemplo)', 'NFS-e 4411', v_id);
  perform public.encerrar_compromisso(v_id, true);

  for p in 1..3 loop
    perform public.registrar_despesa(v_proj, (select id from pg_temp._ex_tarefa where chave = 'E03.1.4'), v_d0 + 28 * p,
      'servico', 'Medição ' || p || ' da empreitada de estrutura', 58000 + p * 6500, 'Estrutura Forte Empreiteira (exemplo)',
      'NFS-e ' || (2100 + p), v_ctr_estr);
  end loop;
  for r in select * from pg_temp._ex_tarefa where nome like 'Concretagem%' and fim_real < v_hoje order by fim_real loop
    perform public.registrar_despesa(v_proj, r.id, r.fim_real, 'material', 'Concreto usinado: ' || lower(r.nome),
      round(coalesce(r.qtd, 30) * 485, 2), 'Concreteira Vale do Atibaia (exemplo)', 'NF ' || (7000 + r.ordem), v_ped_conc);
  end loop;
  perform public.registrar_despesa(v_proj, (select id from pg_temp._ex_tarefa where chave = 'E05.1.1'), v_hoje - 4, 'servico',
    'Adiantamento do contrato de elétrica', 27300, 'Luz & Cia Instalações Elétricas (exemplo)', 'NFS-e 990', v_ctr_ele);

  for p in 0..2 loop
    perform public.registrar_despesa(v_proj, (select id from pg_temp._ex_tarefa where chave = 'E01.1'), v_d0 + 30 * p + 5,
      'equipamento', 'Aluguel de andaimes e escoras (mês ' || (p + 1) || ')', 7800, 'Locadora Andaimes SP (exemplo)', null, null);
    perform public.registrar_despesa(v_proj, (select id from pg_temp._ex_tarefa where chave = 'E01.1'), v_d0 + 30 * p + 10,
      'administracao', 'Energia, água e internet do canteiro (mês ' || (p + 1) || ')', 1450 + p * 120, null, null, null);
    perform public.registrar_despesa(v_proj, (select id from pg_temp._ex_tarefa where chave = 'E01.1'), v_d0 + 30 * p + 15,
      'servico', 'Caçambas de entulho (mês ' || (p + 1) || ')', 2250, 'Caçambas Taquaral (exemplo)', null, null);
  end loop;
  perform public.registrar_despesa(v_proj, (select id from pg_temp._ex_tarefa where chave = 'E01.1'), v_d0 + 2, 'taxa',
    'ART de execução e alvará', 1980, 'CREA-SP / Prefeitura', null, null);
  perform public.registrar_despesa(v_proj, (select id from pg_temp._ex_tarefa where chave = 'E02.1'), v_d0 + 18, 'equipamento',
    'Escavadeira e caminhões para bota-fora', 33800, 'Terraplenagem Campinas (exemplo)', 'NFS-e 318', null);

  perform set_config('app.criando_exemplo', '', true);  -- a marca só vale dentro desta função
  return v_proj;
end;
$$;
revoke all on function app.criar_obra_exemplo_base(uuid) from public, anon, authenticated;

create or replace function public.criar_obra_exemplo(p_empresa_id uuid)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_proj  uuid := app.criar_obra_exemplo_base(p_empresa_id);
  v_real  date := (now() at time zone 'America/Sao_Paulo')::date;
  v_hoje  date := coalesce(nullif(current_setting('app.exemplo_hoje', true), '')::date, v_real);
  v_d0    date;
  v_ctr   uuid;
  v_med   uuid;
  v_emp   uuid;
  k       integer;
begin
  select data_inicio into v_d0 from public.projeto where id = v_proj;
  v_ctr := public.salvar_contrato_medicao(null, v_proj, jsonb_build_object(
    'parte', 'cliente', 'nome', 'Incorporadora Acácias SPE Ltda. (exemplo)', 'bdi_pct', 24, 'retencao_pct', 5,
    'prazo_pagamento_dias', 15));
  -- Boletins mensais: os dois primeiros aprovados (o primeiro já pago); o do mês corrente fica em rascunho.
  for k in 1..2 loop
    v_med := public.gerar_medicao(v_ctr, v_d0 + 30 * k - 1);
    perform public.aprovar_medicao(v_med);
    if k = 1 then
      perform public.registrar_pagamento_medicao(v_med, v_real);
    end if;
  end loop;
  perform public.gerar_medicao(v_ctr, v_hoje - 1);

  -- Empreitada de estrutura medida pela mão de obra das tarefas de estrutura.
  select id into v_emp from public.empreiteira where empresa_id = p_empresa_id and exemplo and nome like 'Estrutura Forte%';
  v_ctr := public.salvar_contrato_medicao(null, v_proj, jsonb_build_object(
    'parte', 'empreiteiro', 'nome', 'Empreitada de estrutura (formas e armação)', 'empreiteira_id', v_emp,
    'retencao_pct', 5, 'prazo_pagamento_dias', 7, 'base', 'mao_obra',
    'tarefas', (select jsonb_agg(t.id) from public.eap_item t join public.eap_item e on e.id = t.pai_id
                 join public.eap_item g on g.id = e.pai_id
                where t.projeto_id = v_proj and t.tipo = 'tarefa' and g.nome = 'Estrutura')));
  v_med := public.gerar_medicao(v_ctr, v_hoje - 1);
  perform public.aprovar_medicao(v_med);
  return v_proj;
end;
$$;
revoke all on function public.criar_obra_exemplo(uuid) from public, anon;
grant execute on function public.criar_obra_exemplo(uuid) to authenticated;

-- Apagar o exemplo: a empreiteira de exemplo também fica se um contrato de medição de obra real a usa.
create or replace function public.excluir_obra_exemplo(p_empresa_id uuid)
returns integer language plpgsql security definer set search_path = '' as $$
declare
  v_n integer;
begin
  if not coalesce(app.e_admin_empresa(p_empresa_id), false) then
    raise exception 'Só o admin da empresa apaga a obra de exemplo' using errcode = '42501';
  end if;

  delete from public.projeto where empresa_id = p_empresa_id and exemplo;
  get diagnostics v_n = row_count;

  delete from public.trabalhador t
   where t.empresa_id = p_empresa_id and t.exemplo
     and not exists (select 1 from public.equipe_projeto e where e.trabalhador_id = t.id)
     and not exists (select 1 from public.apontamento_mao_obra a where a.trabalhador_id = t.id)
     and not exists (select 1 from public.movimento_estoque m where m.trabalhador_id = t.id)
     and not exists (select 1 from public.emprestimo_ferramenta f where f.trabalhador_id = t.id);
  delete from public.item_estoque i
   where i.empresa_id = p_empresa_id and i.exemplo
     and not exists (select 1 from public.saldo_estoque s where s.item_id = i.id)
     and not exists (select 1 from public.movimento_estoque m where m.item_id = i.id)
     and not exists (select 1 from public.emprestimo_ferramenta f where f.item_id = i.id);
  delete from public.empreiteira em
   where em.empresa_id = p_empresa_id and em.exemplo
     and not exists (select 1 from public.trabalhador t where t.empreiteira_id = em.id)
     and not exists (select 1 from public.compromisso c where c.empreiteira_id = em.id)
     and not exists (select 1 from public.contrato_medicao cm where cm.empreiteira_id = em.id);
  return v_n;
end;
$$;
