-- =============================================================================
-- Sprint 5 — RF-101 a 104: câmeras e fotos da obra.
--
-- Como a foto chega (PRD, "Como a foto chega à plataforma", modo A):
-- * Um AGENTE na rede da obra (mini PC, Raspberry ou um PC ligado) pede a foto
--   à câmera ou ao NVR pela rede local e envia por HTTPS para a função de borda
--   agente-cameras. Nenhuma porta da câmera fica aberta para a internet.
-- * O agente se identifica por um token (guardamos só o SHA-256). As funções
--   agente_* só rodam com service_role (a função de borda), nunca pelo app.
-- * Upload manual pelo celular serve de reserva (e para obra sem agente).
--
-- Senha da câmera: guardada no Vault do Supabase (cifrada com chave fora do
-- banco). A tabela só tem o id do segredo, que o app não lê (grant por coluna);
-- só o agente recebe a senha, pela função de borda.
--
-- Fotos no bucket privado "cameras", caminho <projeto_id>/<camera_id>/<arquivo>.
-- =============================================================================

create type public.origem_camera as enum ('agente', 'manual');

-- -----------------------------------------------------------------------------
-- Agente da obra
-- -----------------------------------------------------------------------------
create table public.agente_camera (
  id                 uuid primary key default gen_random_uuid(),
  empresa_id         uuid not null references public.empresa(id) on delete cascade,
  projeto_id         uuid not null references public.projeto(id) on delete cascade,
  nome               text not null check (length(btrim(nome)) between 2 and 80),
  token_hash         text not null unique check (token_hash ~ '^[0-9a-f]{64}$'),
  ativo              boolean not null default true,
  versao             text check (versao is null or length(versao) <= 40),
  ultimo_contato_em  timestamptz,
  criado_por         uuid references auth.users(id) on delete set null,
  criado_em          timestamptz not null default now()
);
create index agente_camera_projeto_idx on public.agente_camera (projeto_id);
create index agente_camera_empresa_idx on public.agente_camera (empresa_id);
create index agente_camera_criado_por_idx on public.agente_camera (criado_por);

-- O contato periódico do agente não vira registro de auditoria.
create trigger agente_camera_auditoria after insert or update or delete on public.agente_camera
  for each row execute function app.tg_auditoria('ultimo_contato_em,versao');

-- -----------------------------------------------------------------------------
-- Câmera
-- -----------------------------------------------------------------------------
create table public.camera (
  id                   uuid primary key default gen_random_uuid(),
  empresa_id           uuid not null references public.empresa(id) on delete cascade,
  projeto_id           uuid not null references public.projeto(id) on delete cascade,
  nome                 text not null check (length(btrim(nome)) between 2 and 80),
  origem               public.origem_camera not null,
  agente_id            uuid references public.agente_camera(id),
  -- Endereço da foto na rede da obra: http(s)://.../cgi-bin/snapshot.cgi?channel=1 ou rtsp://...
  endereco             text check (endereco is null or (length(endereco) <= 500 and endereco ~* '^(https?|rtsp)://[^\s]+$')),
  usuario              text check (usuario is null or length(usuario) <= 80),
  senha_id             uuid,  -- vault.secrets.id; o app não lê esta coluna
  tem_senha            boolean generated always as (senha_id is not null) stored,
  horarios             time[] not null default '{07:00,12:00,17:00}'
                         check (cardinality(horarios) between 1 and 4),
  ativa                boolean not null default true,
  ultima_foto_em       timestamptz,
  falhas_seguidas      integer not null default 0 check (falhas_seguidas >= 0),
  ultimo_erro          text check (ultimo_erro is null or length(ultimo_erro) <= 500),
  ultimo_erro_em       timestamptz,
  teste_pedido_em      timestamptz,
  teste_respondido_em  timestamptz,
  teste_caminho        text,
  teste_erro           text check (teste_erro is null or length(teste_erro) <= 500),
  criado_em            timestamptz not null default now(),
  atualizado_em        timestamptz not null default now(),
  constraint camera_agente_ck check (origem = 'manual' or (agente_id is not null and endereco is not null))
);
create index camera_projeto_idx on public.camera (projeto_id);
create index camera_empresa_idx on public.camera (empresa_id);
create index camera_agente_idx on public.camera (agente_id);

create trigger camera_atualizado_em before update on public.camera
  for each row execute function app.tg_atualizado_em();
-- Estado operacional (captura, teste, erros) muda o tempo todo e não é auditado.
create trigger camera_auditoria after insert or update or delete on public.camera
  for each row execute function app.tg_auditoria(
    'atualizado_em,ultima_foto_em,falhas_seguidas,ultimo_erro,ultimo_erro_em,teste_pedido_em,teste_respondido_em,teste_caminho,teste_erro');

-- -----------------------------------------------------------------------------
-- Foto
-- -----------------------------------------------------------------------------
create table public.foto_camera (
  id             uuid primary key default gen_random_uuid(),
  empresa_id     uuid not null references public.empresa(id) on delete cascade,
  projeto_id     uuid not null references public.projeto(id) on delete cascade,
  camera_id      uuid not null references public.camera(id) on delete cascade,
  caminho        text not null unique check (length(caminho) <= 300),
  capturada_em   timestamptz not null,
  data           date not null,  -- dia da captura no horário de Brasília
  origem         public.origem_camera not null,
  tamanho_bytes  integer check (tamanho_bytes is null or tamanho_bytes between 1 and 20000000),
  enviada_por    uuid references auth.users(id) on delete set null,
  criado_em      timestamptz not null default now()
);
create index foto_camera_camera_idx on public.foto_camera (camera_id, capturada_em desc);
create index foto_camera_projeto_idx on public.foto_camera (projeto_id, data);
create index foto_camera_empresa_idx on public.foto_camera (empresa_id);
create index foto_camera_enviada_por_idx on public.foto_camera (enviada_por);

create trigger foto_camera_auditoria after insert or update or delete on public.foto_camera
  for each row execute function app.tg_auditoria();

-- -----------------------------------------------------------------------------
-- RLS e grants: leitura para quem vê a obra; escrita só pelas funções
-- -----------------------------------------------------------------------------
alter table public.agente_camera enable row level security;
alter table public.camera        enable row level security;
alter table public.foto_camera   enable row level security;

create policy agente_camera_select on public.agente_camera for select to authenticated
  using (app.pode_ver_projeto(projeto_id));
create policy camera_select on public.camera for select to authenticated
  using (app.pode_ver_projeto(projeto_id));
create policy foto_camera_select on public.foto_camera for select to authenticated
  using (app.pode_ver_projeto(projeto_id));

revoke all on public.agente_camera, public.camera, public.foto_camera from anon, authenticated;
-- Sem token_hash e sem senha_id para o app.
grant select (id, empresa_id, projeto_id, nome, ativo, versao, ultimo_contato_em, criado_por, criado_em)
  on public.agente_camera to authenticated;
grant select (id, empresa_id, projeto_id, nome, origem, agente_id, endereco, usuario, tem_senha, horarios, ativa,
              ultima_foto_em, falhas_seguidas, ultimo_erro, ultimo_erro_em, teste_pedido_em, teste_respondido_em,
              teste_caminho, teste_erro, criado_em, atualizado_em)
  on public.camera to authenticated;
grant select on public.foto_camera to authenticated;

-- -----------------------------------------------------------------------------
-- Funções do app (engenheiro configura; engenheiro e mestre mandam foto manual)
-- -----------------------------------------------------------------------------

-- Horários "07:00" (texto ou time) → time[] ordenado e sem repetição.
create or replace function app.horarios_camera(p jsonb)
returns time[] language plpgsql immutable set search_path = '' as $$
declare
  v time[];
begin
  if p is null or jsonb_typeof(p) <> 'array' then
    raise exception 'Informe os horários da foto';
  end if;
  begin
    select array_agg(distinct h order by h) into v
      from (select (x #>> '{}')::time as h from jsonb_array_elements(p) x) t;
  exception when others then
    raise exception 'Horário inválido: use HH:MM, de 00:00 a 23:59';
  end;
  if exists (select 1 from unnest(v) h where h >= time '24:00') then
    raise exception 'Horário inválido: use HH:MM, de 00:00 a 23:59';
  end if;
  if v is null or cardinality(v) < 1 or cardinality(v) > 4 then
    raise exception 'Escolha de 1 a 4 horários por dia';
  end if;
  return v;
end;
$$;

-- Cria o agente da obra e devolve o token, que aparece uma única vez.
create or replace function public.criar_agente_camera(p_projeto_id uuid, p_nome text)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_empresa uuid;
  v_token   text := 'obra_' || encode(extensions.gen_random_bytes(24), 'hex');
  v_id      uuid;
begin
  if not app.pode_editar_projeto(p_projeto_id) then
    raise exception 'Só o engenheiro da obra ou o admin cadastram o agente' using errcode = '42501';
  end if;
  select empresa_id into v_empresa from public.projeto where id = p_projeto_id;
  insert into public.agente_camera (empresa_id, projeto_id, nome, token_hash, criado_por)
  values (v_empresa, p_projeto_id, btrim(coalesce(p_nome, '')), encode(extensions.digest(v_token, 'sha256'), 'hex'), auth.uid())
  returning id into v_id;
  return jsonb_build_object('id', v_id, 'token', v_token);
end;
$$;

-- Desliga o agente (token perdido, computador trocado). Para voltar, crie outro.
create or replace function public.revogar_agente_camera(p_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare
  v_projeto uuid;
begin
  select projeto_id into v_projeto from public.agente_camera where id = p_id;
  if v_projeto is null or not app.pode_editar_projeto(v_projeto) then
    raise exception 'Agente não encontrado ou sem permissão' using errcode = '42501';
  end if;
  update public.agente_camera set ativo = false where id = p_id;
end;
$$;

-- Cria (p_id nulo) ou altera uma câmera. p_senha: nulo mantém; '' apaga; texto troca.
-- p_campos: nome, origem (só ao criar), agente_id, endereco, usuario, horarios, ativa.
create or replace function public.salvar_camera(p_id uuid, p_projeto_id uuid, p_campos jsonb, p_senha text default null)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v        public.camera;
  v_empresa uuid;
  v_origem  public.origem_camera;
  v_agente  uuid;
  v_secreto uuid;
begin
  if not app.pode_editar_projeto(p_projeto_id) then
    raise exception 'Só o engenheiro da obra ou o admin configuram câmeras' using errcode = '42501';
  end if;
  select empresa_id into v_empresa from public.projeto where id = p_projeto_id;
  p_campos := coalesce(p_campos, '{}'::jsonb);

  if p_id is not null then
    select * into v from public.camera where id = p_id and projeto_id = p_projeto_id;
    if v.id is null then
      raise exception 'Câmera não encontrada nesta obra';
    end if;
    v_origem := v.origem;
  else
    v_origem := coalesce((p_campos ->> 'origem')::public.origem_camera, 'manual');
  end if;

  v_agente := case when p_campos ? 'agente_id' then nullif(p_campos ->> 'agente_id', '')::uuid else v.agente_id end;
  if v_origem = 'agente' and (v_agente is null or not exists (
       select 1 from public.agente_camera a where a.id = v_agente and a.projeto_id = p_projeto_id and a.ativo)) then
    raise exception 'Escolha um agente ativo desta obra';
  end if;
  if v_origem = 'manual' then
    v_agente := null;
  end if;

  if p_id is null then
    insert into public.camera (empresa_id, projeto_id, nome, origem, agente_id, endereco, usuario, horarios, ativa)
    values (
      v_empresa, p_projeto_id, btrim(coalesce(p_campos ->> 'nome', '')), v_origem, v_agente,
      case when v_origem = 'agente' then nullif(btrim(p_campos ->> 'endereco'), '') end,
      case when v_origem = 'agente' then nullif(btrim(p_campos ->> 'usuario'), '') end,
      case when p_campos ? 'horarios' then app.horarios_camera(p_campos -> 'horarios') else '{07:00,12:00,17:00}' end,
      coalesce((p_campos ->> 'ativa')::boolean, true)
    )
    returning * into v;
  else
    update public.camera set
      nome      = case when p_campos ? 'nome' then btrim(p_campos ->> 'nome') else nome end,
      agente_id = v_agente,
      endereco  = case when v_origem = 'manual' then null
                       when p_campos ? 'endereco' then nullif(btrim(p_campos ->> 'endereco'), '') else endereco end,
      usuario   = case when v_origem = 'manual' then null
                       when p_campos ? 'usuario' then nullif(btrim(p_campos ->> 'usuario'), '') else usuario end,
      horarios  = case when p_campos ? 'horarios' then app.horarios_camera(p_campos -> 'horarios') else horarios end,
      ativa     = coalesce((p_campos ->> 'ativa')::boolean, ativa)
    where id = v.id
    returning * into v;
  end if;

  -- Senha no Vault (cifrada); a tabela guarda só o id do segredo.
  if v_origem = 'manual' or p_senha = '' then
    if v.senha_id is not null then
      delete from vault.secrets where id = v.senha_id;
      update public.camera set senha_id = null where id = v.id;
    end if;
  elsif p_senha is not null then
    if length(p_senha) > 128 then
      raise exception 'Senha longa demais (até 128 caracteres)';
    end if;
    if v.senha_id is null then
      v_secreto := vault.create_secret(p_senha, 'camera:' || v.id::text, 'Senha da câmera ' || v.nome);
      update public.camera set senha_id = v_secreto where id = v.id;
    else
      perform vault.update_secret(v.senha_id, p_senha);
    end if;
  end if;
  return v.id;
end;
$$;

-- Pede ao agente uma foto de teste (ele responde em até 1 minuto).
create or replace function public.pedir_teste_camera(p_id uuid)
returns void language plpgsql security definer set search_path = '' as $$
declare
  v public.camera;
begin
  select * into v from public.camera where id = p_id;
  if v.id is null or not app.pode_editar_projeto(v.projeto_id) then
    raise exception 'Câmera não encontrada ou sem permissão' using errcode = '42501';
  end if;
  if v.origem <> 'agente' then
    raise exception 'Só câmeras ligadas a um agente fazem teste de foto';
  end if;
  update public.camera
     set teste_pedido_em = now(), teste_respondido_em = null, teste_erro = null
   where id = p_id;
end;
$$;

-- Foto enviada pelo app (celular), depois do upload no Storage. Repetir o mesmo id não duplica.
create or replace function public.registrar_foto_camera(
  p_id           uuid,
  p_camera_id    uuid,
  p_caminho      text,
  p_capturada_em timestamptz default null,
  p_tamanho      integer default null
)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v       public.camera;
  v_quando timestamptz := coalesce(p_capturada_em, now());
begin
  select * into v from public.camera where id = p_camera_id;
  if v.id is null or not app.pode_apontar_campo(v.projeto_id) then
    raise exception 'Câmera não encontrada ou sem permissão' using errcode = '42501';
  end if;
  if exists (select 1 from public.foto_camera where id = p_id) then
    return p_id;
  end if;
  if p_caminho is null or p_caminho not like v.projeto_id::text || '/' || v.id::text || '/%' or p_caminho like '%..%' then
    raise exception 'Caminho da foto não pertence a esta câmera';
  end if;
  if v_quando > now() + interval '5 minutes' then
    raise exception 'A foto não pode ser de um horário futuro';
  end if;

  insert into public.foto_camera (id, empresa_id, projeto_id, camera_id, caminho, capturada_em, data, origem, tamanho_bytes, enviada_por)
  values (p_id, v.empresa_id, v.projeto_id, v.id, p_caminho, v_quando, (v_quando at time zone 'America/Sao_Paulo')::date,
          'manual', p_tamanho, auth.uid());
  update public.camera set ultima_foto_em = greatest(coalesce(ultima_foto_em, v_quando), v_quando) where id = v.id;
  return p_id;
end;
$$;

-- Tira a foto da galeria (ex.: imagem errada ou com pessoa identificável) e devolve o caminho do arquivo.
create or replace function public.excluir_foto_camera(p_id uuid)
returns text language plpgsql security definer set search_path = '' as $$
declare
  v_caminho text;
  v_projeto uuid;
begin
  select caminho, projeto_id into v_caminho, v_projeto from public.foto_camera where id = p_id;
  if v_caminho is null or not app.pode_editar_projeto(v_projeto) then
    raise exception 'Foto não encontrada ou sem permissão' using errcode = '42501';
  end if;
  delete from public.foto_camera where id = p_id;
  return v_caminho;
end;
$$;

revoke all on function
  app.horarios_camera(jsonb),
  public.criar_agente_camera(uuid, text),
  public.revogar_agente_camera(uuid),
  public.salvar_camera(uuid, uuid, jsonb, text),
  public.pedir_teste_camera(uuid),
  public.registrar_foto_camera(uuid, uuid, text, timestamptz, integer),
  public.excluir_foto_camera(uuid)
from public, anon;
grant execute on function
  public.criar_agente_camera(uuid, text),
  public.revogar_agente_camera(uuid),
  public.salvar_camera(uuid, uuid, jsonb, text),
  public.pedir_teste_camera(uuid),
  public.registrar_foto_camera(uuid, uuid, text, timestamptz, integer),
  public.excluir_foto_camera(uuid)
to authenticated;

-- -----------------------------------------------------------------------------
-- Funções do agente: só a função de borda (service_role) chama; o token é conferido aqui
-- -----------------------------------------------------------------------------
create or replace function app.agente_do_token(p_token text)
returns public.agente_camera language sql stable security definer set search_path = '' as $$
  select * from public.agente_camera
   where token_hash = encode(extensions.digest(coalesce(p_token, ''), 'sha256'), 'hex') and ativo;
$$;

-- Câmeras do agente, com a senha (do Vault). Também marca o contato. Token inválido: null.
create or replace function public.agente_config(p_token text, p_versao text default null)
returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  a public.agente_camera := app.agente_do_token(p_token);
begin
  if a.id is null then
    return null;
  end if;
  update public.agente_camera set ultimo_contato_em = now(), versao = left(nullif(btrim(p_versao), ''), 40) where id = a.id;
  return jsonb_build_object(
    'agente_id', a.id,
    'projeto_id', a.projeto_id,
    'fuso', 'America/Sao_Paulo',
    'cameras', coalesce((
      select jsonb_agg(jsonb_build_object(
               'id', c.id,
               'nome', c.nome,
               'endereco', c.endereco,
               'usuario', c.usuario,
               'senha', s.decrypted_secret,
               'horarios', (select jsonb_agg(to_char(h, 'HH24:MI') order by h) from unnest(c.horarios) h),
               'teste', c.teste_pedido_em is not null and c.teste_respondido_em is null
             ) order by c.nome)
        from public.camera c
        left join vault.decrypted_secrets s on s.id = c.senha_id
       where c.agente_id = a.id and c.ativa and c.origem = 'agente'
    ), '[]'::jsonb)
  );
end;
$$;

-- Pasta onde o agente pode gravar a foto desta câmera (<projeto>/<camera>), ou null.
create or replace function public.agente_pasta_camera(p_token text, p_camera_id uuid)
returns text language sql stable security definer set search_path = '' as $$
  select c.projeto_id::text || '/' || c.id::text
    from public.camera c
   where c.id = p_camera_id and c.agente_id = (app.agente_do_token(p_token)).id;
$$;

-- Foto que o agente já gravou no Storage. Teste: só responde o pedido, sem entrar na galeria.
create or replace function public.agente_registrar_foto(
  p_token        text,
  p_camera_id    uuid,
  p_caminho      text,
  p_capturada_em timestamptz,
  p_tamanho      integer default null,
  p_teste        boolean default false
)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_pasta text := public.agente_pasta_camera(p_token, p_camera_id);
  v       public.camera;
  v_id    uuid;
begin
  if v_pasta is null then
    raise exception 'Agente sem acesso a esta câmera' using errcode = '42501';
  end if;
  if p_caminho is null or p_caminho not like v_pasta || '/%' or p_caminho like '%..%' then
    raise exception 'Caminho da foto não pertence a esta câmera';
  end if;
  select * into v from public.camera where id = p_camera_id;
  if p_teste then
    update public.camera set teste_respondido_em = now(), teste_caminho = p_caminho, teste_erro = null where id = v.id;
    return null;
  end if;
  if p_capturada_em is null or p_capturada_em > now() + interval '5 minutes' then
    raise exception 'Horário da foto inválido';
  end if;
  insert into public.foto_camera (empresa_id, projeto_id, camera_id, caminho, capturada_em, data, origem, tamanho_bytes)
  values (v.empresa_id, v.projeto_id, v.id, p_caminho, p_capturada_em, (p_capturada_em at time zone 'America/Sao_Paulo')::date,
          'agente', p_tamanho)
  on conflict (caminho) do nothing
  returning id into v_id;
  update public.camera
     set ultima_foto_em = greatest(coalesce(ultima_foto_em, p_capturada_em), p_capturada_em),
         falhas_seguidas = 0
   where id = v.id;
  return v_id;
end;
$$;

-- Falha de captura. Devolve quantas falhas seguidas a câmera tem (a tela alerta a partir de 2).
create or replace function public.agente_registrar_falha(p_token text, p_camera_id uuid, p_erro text, p_teste boolean default false)
returns integer language plpgsql security definer set search_path = '' as $$
declare
  v_erro text := left(coalesce(nullif(btrim(p_erro), ''), 'Falha sem detalhe'), 500);
  v_n    integer;
begin
  if public.agente_pasta_camera(p_token, p_camera_id) is null then
    raise exception 'Agente sem acesso a esta câmera' using errcode = '42501';
  end if;
  if p_teste then
    update public.camera set teste_respondido_em = now(), teste_erro = v_erro, teste_caminho = null
     where id = p_camera_id returning falhas_seguidas into v_n;
    return v_n;
  end if;
  update public.camera
     set falhas_seguidas = falhas_seguidas + 1, ultimo_erro = v_erro, ultimo_erro_em = now()
   where id = p_camera_id
  returning falhas_seguidas into v_n;
  return v_n;
end;
$$;

revoke all on function
  app.agente_do_token(text),
  public.agente_config(text, text),
  public.agente_pasta_camera(text, uuid),
  public.agente_registrar_foto(text, uuid, text, timestamptz, integer, boolean),
  public.agente_registrar_falha(text, uuid, text, boolean)
from public, anon, authenticated;
grant execute on function
  public.agente_config(text, text),
  public.agente_pasta_camera(text, uuid),
  public.agente_registrar_foto(text, uuid, text, timestamptz, integer, boolean),
  public.agente_registrar_falha(text, uuid, text, boolean)
to service_role;

-- -----------------------------------------------------------------------------
-- Storage: bucket privado "cameras", caminho <projeto_id>/<camera_id>/<arquivo>
-- -----------------------------------------------------------------------------
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('cameras', 'cameras', false, 10485760, array['image/jpeg', 'image/png', 'image/webp'])
on conflict (id) do nothing;

-- Pode enviar foto para este caminho? Engenheiro/mestre, câmera da mesma obra.
create or replace function app.pode_enviar_foto_camera(p_nome text)
returns boolean language sql stable security definer set search_path = '' as $$
  select coalesce((
    select app.pode_apontar_campo(c.projeto_id)
      from public.camera c
     where c.id = app.uuid_da_pasta(p_nome, 2)
       and c.projeto_id = app.uuid_da_pasta(p_nome, 1)
  ), false);
$$;
revoke all on function app.pode_enviar_foto_camera(text) from public;
grant execute on function app.pode_enviar_foto_camera(text) to authenticated;

create policy cameras_fotos_ver on storage.objects for select to authenticated
  using (bucket_id = 'cameras' and coalesce(app.pode_ver_projeto(app.uuid_da_pasta(name, 1)), false));
create policy cameras_fotos_enviar on storage.objects for insert to authenticated
  with check (bucket_id = 'cameras' and app.pode_enviar_foto_camera(name));
create policy cameras_fotos_apagar on storage.objects for delete to authenticated
  using (bucket_id = 'cameras' and coalesce(app.pode_editar_projeto(app.uuid_da_pasta(name, 1)), false));
