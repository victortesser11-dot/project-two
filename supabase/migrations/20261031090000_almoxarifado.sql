-- =============================================================================
-- Sprint 4 — RF-401 a 404: almoxarifado (materiais e ferramentas) + entrada por
-- XML da NF-e.
--
-- * Catálogo da empresa (item_estoque): materiais (com unidade e estoque
--   mínimo) e ferramentas (cada uma é um patrimônio, com QR). Código automático
--   MAT-0001 / FER-0001 quando não informado.
-- * Saldo e custo médio por obra (saldo_estoque) só mudam pelas funções
--   (regra 3): registrar_entradas (uma ou várias linhas, ex.: uma NF-e inteira,
--   tudo ou nada), registrar_saida (sempre para uma tarefa; saldo negativo é
--   recusado) e registrar_ajuste (inventário, com motivo).
-- * Movimentos são imutáveis: correção é um ajuste. O valor de cada movimento
--   é calculado no banco (entrada = preço da nota; saída e ajuste = custo médio).
-- * Mesma chave de NF-e não entra duas vezes na empresa.
-- * item_fornecedor lembra "código do fornecedor → item do catálogo" para a
--   próxima nota do mesmo CNPJ já vir casada.
-- * Ferramentas: emprestar e devolver; uma ferramenta tem no máximo um
--   empréstimo aberto.
-- * Quem movimenta: engenheiro e almoxarife da obra (admin conta como
--   engenheiro). Quem cadastra itens: admin, engenheiro ou almoxarife de
--   alguma obra da empresa.
-- =============================================================================

create type public.tipo_item_estoque as enum ('material', 'ferramenta');
create type public.tipo_movimento_estoque as enum ('entrada', 'saida', 'ajuste');

-- -----------------------------------------------------------------------------
-- Permissões
-- -----------------------------------------------------------------------------
create or replace function app.pode_gerir_estoque(p_empresa uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select coalesce(app.e_admin_empresa(p_empresa) or exists (
    select 1 from public.membro_projeto mp
      join public.projeto p on p.id = mp.projeto_id
     where p.empresa_id = p_empresa and mp.usuario_id = auth.uid() and mp.papel in ('engenheiro', 'almoxarife')), false);
$$;

create or replace function app.pode_movimentar_estoque(p_projeto uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select coalesce(app.papel_no_projeto(p_projeto) in ('engenheiro', 'almoxarife'), false);
$$;

revoke all on function app.pode_gerir_estoque(uuid), app.pode_movimentar_estoque(uuid) from public;
grant execute on function app.pode_gerir_estoque(uuid), app.pode_movimentar_estoque(uuid) to authenticated;

-- -----------------------------------------------------------------------------
-- Catálogo
-- -----------------------------------------------------------------------------
create table public.item_estoque (
  id              uuid primary key default gen_random_uuid(),
  empresa_id      uuid not null references public.empresa(id) on delete cascade,
  codigo          text not null check (length(btrim(codigo)) between 1 and 30),
  nome            text not null check (length(btrim(nome)) between 2 and 200),
  tipo            public.tipo_item_estoque not null,
  unidade         text not null check (length(btrim(unidade)) between 1 and 20),
  categoria       text check (categoria is null or length(categoria) <= 80),
  estoque_minimo  numeric(16, 4) not null default 0 check (estoque_minimo >= 0),
  patrimonio      text check (patrimonio is null or length(patrimonio) <= 40),
  ncm             text check (ncm is null or ncm ~ '^\d{8}$'),
  ativo           boolean not null default true,
  criado_em       timestamptz not null default now(),
  atualizado_em   timestamptz not null default now(),
  constraint item_estoque_codigo_uk unique (empresa_id, codigo),
  constraint item_estoque_ferramenta_ck check (tipo = 'material' or (unidade = 'un' and estoque_minimo = 0))
);
create index item_estoque_empresa_idx on public.item_estoque (empresa_id, tipo, nome);

-- Código automático por empresa e tipo (MAT-0001, FER-0001) quando vier vazio.
create or replace function app.tg_item_estoque_codigo()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  v_prefixo text := case when new.tipo = 'ferramenta' then 'FER-' else 'MAT-' end;
  v_n       integer;
begin
  if new.tipo = 'ferramenta' then
    new.unidade := 'un';
    new.estoque_minimo := 0;
  end if;
  if tg_op = 'UPDATE' and new.tipo <> old.tipo then
    raise exception 'Um item não muda de material para ferramenta (ou o contrário). Cadastre outro.';
  end if;
  if tg_op = 'UPDATE' and new.empresa_id <> old.empresa_id then
    raise exception 'Um item não muda de empresa';
  end if;
  if tg_op = 'INSERT' and (new.codigo is null or btrim(new.codigo) = '') then
    perform pg_advisory_xact_lock(hashtext('item_estoque_codigo:' || new.empresa_id::text || v_prefixo));
    select coalesce(max(substr(codigo, 5)::integer), 0) + 1 into v_n
      from public.item_estoque
     where empresa_id = new.empresa_id and codigo ~ ('^' || v_prefixo || '\d+$');
    new.codigo := v_prefixo || lpad(v_n::text, 4, '0');
  end if;
  return new;
end;
$$;
create trigger item_estoque_codigo before insert or update on public.item_estoque
  for each row execute function app.tg_item_estoque_codigo();
create trigger item_estoque_atualizado_em before update on public.item_estoque
  for each row execute function app.tg_atualizado_em();
create trigger item_estoque_auditoria after insert or update or delete on public.item_estoque
  for each row execute function app.tg_auditoria('atualizado_em');

-- Código do item no fornecedor (da NF-e) → item do catálogo.
create table public.item_fornecedor (
  empresa_id         uuid not null references public.empresa(id) on delete cascade,
  cnpj_fornecedor    text not null check (cnpj_fornecedor ~ '^\d{14}$'),
  codigo_fornecedor  text not null check (length(codigo_fornecedor) between 1 and 60),
  item_id            uuid not null references public.item_estoque(id) on delete cascade,
  atualizado_em      timestamptz not null default now(),
  primary key (empresa_id, cnpj_fornecedor, codigo_fornecedor)
);
create index item_fornecedor_item_idx on public.item_fornecedor (item_id);

-- -----------------------------------------------------------------------------
-- Saldo, movimentos e empréstimos
-- -----------------------------------------------------------------------------
create table public.saldo_estoque (
  id             uuid not null default gen_random_uuid() unique,  -- só para o audit_log
  projeto_id     uuid not null references public.projeto(id) on delete cascade,
  item_id        uuid not null references public.item_estoque(id) on delete cascade,
  empresa_id     uuid not null references public.empresa(id) on delete cascade,
  quantidade     numeric(16, 4) not null default 0 check (quantidade >= 0),
  custo_medio    numeric(16, 4) not null default 0 check (custo_medio >= 0),
  atualizado_em  timestamptz not null default now(),
  primary key (projeto_id, item_id)
);
create index saldo_estoque_item_idx on public.saldo_estoque (item_id);
create index saldo_estoque_empresa_idx on public.saldo_estoque (empresa_id);

create trigger saldo_estoque_auditoria after insert or update or delete on public.saldo_estoque
  for each row execute function app.tg_auditoria('atualizado_em');

create table public.movimento_estoque (
  id                uuid primary key default gen_random_uuid(),
  empresa_id        uuid not null references public.empresa(id) on delete cascade,
  projeto_id        uuid not null references public.projeto(id) on delete cascade,
  item_id           uuid not null references public.item_estoque(id) on delete cascade,
  tipo              public.tipo_movimento_estoque not null,
  data              date not null,
  -- entrada e saída: positiva; ajuste: diferença (positiva ou negativa)
  quantidade        numeric(16, 4) not null check (quantidade <> 0),
  valor_unitario    numeric(16, 4) not null check (valor_unitario >= 0),
  valor_total       numeric(16, 2) generated always as (round(abs(quantidade) * valor_unitario, 2)) stored,
  fornecedor        text check (fornecedor is null or length(fornecedor) <= 160),
  cnpj_fornecedor   text check (cnpj_fornecedor is null or cnpj_fornecedor ~ '^\d{14}$'),
  nota_fiscal       text check (nota_fiscal is null or length(nota_fiscal) <= 40),
  chave_nfe         text check (chave_nfe is null or chave_nfe ~ '^\d{44}$'),
  tarefa_id         uuid references public.eap_item(id) on delete set null,
  trabalhador_id    uuid references public.trabalhador(id) on delete set null,
  responsavel       text check (responsavel is null or length(responsavel) <= 160),
  observacao        text check (observacao is null or length(observacao) <= 500),
  registrado_por    uuid references auth.users(id) on delete set null,
  registrado_em     timestamptz not null default now(),
  constraint movimento_estoque_sinal_ck check (tipo = 'ajuste' or quantidade > 0)
);
create index movimento_estoque_projeto_idx on public.movimento_estoque (projeto_id, data desc);
create index movimento_estoque_item_idx on public.movimento_estoque (item_id, data desc);
create index movimento_estoque_tarefa_idx on public.movimento_estoque (tarefa_id);
create index movimento_estoque_chave_idx on public.movimento_estoque (empresa_id, chave_nfe) where chave_nfe is not null;
create index movimento_estoque_empresa_idx on public.movimento_estoque (empresa_id);
create index movimento_estoque_trabalhador_idx on public.movimento_estoque (trabalhador_id);
create index movimento_estoque_registrado_por_idx on public.movimento_estoque (registrado_por);

create trigger movimento_estoque_auditoria after insert or update or delete on public.movimento_estoque
  for each row execute function app.tg_auditoria();

create table public.emprestimo_ferramenta (
  id              uuid primary key default gen_random_uuid(),
  empresa_id      uuid not null references public.empresa(id) on delete cascade,
  projeto_id      uuid not null references public.projeto(id) on delete cascade,
  item_id         uuid not null references public.item_estoque(id) on delete cascade,
  trabalhador_id  uuid references public.trabalhador(id) on delete set null,
  responsavel     text not null check (length(btrim(responsavel)) between 2 and 160),
  retirada_em     timestamptz not null default now(),
  devolver_ate    date,
  devolvida_em    timestamptz,
  retirado_por    uuid references auth.users(id) on delete set null,
  devolvido_por   uuid references auth.users(id) on delete set null,
  observacao      text check (observacao is null or length(observacao) <= 500)
);
-- No máximo um empréstimo aberto por ferramenta.
create unique index emprestimo_ferramenta_aberto_uk on public.emprestimo_ferramenta (item_id) where devolvida_em is null;
create index emprestimo_ferramenta_projeto_idx on public.emprestimo_ferramenta (projeto_id, devolvida_em);
create index emprestimo_ferramenta_empresa_idx on public.emprestimo_ferramenta (empresa_id);
create index emprestimo_ferramenta_trabalhador_idx on public.emprestimo_ferramenta (trabalhador_id);
create index emprestimo_ferramenta_retirado_por_idx on public.emprestimo_ferramenta (retirado_por);
create index emprestimo_ferramenta_devolvido_por_idx on public.emprestimo_ferramenta (devolvido_por);

create trigger emprestimo_ferramenta_auditoria after insert or update or delete on public.emprestimo_ferramenta
  for each row execute function app.tg_auditoria();

-- -----------------------------------------------------------------------------
-- RLS e grants
-- -----------------------------------------------------------------------------
alter table public.item_estoque          enable row level security;
alter table public.item_fornecedor       enable row level security;
alter table public.saldo_estoque         enable row level security;
alter table public.movimento_estoque     enable row level security;
alter table public.emprestimo_ferramenta enable row level security;

create policy item_estoque_select on public.item_estoque for select to authenticated
  using (app.e_membro_empresa(empresa_id));
create policy item_estoque_insert on public.item_estoque for insert to authenticated
  with check (app.pode_gerir_estoque(empresa_id));
create policy item_estoque_update on public.item_estoque for update to authenticated
  using (app.pode_gerir_estoque(empresa_id)) with check (app.pode_gerir_estoque(empresa_id));

create policy item_fornecedor_select on public.item_fornecedor for select to authenticated
  using (app.e_membro_empresa(empresa_id));
create policy saldo_estoque_select on public.saldo_estoque for select to authenticated
  using (app.pode_ver_projeto(projeto_id));
create policy movimento_estoque_select on public.movimento_estoque for select to authenticated
  using (app.pode_ver_projeto(projeto_id));
create policy emprestimo_ferramenta_select on public.emprestimo_ferramenta for select to authenticated
  using (app.pode_ver_projeto(projeto_id));

revoke all on public.item_estoque, public.item_fornecedor, public.saldo_estoque, public.movimento_estoque,
  public.emprestimo_ferramenta from anon, authenticated;
grant select, insert, update on public.item_estoque to authenticated;
grant select on public.item_fornecedor, public.saldo_estoque, public.movimento_estoque, public.emprestimo_ferramenta to authenticated;

-- -----------------------------------------------------------------------------
-- Funções de escrita
-- -----------------------------------------------------------------------------

-- Validações comuns de um movimento na obra; devolve a empresa do projeto.
create or replace function app.checar_movimento(p_projeto_id uuid, p_data date)
returns uuid language plpgsql stable security definer set search_path = '' as $$
declare
  v_hoje date := (now() at time zone 'America/Sao_Paulo')::date;
begin
  if not app.pode_movimentar_estoque(p_projeto_id) then
    raise exception 'Sem permissão para movimentar o almoxarifado desta obra' using errcode = '42501';
  end if;
  if p_data is null or p_data > v_hoje then
    raise exception 'O movimento não pode ser de um dia futuro';
  end if;
  return (select empresa_id from public.projeto where id = p_projeto_id);
end;
$$;

-- Entrada de uma ou várias linhas (ex.: NF-e inteira), tudo ou nada.
-- p_itens: [{item_id, quantidade, valor_unitario, codigo_fornecedor}]. Devolve quantas linhas entraram.
create or replace function public.registrar_entradas(
  p_projeto_id      uuid,
  p_data            date,
  p_itens           jsonb,
  p_fornecedor      text default null,
  p_cnpj_fornecedor text default null,
  p_nota_fiscal     text default null,
  p_chave_nfe       text default null
)
returns integer language plpgsql security definer set search_path = '' as $$
declare
  v_empresa  uuid;
  l          jsonb;
  v_item     public.item_estoque;
  v_q        numeric;
  v_vu       numeric;
  v_saldo    public.saldo_estoque;
  v_quando   date;
  v_cnpj     text := nullif(regexp_replace(coalesce(p_cnpj_fornecedor, ''), '\D', '', 'g'), '');
  v_chave    text := nullif(regexp_replace(coalesce(p_chave_nfe, ''), '\D', '', 'g'), '');
begin
  v_empresa := app.checar_movimento(p_projeto_id, p_data);
  if p_itens is null or jsonb_typeof(p_itens) <> 'array' or jsonb_array_length(p_itens) = 0 then
    raise exception 'Nenhum item na entrada';
  end if;
  if jsonb_array_length(p_itens) > 500 then
    raise exception 'A entrada aceita até 500 linhas por vez';
  end if;
  if v_chave is not null then
    -- Duas pessoas lançando a mesma nota ao mesmo tempo: a segunda espera e é recusada.
    perform pg_advisory_xact_lock(hashtext('nfe:' || v_empresa::text || v_chave));
    select m.data into v_quando from public.movimento_estoque m
     where m.empresa_id = v_empresa and m.chave_nfe = v_chave and m.tipo = 'entrada' limit 1;
    if found then
      raise exception 'Esta NF-e já foi lançada (entrada de %)', to_char(v_quando, 'DD/MM/YYYY');
    end if;
  end if;

  for l in select * from jsonb_array_elements(p_itens) loop
    select * into v_item from public.item_estoque where id = (l ->> 'item_id')::uuid and empresa_id = v_empresa;
    if v_item.id is null then
      raise exception 'Item não encontrado no catálogo da empresa';
    end if;
    if v_item.tipo <> 'material' then
      raise exception 'Ferramentas entram pelo cadastro de patrimônio, não por entrada de estoque (%)', v_item.nome;
    end if;
    v_q  := (l ->> 'quantidade')::numeric;
    v_vu := coalesce((l ->> 'valor_unitario')::numeric, 0);
    if v_q is null or v_q <= 0 then
      raise exception 'Quantidade precisa ser maior que zero (%)', v_item.nome;
    end if;
    if v_vu < 0 then
      raise exception 'Valor não pode ser negativo (%)', v_item.nome;
    end if;

    insert into public.saldo_estoque (projeto_id, item_id, empresa_id) values (p_projeto_id, v_item.id, v_empresa)
    on conflict (projeto_id, item_id) do nothing;
    select * into v_saldo from public.saldo_estoque where projeto_id = p_projeto_id and item_id = v_item.id for update;

    update public.saldo_estoque
       set custo_medio = round((v_saldo.quantidade * v_saldo.custo_medio + v_q * v_vu) / (v_saldo.quantidade + v_q), 4),
           quantidade = v_saldo.quantidade + v_q,
           atualizado_em = now()
     where projeto_id = p_projeto_id and item_id = v_item.id;

    insert into public.movimento_estoque (empresa_id, projeto_id, item_id, tipo, data, quantidade, valor_unitario,
                                          fornecedor, cnpj_fornecedor, nota_fiscal, chave_nfe, registrado_por)
    values (v_empresa, p_projeto_id, v_item.id, 'entrada', p_data, v_q, v_vu,
            nullif(btrim(p_fornecedor), ''), v_cnpj, nullif(btrim(p_nota_fiscal), ''), v_chave, auth.uid());

    if v_cnpj is not null and nullif(btrim(l ->> 'codigo_fornecedor'), '') is not null then
      insert into public.item_fornecedor (empresa_id, cnpj_fornecedor, codigo_fornecedor, item_id)
      values (v_empresa, v_cnpj, btrim(l ->> 'codigo_fornecedor'), v_item.id)
      on conflict (empresa_id, cnpj_fornecedor, codigo_fornecedor) do update set item_id = excluded.item_id, atualizado_em = now();
    end if;
  end loop;

  return jsonb_array_length(p_itens);
end;
$$;

-- Saída sempre para uma tarefa da obra; saldo negativo é recusado. Devolve o saldo restante.
create or replace function public.registrar_saida(
  p_projeto_id     uuid,
  p_item_id        uuid,
  p_data           date,
  p_quantidade     numeric,
  p_tarefa_id      uuid,
  p_trabalhador_id uuid default null,
  p_responsavel    text default null,
  p_observacao     text default null
)
returns numeric language plpgsql security definer set search_path = '' as $$
declare
  v_empresa uuid;
  v_item    public.item_estoque;
  v_saldo   public.saldo_estoque;
begin
  v_empresa := app.checar_movimento(p_projeto_id, p_data);
  select * into v_item from public.item_estoque where id = p_item_id and empresa_id = v_empresa;
  if v_item.id is null or v_item.tipo <> 'material' then
    raise exception 'Material não encontrado no catálogo';
  end if;
  if p_quantidade is null or p_quantidade <= 0 then
    raise exception 'Quantidade precisa ser maior que zero';
  end if;
  if p_tarefa_id is null or not exists (
       select 1 from public.eap_item where id = p_tarefa_id and projeto_id = p_projeto_id and tipo = 'tarefa') then
    raise exception 'Saída sem tarefa não é permitida: escolha a tarefa desta obra que vai usar o material';
  end if;
  if p_trabalhador_id is not null and not exists (
       select 1 from public.trabalhador where id = p_trabalhador_id and empresa_id = v_empresa) then
    raise exception 'Pessoa não encontrada nesta empresa';
  end if;

  select * into v_saldo from public.saldo_estoque where projeto_id = p_projeto_id and item_id = p_item_id for update;
  if v_saldo.projeto_id is null or v_saldo.quantidade < p_quantidade then
    raise exception 'Saldo insuficiente de %: há % % na obra', v_item.nome,
      replace(trim_scale(coalesce(v_saldo.quantidade, 0))::text, '.', ','), v_item.unidade;
  end if;

  update public.saldo_estoque set quantidade = v_saldo.quantidade - p_quantidade, atualizado_em = now()
   where projeto_id = p_projeto_id and item_id = p_item_id;

  insert into public.movimento_estoque (empresa_id, projeto_id, item_id, tipo, data, quantidade, valor_unitario,
                                        tarefa_id, trabalhador_id, responsavel, observacao, registrado_por)
  values (v_empresa, p_projeto_id, p_item_id, 'saida', p_data, p_quantidade, v_saldo.custo_medio,
          p_tarefa_id, p_trabalhador_id, nullif(btrim(p_responsavel), ''), nullif(btrim(p_observacao), ''), auth.uid());

  return v_saldo.quantidade - p_quantidade;
end;
$$;

-- Inventário: acerta o saldo para a quantidade contada, com motivo. Devolve a diferença.
create or replace function public.registrar_ajuste(
  p_projeto_id        uuid,
  p_item_id           uuid,
  p_data              date,
  p_quantidade_contada numeric,
  p_motivo            text
)
returns numeric language plpgsql security definer set search_path = '' as $$
declare
  v_empresa uuid;
  v_item    public.item_estoque;
  v_saldo   public.saldo_estoque;
  v_dif     numeric;
begin
  v_empresa := app.checar_movimento(p_projeto_id, p_data);
  select * into v_item from public.item_estoque where id = p_item_id and empresa_id = v_empresa;
  if v_item.id is null or v_item.tipo <> 'material' then
    raise exception 'Material não encontrado no catálogo';
  end if;
  if p_quantidade_contada is null or p_quantidade_contada < 0 then
    raise exception 'Informe a quantidade contada (zero ou mais)';
  end if;
  if nullif(btrim(p_motivo), '') is null then
    raise exception 'Informe o motivo do ajuste (ex.: inventário, perda, quebra)';
  end if;

  insert into public.saldo_estoque (projeto_id, item_id, empresa_id) values (p_projeto_id, p_item_id, v_empresa)
  on conflict (projeto_id, item_id) do nothing;
  select * into v_saldo from public.saldo_estoque where projeto_id = p_projeto_id and item_id = p_item_id for update;
  v_dif := p_quantidade_contada - v_saldo.quantidade;
  if v_dif = 0 then
    return 0;
  end if;

  update public.saldo_estoque set quantidade = p_quantidade_contada, atualizado_em = now()
   where projeto_id = p_projeto_id and item_id = p_item_id;
  insert into public.movimento_estoque (empresa_id, projeto_id, item_id, tipo, data, quantidade, valor_unitario, observacao, registrado_por)
  values (v_empresa, p_projeto_id, p_item_id, 'ajuste', p_data, v_dif, v_saldo.custo_medio, btrim(p_motivo), auth.uid());
  return v_dif;
end;
$$;

-- Empresta uma ferramenta (pessoa da equipe ou nome livre). Devolve o id do empréstimo.
create or replace function public.emprestar_ferramenta(
  p_projeto_id     uuid,
  p_item_id        uuid,
  p_trabalhador_id uuid default null,
  p_responsavel    text default null,
  p_devolver_ate   date default null,
  p_observacao     text default null
)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_empresa uuid := app.checar_movimento(p_projeto_id, (now() at time zone 'America/Sao_Paulo')::date);
  v_item    public.item_estoque;
  v_nome    text;
  v_aberto  record;
  v_id      uuid;
begin
  select * into v_item from public.item_estoque where id = p_item_id and empresa_id = v_empresa;
  if v_item.id is null or v_item.tipo <> 'ferramenta' then
    raise exception 'Ferramenta não encontrada no catálogo';
  end if;
  if not v_item.ativo then
    raise exception 'Esta ferramenta está inativa (baixada do patrimônio)';
  end if;
  select e.responsavel, e.retirada_em into v_aberto from public.emprestimo_ferramenta e
   where e.item_id = p_item_id and e.devolvida_em is null;
  if found then
    raise exception 'Esta ferramenta já está com % desde %', v_aberto.responsavel,
      to_char(v_aberto.retirada_em at time zone 'America/Sao_Paulo', 'DD/MM/YYYY');
  end if;
  if p_trabalhador_id is not null then
    select nome into v_nome from public.trabalhador where id = p_trabalhador_id and empresa_id = v_empresa;
    if v_nome is null then
      raise exception 'Pessoa não encontrada nesta empresa';
    end if;
  end if;
  v_nome := coalesce(nullif(btrim(p_responsavel), ''), v_nome);
  if v_nome is null then
    raise exception 'Informe com quem a ferramenta vai ficar';
  end if;

  insert into public.emprestimo_ferramenta (empresa_id, projeto_id, item_id, trabalhador_id, responsavel, devolver_ate, observacao, retirado_por)
  values (v_empresa, p_projeto_id, p_item_id, p_trabalhador_id, v_nome, p_devolver_ate, nullif(btrim(p_observacao), ''), auth.uid())
  returning id into v_id;
  return v_id;
end;
$$;

-- Devolve a ferramenta (fecha o empréstimo aberto). Devolve quantos dias ela ficou fora.
create or replace function public.devolver_ferramenta(p_item_id uuid, p_observacao text default null)
returns integer language plpgsql security definer set search_path = '' as $$
declare
  v public.emprestimo_ferramenta;
begin
  select * into v from public.emprestimo_ferramenta where item_id = p_item_id and devolvida_em is null;
  if v.id is null then
    raise exception 'Esta ferramenta não está emprestada';
  end if;
  if not app.pode_movimentar_estoque(v.projeto_id) then
    raise exception 'Sem permissão para receber ferramentas desta obra' using errcode = '42501';
  end if;
  update public.emprestimo_ferramenta
     set devolvida_em = now(), devolvido_por = auth.uid(),
         observacao = coalesce(nullif(btrim(p_observacao), ''), observacao)
   where id = v.id;
  return ((now() at time zone 'America/Sao_Paulo')::date - (v.retirada_em at time zone 'America/Sao_Paulo')::date);
end;
$$;

revoke all on function app.checar_movimento(uuid, date) from public, anon, authenticated;

revoke all on function
  public.registrar_entradas(uuid, date, jsonb, text, text, text, text),
  public.registrar_saida(uuid, uuid, date, numeric, uuid, uuid, text, text),
  public.registrar_ajuste(uuid, uuid, date, numeric, text),
  public.emprestar_ferramenta(uuid, uuid, uuid, text, date, text),
  public.devolver_ferramenta(uuid, text)
from public, anon;
grant execute on function
  public.registrar_entradas(uuid, date, jsonb, text, text, text, text),
  public.registrar_saida(uuid, uuid, date, numeric, uuid, uuid, text, text),
  public.registrar_ajuste(uuid, uuid, date, numeric, text),
  public.emprestar_ferramenta(uuid, uuid, uuid, text, date, text),
  public.devolver_ferramenta(uuid, text)
to authenticated;
