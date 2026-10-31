-- =============================================================================
-- Sprint 2 — RF-203: diário de obra (clima, equipe, ocorrências e fotos).
--
-- * Um diário por obra e por dia. Engenheiro e mestre preenchem enquanto está
--   em rascunho; só o engenheiro assina.
-- * Assinar grava um retrato do conteúdo (inclui os avanços apontados no dia)
--   e a impressão digital SHA-256 dele. Depois de assinado o diário não muda:
--   correção vira ocorrência no diário seguinte, como no papel.
-- * Equipe é lançada à mão até a chamada diária (RF-302) existir.
-- * Fotos ficam no bucket privado "diario", no caminho
--   <projeto_id>/<diario_id>/<arquivo>. As políticas do Storage leem o projeto
--   do caminho; foto de diário assinado não é apagada.
-- * Localização da obra (latitude/longitude) para o clima automático.
-- =============================================================================

alter table public.projeto
  add column latitude  numeric(9, 6) check (latitude is null or latitude between -90 and 90),
  add column longitude numeric(9, 6) check (longitude is null or longitude between -180 and 180),
  add constraint projeto_coordenadas_ck check ((latitude is null) = (longitude is null));

create type public.clima_periodo as enum ('sol', 'nublado', 'chuva', 'chuva_forte');
create type public.status_diario as enum ('rascunho', 'assinado');

-- -----------------------------------------------------------------------------
-- Tabelas
-- -----------------------------------------------------------------------------
create table public.diario_obra (
  id                 uuid primary key default gen_random_uuid(),
  empresa_id         uuid not null references public.empresa(id) on delete cascade,
  projeto_id         uuid not null references public.projeto(id) on delete cascade,
  data               date not null,
  clima_manha        public.clima_periodo,
  clima_tarde        public.clima_periodo,
  praticavel_manha   boolean not null default true,
  praticavel_tarde   boolean not null default true,
  temp_min           numeric(4, 1) check (temp_min is null or temp_min between -20 and 55),
  temp_max           numeric(4, 1) check (temp_max is null or temp_max between -20 and 55),
  chuva_mm           numeric(6, 1) check (chuva_mm is null or chuva_mm between 0 and 1000),
  clima_automatico   boolean not null default false,
  ocorrencias        text check (ocorrencias is null or length(ocorrencias) <= 4000),
  observacoes        text check (observacoes is null or length(observacoes) <= 4000),
  status             public.status_diario not null default 'rascunho',
  assinado_por       uuid references auth.users(id) on delete set null,
  assinado_nome      text,
  assinado_em        timestamptz,
  conteudo_assinado  jsonb,
  hash_conteudo      text check (hash_conteudo is null or hash_conteudo ~ '^[0-9a-f]{64}$'),
  criado_por         uuid references auth.users(id) on delete set null,
  criado_em          timestamptz not null default now(),
  atualizado_em      timestamptz not null default now(),
  constraint diario_obra_dia_uk unique (projeto_id, data),
  constraint diario_obra_temperaturas_ck check (temp_min is null or temp_max is null or temp_max >= temp_min),
  constraint diario_obra_assinatura_ck check (
    status = 'rascunho' or (assinado_em is not null and hash_conteudo is not null and conteudo_assinado is not null))
);
create index diario_obra_empresa_idx on public.diario_obra (empresa_id);
create index diario_obra_assinado_por_idx on public.diario_obra (assinado_por);
create index diario_obra_criado_por_idx on public.diario_obra (criado_por);

create table public.diario_efetivo (
  id                uuid primary key default gen_random_uuid(),
  empresa_id        uuid not null references public.empresa(id) on delete cascade,
  projeto_id        uuid not null references public.projeto(id) on delete cascade,
  diario_id         uuid not null references public.diario_obra(id) on delete cascade,
  ordem             integer not null check (ordem >= 1),
  funcao            text not null check (length(btrim(funcao)) between 1 and 80),
  empresa_terceira  text check (empresa_terceira is null or length(empresa_terceira) <= 120),
  quantidade        integer not null check (quantidade between 1 and 999)
);
create index diario_efetivo_diario_idx on public.diario_efetivo (diario_id, ordem);
create index diario_efetivo_projeto_idx on public.diario_efetivo (projeto_id);
create index diario_efetivo_empresa_idx on public.diario_efetivo (empresa_id);

create table public.diario_foto (
  id           uuid primary key,
  empresa_id   uuid not null references public.empresa(id) on delete cascade,
  projeto_id   uuid not null references public.projeto(id) on delete cascade,
  diario_id    uuid not null references public.diario_obra(id) on delete cascade,
  caminho      text not null unique check (length(caminho) <= 300),
  legenda      text check (legenda is null or length(legenda) <= 300),
  tarefa_id    uuid references public.eap_item(id) on delete set null,
  enviado_por  uuid references auth.users(id) on delete set null,
  criado_em    timestamptz not null default now()
);
create index diario_foto_diario_idx on public.diario_foto (diario_id, criado_em);
create index diario_foto_projeto_idx on public.diario_foto (projeto_id);
create index diario_foto_empresa_idx on public.diario_foto (empresa_id);
create index diario_foto_tarefa_idx on public.diario_foto (tarefa_id);
create index diario_foto_enviado_por_idx on public.diario_foto (enviado_por);

-- -----------------------------------------------------------------------------
-- Integridade e imutabilidade
-- -----------------------------------------------------------------------------
create trigger diario_obra_atualizado_em before update on public.diario_obra
  for each row execute function app.tg_atualizado_em();

-- Diário assinado não muda nem some (só sai junto com o projeto).
create or replace function app.tg_diario_assinado_imutavel()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if old.status = 'assinado' then
    if tg_op = 'DELETE' and not exists (select 1 from public.projeto where id = old.projeto_id) then
      return old;  -- cascata da exclusão do projeto
    end if;
    raise exception 'Diário assinado não pode ser alterado. Registre a correção como ocorrência no diário seguinte.';
  end if;
  return coalesce(new, old);
end;
$$;
create trigger diario_obra_imutavel before update or delete on public.diario_obra
  for each row execute function app.tg_diario_assinado_imutavel();

-- Filhos: projeto e empresa vêm do diário; diário assinado não recebe mudança.
create or replace function app.tg_diario_filho()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  v public.diario_obra;
begin
  select * into v from public.diario_obra where id = coalesce(new.diario_id, old.diario_id);
  if v.id is null then
    if tg_op = 'DELETE' then return old; end if;  -- cascata
    raise exception 'Diário não encontrado';
  end if;
  if v.status = 'assinado' then
    raise exception 'Diário assinado não pode ser alterado. Registre a correção como ocorrência no diário seguinte.';
  end if;
  if tg_op = 'DELETE' then
    return old;
  end if;
  new.empresa_id := v.empresa_id;
  new.projeto_id := v.projeto_id;
  return new;
end;
$$;
create trigger diario_efetivo_integridade before insert or update or delete on public.diario_efetivo
  for each row execute function app.tg_diario_filho();
create trigger diario_foto_integridade before insert or update or delete on public.diario_foto
  for each row execute function app.tg_diario_filho();

create trigger diario_obra_auditoria after insert or update or delete on public.diario_obra
  for each row execute function app.tg_auditoria('atualizado_em');
create trigger diario_efetivo_auditoria after insert or update or delete on public.diario_efetivo
  for each row execute function app.tg_auditoria();
create trigger diario_foto_auditoria after insert or update or delete on public.diario_foto
  for each row execute function app.tg_auditoria();

-- -----------------------------------------------------------------------------
-- RLS: leitura para quem vê o projeto; escrita só pelas funções
-- -----------------------------------------------------------------------------
alter table public.diario_obra    enable row level security;
alter table public.diario_efetivo enable row level security;
alter table public.diario_foto    enable row level security;

create policy diario_obra_select on public.diario_obra for select to authenticated
  using (app.pode_ver_projeto(projeto_id));
create policy diario_efetivo_select on public.diario_efetivo for select to authenticated
  using (app.pode_ver_projeto(projeto_id));
create policy diario_foto_select on public.diario_foto for select to authenticated
  using (app.pode_ver_projeto(projeto_id));

revoke all on public.diario_obra, public.diario_efetivo, public.diario_foto from anon, authenticated;
grant select on public.diario_obra, public.diario_efetivo, public.diario_foto to authenticated;

-- -----------------------------------------------------------------------------
-- Funções de escrita
-- -----------------------------------------------------------------------------
create or replace function app.validar_campos_diario(p_campos jsonb)
returns void language plpgsql immutable set search_path = '' as $$
declare
  v_extra text;
begin
  if p_campos is null then return; end if;
  if jsonb_typeof(p_campos) <> 'object' then
    raise exception 'Campos do diário precisam ser um objeto';
  end if;
  select string_agg(k, ', ') into v_extra
    from jsonb_object_keys(p_campos) as k
   where k not in ('clima_manha', 'clima_tarde', 'praticavel_manha', 'praticavel_tarde', 'temp_min', 'temp_max',
                   'chuva_mm', 'clima_automatico', 'ocorrencias', 'observacoes');
  if v_extra is not null then
    raise exception 'Campos desconhecidos no diário: %', v_extra;
  end if;
end;
$$;

-- Cria ou atualiza o diário do dia (só as chaves presentes mudam). Devolve o id.
create or replace function public.salvar_diario(p_projeto_id uuid, p_data date, p_campos jsonb default '{}'::jsonb)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_id     uuid;
  v_hoje   date := (now() at time zone 'America/Sao_Paulo')::date;
  c        jsonb := coalesce(p_campos, '{}'::jsonb);
begin
  if not app.pode_apontar_campo(p_projeto_id) then
    raise exception 'Sem permissão para preencher o diário desta obra' using errcode = '42501';
  end if;
  perform app.validar_campos_diario(c);
  if p_data is null or p_data > v_hoje then
    raise exception 'O diário não pode ser de um dia futuro';
  end if;

  insert into public.diario_obra (empresa_id, projeto_id, data, criado_por)
  select p.empresa_id, p.id, p_data, auth.uid() from public.projeto p where p.id = p_projeto_id
  on conflict (projeto_id, data) do nothing;

  select id into v_id from public.diario_obra where projeto_id = p_projeto_id and data = p_data;

  if c <> '{}'::jsonb then
    update public.diario_obra set
      clima_manha      = case when c ? 'clima_manha'      then nullif(c ->> 'clima_manha', '')::public.clima_periodo else clima_manha end,
      clima_tarde      = case when c ? 'clima_tarde'      then nullif(c ->> 'clima_tarde', '')::public.clima_periodo else clima_tarde end,
      praticavel_manha = case when c ? 'praticavel_manha' then coalesce((c ->> 'praticavel_manha')::boolean, true) else praticavel_manha end,
      praticavel_tarde = case when c ? 'praticavel_tarde' then coalesce((c ->> 'praticavel_tarde')::boolean, true) else praticavel_tarde end,
      temp_min         = case when c ? 'temp_min'         then nullif(c ->> 'temp_min', '')::numeric else temp_min end,
      temp_max         = case when c ? 'temp_max'         then nullif(c ->> 'temp_max', '')::numeric else temp_max end,
      chuva_mm         = case when c ? 'chuva_mm'         then nullif(c ->> 'chuva_mm', '')::numeric else chuva_mm end,
      clima_automatico = case when c ? 'clima_automatico' then coalesce((c ->> 'clima_automatico')::boolean, false) else clima_automatico end,
      ocorrencias      = case when c ? 'ocorrencias'      then nullif(btrim(c ->> 'ocorrencias'), '') else ocorrencias end,
      observacoes      = case when c ? 'observacoes'      then nullif(btrim(c ->> 'observacoes'), '') else observacoes end
    where id = v_id;
  end if;

  return v_id;
end;
$$;

-- Substitui a equipe do dia. p_linhas: [{funcao, empresa_terceira, quantidade}]. Devolve o total de pessoas.
create or replace function public.definir_efetivo(p_diario_id uuid, p_linhas jsonb)
returns integer language plpgsql security definer set search_path = '' as $$
declare
  v public.diario_obra;
begin
  select * into v from public.diario_obra where id = p_diario_id;
  if v.id is null or not app.pode_apontar_campo(v.projeto_id) then
    raise exception 'Diário não encontrado ou sem permissão' using errcode = '42501';
  end if;
  if p_linhas is null or jsonb_typeof(p_linhas) <> 'array' then
    raise exception 'Equipe inválida';
  end if;
  if jsonb_array_length(p_linhas) > 100 then
    raise exception 'Use no máximo 100 linhas de equipe';
  end if;

  delete from public.diario_efetivo where diario_id = v.id;
  insert into public.diario_efetivo (diario_id, empresa_id, projeto_id, ordem, funcao, empresa_terceira, quantidade)
  select v.id, v.empresa_id, v.projeto_id, t.ord::integer,
         btrim(t.e ->> 'funcao'), nullif(btrim(t.e ->> 'empresa_terceira'), ''), (t.e ->> 'quantidade')::integer
    from jsonb_array_elements(p_linhas) with ordinality as t(e, ord);

  return (select coalesce(sum(quantidade), 0)::integer from public.diario_efetivo where diario_id = v.id);
end;
$$;

-- Registra uma foto já enviada ao Storage. O id vem do aparelho (reenviar não duplica).
create or replace function public.registrar_foto_diario(
  p_id        uuid,
  p_diario_id uuid,
  p_caminho   text,
  p_legenda   text default null,
  p_tarefa_id uuid default null
)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v public.diario_obra;
begin
  select * into v from public.diario_obra where id = p_diario_id;
  if v.id is null or not app.pode_apontar_campo(v.projeto_id) then
    raise exception 'Diário não encontrado ou sem permissão' using errcode = '42501';
  end if;
  if exists (select 1 from public.diario_foto where id = p_id) then
    return p_id;
  end if;
  if p_caminho is null or p_caminho not like v.projeto_id::text || '/' || v.id::text || '/%' or p_caminho like '%..%' then
    raise exception 'Caminho da foto não pertence a este diário';
  end if;
  if p_tarefa_id is not null and not exists (
       select 1 from public.eap_item where id = p_tarefa_id and projeto_id = v.projeto_id and tipo = 'tarefa') then
    raise exception 'Tarefa não encontrada nesta obra';
  end if;

  insert into public.diario_foto (id, diario_id, empresa_id, projeto_id, caminho, legenda, tarefa_id, enviado_por)
  values (p_id, v.id, v.empresa_id, v.projeto_id, p_caminho, nullif(btrim(p_legenda), ''), p_tarefa_id, auth.uid());
  return p_id;
end;
$$;

-- Tira a foto do diário e devolve o caminho, para o app apagar o arquivo.
create or replace function public.excluir_foto_diario(p_id uuid)
returns text language plpgsql security definer set search_path = '' as $$
declare
  v_caminho text;
  v_projeto uuid;
begin
  select caminho, projeto_id into v_caminho, v_projeto from public.diario_foto where id = p_id;
  if v_caminho is null or not app.pode_apontar_campo(v_projeto) then
    raise exception 'Foto não encontrada ou sem permissão' using errcode = '42501';
  end if;
  delete from public.diario_foto where id = p_id;
  return v_caminho;
end;
$$;

-- Retrato do diário para assinar e imprimir: campos, equipe, fotos e avanços do dia.
create or replace function app.conteudo_diario(p_diario_id uuid)
returns jsonb language sql stable security definer set search_path = '' as $$
  select jsonb_build_object(
    'projeto', jsonb_build_object('id', p.id, 'nome', p.nome, 'endereco', p.endereco),
    'data', d.data,
    'clima', jsonb_build_object(
      'manha', d.clima_manha, 'tarde', d.clima_tarde,
      'praticavel_manha', d.praticavel_manha, 'praticavel_tarde', d.praticavel_tarde,
      'temp_min', d.temp_min, 'temp_max', d.temp_max, 'chuva_mm', d.chuva_mm, 'automatico', d.clima_automatico),
    'ocorrencias', d.ocorrencias,
    'observacoes', d.observacoes,
    'efetivo', coalesce((
      select jsonb_agg(jsonb_build_object('funcao', e.funcao, 'empresa', e.empresa_terceira, 'quantidade', e.quantidade)
                       order by e.ordem)
        from public.diario_efetivo e where e.diario_id = d.id), '[]'::jsonb),
    'fotos', coalesce((
      select jsonb_agg(jsonb_build_object('caminho', f.caminho, 'legenda', f.legenda, 'tarefa_id', f.tarefa_id)
                       order by f.criado_em, f.id)
        from public.diario_foto f where f.diario_id = d.id), '[]'::jsonb),
    'avancos', coalesce((
      select jsonb_agg(jsonb_build_object('tarefa_id', a.tarefa_id, 'tarefa', t.nome, 'percentual', a.percentual,
                                          'quantidade', a.quantidade_feita, 'unidade', t.unidade, 'observacao', a.observacao)
                       order by t.nome, a.registrado_em)
        from public.avanco_tarefa a join public.eap_item t on t.id = a.tarefa_id
       where a.projeto_id = d.projeto_id and a.data = d.data), '[]'::jsonb)
  )
  from public.diario_obra d join public.projeto p on p.id = d.projeto_id
  where d.id = p_diario_id;
$$;

-- Assina (só engenheiro): congela o retrato e grava o SHA-256 dele. Devolve o hash.
create or replace function public.assinar_diario(p_diario_id uuid)
returns text language plpgsql security definer set search_path = '' as $$
declare
  v         public.diario_obra;
  v_conteudo jsonb;
  v_hash    text;
  v_nome    text;
begin
  select * into v from public.diario_obra where id = p_diario_id;
  if v.id is null or not app.pode_editar_projeto(v.projeto_id) then
    raise exception 'Só o engenheiro da obra assina o diário' using errcode = '42501';
  end if;
  if v.status = 'assinado' then
    raise exception 'Este diário já foi assinado';
  end if;
  if v.clima_manha is null or v.clima_tarde is null then
    raise exception 'Preencha o clima da manhã e da tarde antes de assinar';
  end if;

  v_conteudo := app.conteudo_diario(v.id);
  v_hash := encode(extensions.digest(convert_to(v_conteudo::text, 'UTF8'), 'sha256'), 'hex');
  select u.email into v_nome from auth.users u where u.id = auth.uid();

  update public.diario_obra
     set status = 'assinado', assinado_por = auth.uid(), assinado_nome = v_nome, assinado_em = now(),
         conteudo_assinado = v_conteudo, hash_conteudo = v_hash
   where id = v.id;
  return v_hash;
end;
$$;

revoke all on function app.validar_campos_diario(jsonb), app.conteudo_diario(uuid) from public, anon, authenticated;

revoke all on function
  public.salvar_diario(uuid, date, jsonb),
  public.definir_efetivo(uuid, jsonb),
  public.registrar_foto_diario(uuid, uuid, text, text, uuid),
  public.excluir_foto_diario(uuid),
  public.assinar_diario(uuid)
from public, anon;
grant execute on function
  public.salvar_diario(uuid, date, jsonb),
  public.definir_efetivo(uuid, jsonb),
  public.registrar_foto_diario(uuid, uuid, text, text, uuid),
  public.excluir_foto_diario(uuid),
  public.assinar_diario(uuid)
to authenticated;

-- -----------------------------------------------------------------------------
-- Storage: bucket privado e políticas pelo caminho <projeto_id>/<diario_id>/<arquivo>
-- -----------------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('diario', 'diario', false, 5242880, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do nothing;

-- Pasta n do caminho como uuid (null se não for uuid, para a política não estourar).
create or replace function app.uuid_da_pasta(p_nome text, p_n integer)
returns uuid language sql immutable set search_path = '' as $$
  select case when (storage.foldername(p_nome))[p_n] ~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$'
              then ((storage.foldername(p_nome))[p_n])::uuid end;
$$;

-- Pode mexer em arquivos deste caminho? Engenheiro/mestre, diário da mesma obra e ainda em rascunho.
create or replace function app.pode_mexer_foto_diario(p_nome text)
returns boolean language sql stable security definer set search_path = '' as $$
  select coalesce((
    select app.pode_apontar_campo(d.projeto_id) and d.status = 'rascunho'
      from public.diario_obra d
     where d.id = app.uuid_da_pasta(p_nome, 2)
       and d.projeto_id = app.uuid_da_pasta(p_nome, 1)
  ), false);
$$;

revoke all on function app.uuid_da_pasta(text, integer), app.pode_mexer_foto_diario(text) from public;
grant execute on function app.uuid_da_pasta(text, integer), app.pode_mexer_foto_diario(text) to authenticated;

create policy diario_fotos_ver on storage.objects for select to authenticated
  using (bucket_id = 'diario' and coalesce(app.pode_ver_projeto(app.uuid_da_pasta(name, 1)), false));
create policy diario_fotos_enviar on storage.objects for insert to authenticated
  with check (bucket_id = 'diario' and app.pode_mexer_foto_diario(name));
create policy diario_fotos_apagar on storage.objects for delete to authenticated
  using (bucket_id = 'diario' and app.pode_mexer_foto_diario(name));
