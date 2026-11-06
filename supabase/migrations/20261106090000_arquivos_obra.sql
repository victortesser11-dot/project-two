-- =============================================================================
-- Arquivos da obra: projetos (DWG, PDF, IFC...), alvarás, ART, contratos e o que mais a obra guardar.
--
-- * arquivo_obra: o registro de cada arquivo (nome, categoria, tamanho, quem enviou). O arquivo em si fica no
--   bucket privado "arquivos", no caminho <projeto_id>/<arquivo_id>/<nome-seguro.ext>.
-- * O navegador envia direto para o Storage (arquivo grande não passa pelo servidor do app) e depois chama
--   registrar_arquivo_obra, que confere o caminho, a extensão e se o arquivo chegou mesmo.
-- * Todos da obra leem e baixam; quem edita a obra (engenheiro e admin) envia, corrige e apaga.
-- * Só extensões de obra e escritório (lista abaixo e em packages/shared/src/arquivos.ts): nada de executável.
--   Até 50 MB por arquivo (limite do Storage no plano grátis).
-- =============================================================================

create type public.categoria_arquivo as enum (
  'arquitetonico', 'estrutural', 'eletrico', 'hidrossanitario', 'outros_projetos',
  'legalizacao', 'contrato', 'orcamento', 'outros'
);

-- Extensão permitida? (mesma lista de EXTENSOES_ARQUIVO no shared)
create or replace function app.extensao_arquivo_permitida(p_nome text)
returns boolean language sql immutable set search_path = '' as $$
  select coalesce(lower(substring(p_nome from '\.([A-Za-z0-9]{1,5})$')) = any (array[
    'pdf', 'dwg', 'dxf', 'dwf', 'rvt', 'rfa', 'ifc', 'skp', 'nwd', 'nwc', 'pln',
    'jpg', 'jpeg', 'png', 'webp', 'heic',
    'xlsx', 'xls', 'csv', 'ods', 'docx', 'doc', 'odt', 'pptx', 'txt', 'mpp', 'xml',
    'zip', 'rar', '7z', 'kmz', 'kml'
  ]), false);
$$;

create table public.arquivo_obra (
  id             uuid primary key,
  empresa_id     uuid not null references public.empresa(id) on delete cascade,
  projeto_id     uuid not null references public.projeto(id) on delete cascade,
  categoria      public.categoria_arquivo not null,
  nome           text not null check (length(btrim(nome)) between 1 and 200),
  descricao      text check (descricao is null or length(descricao) <= 500),
  caminho        text not null unique,
  tamanho        bigint not null check (tamanho > 0 and tamanho <= 52428800),
  tipo_mime      text check (tipo_mime is null or length(tipo_mime) <= 120),
  enviado_por    uuid references auth.users(id) on delete set null,
  enviado_nome   text,
  criado_em      timestamptz not null default now(),
  atualizado_em  timestamptz not null default now(),
  constraint arquivo_obra_extensao_ck check (app.extensao_arquivo_permitida(nome) and app.extensao_arquivo_permitida(caminho))
);
create index arquivo_obra_projeto_idx on public.arquivo_obra (projeto_id, categoria, criado_em desc);
create index arquivo_obra_empresa_idx on public.arquivo_obra (empresa_id);
create index arquivo_obra_enviado_por_idx on public.arquivo_obra (enviado_por);

create trigger arquivo_obra_auditoria after insert or update or delete on public.arquivo_obra
  for each row execute function app.tg_auditoria();

alter table public.arquivo_obra enable row level security;
create policy arquivo_obra_select on public.arquivo_obra for select to authenticated
  using (app.pode_ver_projeto(projeto_id));
revoke all on public.arquivo_obra from anon, authenticated;
grant select on public.arquivo_obra to authenticated;

-- Registra o arquivo que o navegador acabou de enviar. O id vem do app (reenvio não duplica).
create or replace function public.registrar_arquivo_obra(
  p_id          uuid,
  p_projeto_id  uuid,
  p_caminho     text,
  p_nome        text,
  p_categoria   public.categoria_arquivo,
  p_tamanho     bigint,
  p_tipo_mime   text default null,
  p_descricao   text default null
)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_empresa uuid;
  v_nome    text;
begin
  if not coalesce(app.pode_editar_projeto(p_projeto_id), false) then
    raise exception 'Obra não encontrada ou sem permissão para enviar arquivos' using errcode = '42501';
  end if;
  if exists (select 1 from public.arquivo_obra where id = p_id) then
    return p_id;
  end if;
  if p_caminho is null or p_caminho not like p_projeto_id::text || '/' || p_id::text || '/%' or p_caminho like '%..%' then
    raise exception 'Caminho do arquivo não pertence a esta obra';
  end if;
  if not app.extensao_arquivo_permitida(p_caminho) or not app.extensao_arquivo_permitida(p_nome) then
    raise exception 'Tipo de arquivo não aceito. Envie projeto (DWG, PDF, IFC...), imagem, planilha, documento ou ZIP.';
  end if;
  if p_categoria is null then
    raise exception 'Escolha a pasta do arquivo';
  end if;
  if not exists (select 1 from storage.objects where bucket_id = 'arquivos' and name = p_caminho) then
    raise exception 'O arquivo não chegou ao armazenamento. Envie de novo.';
  end if;

  select empresa_id into v_empresa from public.projeto where id = p_projeto_id;
  select u.email into v_nome from auth.users u where u.id = auth.uid();
  insert into public.arquivo_obra (id, empresa_id, projeto_id, categoria, nome, descricao, caminho, tamanho, tipo_mime, enviado_por, enviado_nome)
  values (p_id, v_empresa, p_projeto_id, p_categoria, btrim(p_nome), nullif(btrim(p_descricao), ''), p_caminho, p_tamanho,
          nullif(btrim(p_tipo_mime), ''), auth.uid(), v_nome);
  return p_id;
end;
$$;

-- Corrige nome (mantendo a extensão), pasta e descrição. O arquivo guardado não muda.
create or replace function public.editar_arquivo_obra(
  p_id        uuid,
  p_nome      text,
  p_categoria public.categoria_arquivo,
  p_descricao text default null
)
returns void language plpgsql security definer set search_path = '' as $$
declare
  a public.arquivo_obra;
begin
  select * into a from public.arquivo_obra where id = p_id;
  if a.id is null or not coalesce(app.pode_editar_projeto(a.projeto_id), false) then
    raise exception 'Arquivo não encontrado ou sem permissão' using errcode = '42501';
  end if;
  if lower(substring(btrim(p_nome) from '\.([A-Za-z0-9]{1,5})$')) is distinct from lower(substring(a.nome from '\.([A-Za-z0-9]{1,5})$')) then
    raise exception 'O nome precisa manter a extensão do arquivo (.%)', lower(substring(a.nome from '\.([A-Za-z0-9]{1,5})$'));
  end if;
  update public.arquivo_obra
     set nome = btrim(p_nome), categoria = p_categoria, descricao = nullif(btrim(p_descricao), ''), atualizado_em = now()
   where id = p_id;
end;
$$;

-- Tira o arquivo da obra e devolve o caminho, para o app apagar do Storage.
create or replace function public.excluir_arquivo_obra(p_id uuid)
returns text language plpgsql security definer set search_path = '' as $$
declare
  v_caminho text;
  v_projeto uuid;
begin
  select caminho, projeto_id into v_caminho, v_projeto from public.arquivo_obra where id = p_id;
  if v_caminho is null or not coalesce(app.pode_editar_projeto(v_projeto), false) then
    raise exception 'Arquivo não encontrado ou sem permissão' using errcode = '42501';
  end if;
  delete from public.arquivo_obra where id = p_id;
  return v_caminho;
end;
$$;

revoke all on function
  public.registrar_arquivo_obra(uuid, uuid, text, text, public.categoria_arquivo, bigint, text, text),
  public.editar_arquivo_obra(uuid, text, public.categoria_arquivo, text),
  public.excluir_arquivo_obra(uuid)
from public, anon;
grant execute on function
  public.registrar_arquivo_obra(uuid, uuid, text, text, public.categoria_arquivo, bigint, text, text),
  public.editar_arquivo_obra(uuid, text, public.categoria_arquivo, text),
  public.excluir_arquivo_obra(uuid)
to authenticated;

revoke all on function app.extensao_arquivo_permitida(text) from public, anon, authenticated;
grant execute on function app.extensao_arquivo_permitida(text) to authenticated;

-- -----------------------------------------------------------------------------
-- Storage: bucket privado "arquivos", caminho <projeto_id>/<arquivo_id>/<nome>
-- -----------------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('arquivos', 'arquivos', false, 52428800, null)
on conflict (id) do nothing;

-- Quem edita a obra envia e apaga; a segunda pasta precisa ser um uuid (id do arquivo) e a extensão, permitida.
create or replace function app.pode_mexer_arquivo_obra(p_nome text)
returns boolean language sql stable security definer set search_path = '' as $$
  select coalesce(
    app.uuid_da_pasta(p_nome, 2) is not null
    and array_length(storage.foldername(p_nome), 1) = 2
    and app.extensao_arquivo_permitida(p_nome)
    and app.pode_editar_projeto(app.uuid_da_pasta(p_nome, 1)),
  false);
$$;
revoke all on function app.pode_mexer_arquivo_obra(text) from public, anon, authenticated;
grant execute on function app.pode_mexer_arquivo_obra(text) to authenticated;

create policy arquivos_obra_ver on storage.objects for select to authenticated
  using (bucket_id = 'arquivos' and coalesce(app.pode_ver_projeto(app.uuid_da_pasta(name, 1)), false));
create policy arquivos_obra_enviar on storage.objects for insert to authenticated
  with check (bucket_id = 'arquivos' and app.pode_mexer_arquivo_obra(name));
create policy arquivos_obra_apagar on storage.objects for delete to authenticated
  using (bucket_id = 'arquivos' and app.pode_mexer_arquivo_obra(name));
