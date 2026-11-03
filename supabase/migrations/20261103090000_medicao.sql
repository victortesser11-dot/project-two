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

create or replace function public.criar_obra_exemplo(p_empresa_id uuid)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_proj  uuid := app.criar_obra_exemplo_base(p_empresa_id);
  v_hoje  date := (now() at time zone 'America/Sao_Paulo')::date;
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
      perform public.registrar_pagamento_medicao(v_med, v_hoje);
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
