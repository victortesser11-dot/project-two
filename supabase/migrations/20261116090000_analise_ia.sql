-- =============================================================================
-- Leituras da IA: o que o modelo respondeu ao ler arquivos do projeto ou as fotos de um dia do diário.
--
-- * A IA é chamada pelo servidor do app (a chave nunca vai para o navegador). Depois de uma resposta válida, o app
--   grava aqui por registrar_analise_ia: serve de histórico (abrir de novo sem gastar a cota), de limite diário por
--   obra e, mais tarde, para medir quanto do que a IA sugeriu o engenheiro aceitou.
-- * A leitura é só sugestão: nada aqui muda cronograma ou avanço. Tarefas e apontamentos que o engenheiro aceitar
--   entram pelas funções de sempre (criar_item_eap, registrar_avanco), com as regras e a auditoria delas.
-- * Imutável: sem UPDATE nem DELETE para ninguém do app. Some junto com a obra.
-- =============================================================================

create table public.analise_ia (
  id          uuid primary key,
  empresa_id  uuid not null references public.empresa(id) on delete cascade,
  projeto_id  uuid not null references public.projeto(id) on delete cascade,
  tipo        text not null check (tipo in ('arquivos', 'fotos_diario')),
  -- Arquivos lidos (arquivo_obra.id) ou o dia do diário cujas fotos foram lidas.
  arquivos    uuid[] not null default '{}' check (cardinality(arquivos) <= 50),
  diario_id   uuid references public.diario_obra(id) on delete cascade,
  modelo      text not null check (length(btrim(modelo)) between 1 and 120),
  resultado   jsonb not null check (jsonb_typeof(resultado) = 'object' and octet_length(resultado::text) <= 200000),
  criado_por  uuid references auth.users(id) on delete set null,
  criado_em   timestamptz not null default now(),
  constraint analise_ia_alvo_ck check (
    (tipo = 'arquivos' and cardinality(arquivos) >= 1 and diario_id is null)
    or (tipo = 'fotos_diario' and diario_id is not null and cardinality(arquivos) = 0)
  )
);
create index analise_ia_projeto_idx on public.analise_ia (projeto_id, criado_em desc);
create index analise_ia_empresa_idx on public.analise_ia (empresa_id);
create index analise_ia_diario_idx on public.analise_ia (diario_id);
create index analise_ia_criado_por_idx on public.analise_ia (criado_por);

create trigger analise_ia_auditoria after insert or update or delete on public.analise_ia
  for each row execute function app.tg_auditoria();

alter table public.analise_ia enable row level security;
create policy analise_ia_select on public.analise_ia for select to authenticated
  using (app.pode_ver_projeto(projeto_id));
revoke all on public.analise_ia from anon, authenticated;
grant select on public.analise_ia to authenticated;

-- Grava uma leitura. Arquivos: quem edita a obra (as tarefas sugeridas entram na EAP). Fotos do diário: engenheiro e
-- mestre (quem aponta o avanço). Confere se os arquivos e o diário são mesmo desta obra.
create or replace function public.registrar_analise_ia(
  p_id         uuid,
  p_projeto_id uuid,
  p_tipo       text,
  p_modelo     text,
  p_resultado  jsonb,
  p_arquivos   uuid[] default '{}',
  p_diario_id  uuid default null
)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_empresa uuid;
begin
  if p_tipo = 'arquivos' then
    if not coalesce(app.pode_editar_projeto(p_projeto_id), false) then
      raise exception 'Obra não encontrada ou sem permissão para ler os arquivos com IA' using errcode = '42501';
    end if;
    if exists (
      select 1 from unnest(coalesce(p_arquivos, '{}')) as a(id)
       where not exists (select 1 from public.arquivo_obra o where o.id = a.id and o.projeto_id = p_projeto_id)
    ) then
      raise exception 'Algum arquivo lido não é desta obra';
    end if;
  elsif p_tipo = 'fotos_diario' then
    if not coalesce(app.pode_apontar_campo(p_projeto_id) or app.pode_editar_projeto(p_projeto_id), false) then
      raise exception 'Obra não encontrada ou sem permissão para ler as fotos com IA' using errcode = '42501';
    end if;
    if not exists (select 1 from public.diario_obra d where d.id = p_diario_id and d.projeto_id = p_projeto_id) then
      raise exception 'Diário não encontrado nesta obra';
    end if;
  else
    raise exception 'Tipo de leitura desconhecido: %', p_tipo;
  end if;

  if exists (select 1 from public.analise_ia where id = p_id) then
    return p_id;  -- reenvio não duplica
  end if;

  select empresa_id into v_empresa from public.projeto where id = p_projeto_id;
  insert into public.analise_ia (id, empresa_id, projeto_id, tipo, arquivos, diario_id, modelo, resultado, criado_por)
  values (p_id, v_empresa, p_projeto_id, p_tipo, coalesce(p_arquivos, '{}'), p_diario_id, btrim(p_modelo), p_resultado, auth.uid());
  return p_id;
end;
$$;

revoke all on function public.registrar_analise_ia(uuid, uuid, text, text, jsonb, uuid[], uuid) from public, anon;
grant execute on function public.registrar_analise_ia(uuid, uuid, text, text, jsonb, uuid[], uuid) to authenticated;
