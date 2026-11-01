-- Revisão geral (01/11/2026).
--
-- 1. salvar_camera: a câmera de um agente revogado podia ficar travada (nem desligar nem renomear
--    sem escolher outro agente). Agora o agente precisa estar ativo só se a câmera fica ligada.
-- 2. A política de UPDATE de projeto confere a obra (pela linha antiga), não a empresa nova: o
--    engenheiro conseguia mudar projeto.empresa_id para qualquer empresa e entregar a obra a ela.
--    Agora as chaves (id, empresa_id) de projeto, item_estoque, empreiteira e empresa não mudam.
-- 3. Funções de trigger em app tinham EXECUTE para PUBLIC (padrão do Postgres). Não dá para
--    chamá-las fora de um trigger, mas fica fechado por higiene; e as próximas funções de app
--    nascem sem EXECUTE para PUBLIC (quem precisar recebe grant explícito, como já é feito).

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
  v_ativa   boolean;
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
  v_ativa  := coalesce((p_campos ->> 'ativa')::boolean, v.ativa, true);
  -- O agente é sempre desta obra; precisa estar ativo só se a câmera fica ligada. Assim dá para
  -- desligar ou renomear a câmera de um agente revogado sem escolher outro antes.
  if v_origem = 'agente' and (v_agente is null or not exists (
       select 1 from public.agente_camera a
        where a.id = v_agente and a.projeto_id = p_projeto_id and (a.ativo or not v_ativa))) then
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
      v_ativa
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
      ativa     = v_ativa
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

-- O grant de salvar_camera continua o mesmo (create or replace mantém os privilégios).

-- Chaves que não mudam depois de criadas (colunas em TG_ARGV).
create or replace function app.tg_chaves_fixas()
returns trigger language plpgsql set search_path = '' as $$
declare
  c text;
begin
  foreach c in array tg_argv loop
    if (to_jsonb(new) -> c) is distinct from (to_jsonb(old) -> c) then
      raise exception 'O campo % não pode ser alterado', c using errcode = '42501';
    end if;
  end loop;
  return new;
end;
$$;

create trigger projeto_chaves_fixas before update on public.projeto
  for each row execute function app.tg_chaves_fixas('id', 'empresa_id');
create trigger item_estoque_chaves_fixas before update on public.item_estoque
  for each row execute function app.tg_chaves_fixas('id', 'empresa_id');
create trigger empreiteira_chaves_fixas before update on public.empreiteira
  for each row execute function app.tg_chaves_fixas('id', 'empresa_id');
create trigger empresa_chaves_fixas before update on public.empresa
  for each row execute function app.tg_chaves_fixas('id');

do $$
declare
  f regprocedure;
begin
  for f in
    select p.oid::regprocedure from pg_proc p
     where p.pronamespace = 'app'::regnamespace and p.prorettype = 'trigger'::regtype
  loop
    execute format('revoke all on function %s from public, anon, authenticated', f);
  end loop;
end;
$$;

alter default privileges in schema app revoke execute on functions from public;
