-- =============================================================================
-- Fiscal da obra com IA (RF-105): a IA olha as fotos do dia (câmeras, hoje × ontem, e o diário), compara com as
-- tarefas previstas e com o avanço apontado e aponta achados; o engenheiro ou o mestre confere cada um.
--
-- * A leitura entra em analise_ia (tipo 'fiscal', com o dia e as fotos lidas) e os achados em achado_fiscal, juntos,
--   por registrar_fiscal_ia (tudo ou nada; o reenvio com o mesmo id não duplica).
-- * Achado: avanço visto, tarefa prevista sem evidência, divergência com o apontado ou não conformidade de segurança
--   visível (com a NR). A IA só sugere: o achado nasce "pendente".
-- * resolver_achado_fiscal: confirmar, corrigir ou descartar. Avanço confirmado ou corrigido é gravado pela
--   registrar_avanco de sempre (mesmas regras e auditoria). A situação final mede a taxa de acerto da IA.
-- * Escrita só pelas funções; leitura para quem vê a obra; tudo no audit_log.
-- =============================================================================

alter table public.analise_ia drop constraint analise_ia_tipo_check;
alter table public.analise_ia add constraint analise_ia_tipo_check check (tipo in ('arquivos', 'fotos_diario', 'fiscal'));
alter table public.analise_ia
  add column data date,
  add column fotos_camera uuid[] not null default '{}' check (cardinality(fotos_camera) <= 20);
alter table public.analise_ia drop constraint analise_ia_alvo_ck;
alter table public.analise_ia add constraint analise_ia_alvo_ck check (
  (tipo = 'arquivos' and cardinality(arquivos) >= 1 and diario_id is null)
  or (tipo = 'fotos_diario' and diario_id is not null and cardinality(arquivos) = 0)
  or (tipo = 'fiscal' and data is not null and cardinality(arquivos) = 0 and (cardinality(fotos_camera) >= 1 or diario_id is not null))
);
create index analise_ia_fiscal_idx on public.analise_ia (projeto_id, data desc) where tipo = 'fiscal';

create table public.achado_fiscal (
  id                   uuid primary key default gen_random_uuid(),
  empresa_id           uuid not null references public.empresa(id) on delete cascade,
  projeto_id           uuid not null references public.projeto(id) on delete cascade,
  analise_id           uuid not null references public.analise_ia(id) on delete cascade,
  data                 date not null,
  tipo                 text not null check (tipo in ('avanco', 'sem_evidencia', 'divergencia', 'seguranca')),
  tarefa_id            uuid references public.eap_item(id) on delete cascade,
  -- Norma regulamentadora da não conformidade (ex.: NR-35). Só nos achados de segurança.
  norma                text check (norma is null or norma ~ '^NR-[0-9]{1,2}$'),
  gravidade            text not null default 'media' check (gravidade in ('alta', 'media', 'baixa')),
  titulo               text not null check (length(btrim(titulo)) between 2 and 200),
  detalhe              text check (detalhe is null or length(detalhe) <= 600),
  evidencia            text check (evidencia is null or length(evidencia) <= 300),
  percentual_visto     numeric(5, 2) check (percentual_visto between 0 and 100),
  percentual_apontado  numeric(5, 2) check (percentual_apontado between 0 and 100),
  situacao             text not null default 'pendente' check (situacao in ('pendente', 'confirmado', 'corrigido', 'descartado')),
  percentual_final     numeric(5, 2) check (percentual_final between 0 and 100),
  resposta             text check (resposta is null or length(resposta) <= 500),
  avanco_id            uuid references public.avanco_tarefa(id) on delete set null,
  resolvido_por        uuid references auth.users(id) on delete set null,
  resolvido_em         timestamptz,
  criado_em            timestamptz not null default now(),
  constraint achado_fiscal_tarefa_ck check (tipo = 'seguranca' or tarefa_id is not null),
  constraint achado_fiscal_norma_ck check ((tipo = 'seguranca') = (norma is not null)),
  constraint achado_fiscal_resolvido_ck check ((situacao = 'pendente') = (resolvido_em is null))
);
create index achado_fiscal_projeto_idx on public.achado_fiscal (projeto_id, situacao, data desc);
create index achado_fiscal_analise_idx on public.achado_fiscal (analise_id);
create index achado_fiscal_empresa_idx on public.achado_fiscal (empresa_id);
create index achado_fiscal_tarefa_idx on public.achado_fiscal (tarefa_id);
create index achado_fiscal_avanco_idx on public.achado_fiscal (avanco_id);
create index achado_fiscal_resolvido_por_idx on public.achado_fiscal (resolvido_por);

create trigger achado_fiscal_auditoria after insert or update or delete on public.achado_fiscal
  for each row execute function app.tg_auditoria();

alter table public.achado_fiscal enable row level security;
create policy achado_fiscal_select on public.achado_fiscal for select to authenticated
  using (app.pode_ver_projeto(projeto_id));
revoke all on public.achado_fiscal from anon, authenticated;
grant select on public.achado_fiscal to authenticated;

-- -----------------------------------------------------------------------------
-- Grava a leitura do fiscal e os achados dela. Quem aponta o campo (engenheiro, mestre, admin).
-- p_achados: [{ tipo, tarefa_id, norma, gravidade, titulo, detalhe, evidencia, percentual_visto, percentual_apontado }]
-- -----------------------------------------------------------------------------
create or replace function public.registrar_fiscal_ia(
  p_id            uuid,
  p_projeto_id    uuid,
  p_data          date,
  p_modelo        text,
  p_resultado     jsonb,
  p_fotos_camera  uuid[] default '{}',
  p_diario_id     uuid default null,
  p_achados       jsonb default '[]'
)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_empresa uuid;
  v_hoje    date := (now() at time zone 'America/Sao_Paulo')::date;
begin
  if not coalesce(app.pode_apontar_campo(p_projeto_id), false) then
    raise exception 'Obra não encontrada ou sem permissão para fiscalizar com IA' using errcode = '42501';
  end if;
  if p_data is null or p_data > v_hoje then
    raise exception 'O dia fiscalizado não pode ser no futuro';
  end if;
  if exists (
    select 1 from unnest(coalesce(p_fotos_camera, '{}')) as f(id)
     where not exists (select 1 from public.foto_camera c where c.id = f.id and c.projeto_id = p_projeto_id)
  ) then
    raise exception 'Alguma foto de câmera lida não é desta obra';
  end if;
  if p_diario_id is not null
     and not exists (select 1 from public.diario_obra d where d.id = p_diario_id and d.projeto_id = p_projeto_id) then
    raise exception 'Diário não encontrado nesta obra';
  end if;
  if jsonb_typeof(coalesce(p_achados, '[]')) <> 'array' or jsonb_array_length(coalesce(p_achados, '[]')) > 80 then
    raise exception 'Achados inválidos (no máximo 80 por leitura)';
  end if;

  if exists (select 1 from public.analise_ia where id = p_id) then
    return p_id;  -- reenvio não duplica
  end if;

  if exists (
    select 1 from jsonb_to_recordset(coalesce(p_achados, '[]')) as a(tarefa_id uuid)
     where a.tarefa_id is not null
       and not exists (select 1 from public.eap_item e where e.id = a.tarefa_id and e.projeto_id = p_projeto_id and e.tipo = 'tarefa')
  ) then
    raise exception 'Algum achado aponta para uma tarefa que não é desta obra';
  end if;

  select empresa_id into v_empresa from public.projeto where id = p_projeto_id;
  insert into public.analise_ia (id, empresa_id, projeto_id, tipo, data, fotos_camera, diario_id, modelo, resultado, criado_por)
  values (p_id, v_empresa, p_projeto_id, 'fiscal', p_data, coalesce(p_fotos_camera, '{}'), p_diario_id, btrim(p_modelo), p_resultado, auth.uid());

  insert into public.achado_fiscal (empresa_id, projeto_id, analise_id, data, tipo, tarefa_id, norma, gravidade, titulo, detalhe,
                                    evidencia, percentual_visto, percentual_apontado)
  select v_empresa, p_projeto_id, p_id, p_data, a.tipo, a.tarefa_id, nullif(btrim(a.norma), ''), coalesce(a.gravidade, 'media'),
         btrim(a.titulo), nullif(btrim(a.detalhe), ''), nullif(btrim(a.evidencia), ''), a.percentual_visto, a.percentual_apontado
    from jsonb_to_recordset(coalesce(p_achados, '[]')) as a(
      tipo text, tarefa_id uuid, norma text, gravidade text, titulo text, detalhe text, evidencia text,
      percentual_visto numeric, percentual_apontado numeric);
  return p_id;
end;
$$;

revoke all on function public.registrar_fiscal_ia(uuid, uuid, date, text, jsonb, uuid[], uuid, jsonb) from public, anon;
grant execute on function public.registrar_fiscal_ia(uuid, uuid, date, text, jsonb, uuid[], uuid, jsonb) to authenticated;

-- -----------------------------------------------------------------------------
-- Confere um achado. confirmado: a IA acertou (avanço visto vira apontamento); corrigido: o certo é p_percentual;
-- descartado: a IA errou. Segurança: confirmado (com a providência em p_resposta) ou descartado.
-- p_avanco_id vem do aparelho, como no apontamento de campo (reenvio não duplica).
-- -----------------------------------------------------------------------------
create or replace function public.resolver_achado_fiscal(
  p_id          uuid,
  p_situacao    text,
  p_percentual  numeric default null,
  p_resposta    text default null,
  p_avanco_id   uuid default null
)
returns void language plpgsql security definer set search_path = '' as $$
declare
  a        public.achado_fiscal;
  v_pct    numeric;
  v_avanco uuid;
begin
  select * into a from public.achado_fiscal where id = p_id for update;
  if not found or not coalesce(app.pode_apontar_campo(a.projeto_id), false) then
    raise exception 'Achado não encontrado ou sem permissão para conferir' using errcode = '42501';
  end if;
  if a.situacao <> 'pendente' then
    raise exception 'Este achado já foi conferido';
  end if;
  if p_situacao not in ('confirmado', 'corrigido', 'descartado') then
    raise exception 'Situação inválida: %', p_situacao;
  end if;
  if p_resposta is not null and length(p_resposta) > 500 then
    raise exception 'A resposta passa de 500 letras';
  end if;

  if a.tipo = 'seguranca' then
    if p_situacao = 'corrigido' then
      raise exception 'Achado de segurança é confirmado (com a providência) ou descartado';
    end if;
  elsif p_situacao = 'corrigido' then
    if p_percentual is null or p_percentual < 0 or p_percentual > 100 then
      raise exception 'Informe o avanço certo, de 0 a 100%%';
    end if;
    v_pct := p_percentual;
  elsif p_situacao = 'confirmado' and a.tipo in ('avanco', 'divergencia') then
    v_pct := a.percentual_visto;  -- sem percentual visto, confirmar só registra que a IA acertou
  end if;

  if v_pct is not null then
    v_avanco := coalesce(p_avanco_id, gen_random_uuid());
    perform public.registrar_avanco(v_avanco, a.tarefa_id, a.data, v_pct, null, 'Conferido no fiscal da obra (IA)');
  end if;

  update public.achado_fiscal
     set situacao = p_situacao,
         percentual_final = v_pct,
         resposta = nullif(btrim(p_resposta), ''),
         avanco_id = v_avanco,
         resolvido_por = auth.uid(),
         resolvido_em = now()
   where id = p_id;
end;
$$;

revoke all on function public.resolver_achado_fiscal(uuid, text, numeric, text, uuid) from public, anon;
grant execute on function public.resolver_achado_fiscal(uuid, text, numeric, text, uuid) to authenticated;
