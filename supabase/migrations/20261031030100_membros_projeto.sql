-- =============================================================================
-- RF-004 — quem acessa cada projeto e com qual papel.
-- E-mails ficam em auth.users (fora do alcance do cliente); por isso a lista e
-- o convite passam por funções que checam a permissão antes.
-- =============================================================================

-- Pessoas com acesso ao projeto: vínculos explícitos + administradores da empresa.
create or replace function public.membros_do_projeto(p_projeto_id uuid)
returns table (
  usuario_id     uuid,
  email          text,
  papel          public.papel_projeto,
  admin_empresa  boolean,
  voce           boolean
)
language sql stable security definer set search_path = '' as $$
  select u.id, u.email::text, mp.papel, coalesce(me.papel = 'admin', false), u.id = auth.uid()
    from public.projeto p
    join public.membro_projeto mp on mp.projeto_id = p.id
    join auth.users u on u.id = mp.usuario_id
    left join public.membro_empresa me on me.empresa_id = p.empresa_id and me.usuario_id = u.id
   where p.id = p_projeto_id and app.pode_ver_projeto(p_projeto_id)
  union all
  select u.id, u.email::text, null, true, u.id = auth.uid()
    from public.projeto p
    join public.membro_empresa me on me.empresa_id = p.empresa_id and me.papel = 'admin'
    join auth.users u on u.id = me.usuario_id
   where p.id = p_projeto_id and app.pode_ver_projeto(p_projeto_id)
     and not exists (select 1 from public.membro_projeto mp
                      where mp.projeto_id = p.id and mp.usuario_id = me.usuario_id)
  order by 4 desc, 2;
$$;

-- Dá acesso a quem já tem conta. Se a pessoa ainda não é da empresa, só um
-- administrador pode trazê-la (entra como membro).
create or replace function public.adicionar_membro_projeto(
  p_projeto_id uuid,
  p_email      text,
  p_papel      public.papel_projeto default 'leitura'
)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_usuario uuid;
  v_empresa uuid;
begin
  if not app.pode_editar_projeto(p_projeto_id) then
    raise exception 'Só engenheiros do projeto e administradores dão acesso' using errcode = '42501';
  end if;

  select empresa_id into v_empresa from public.projeto where id = p_projeto_id;

  select id into v_usuario from auth.users where lower(email) = lower(btrim(p_email));
  if v_usuario is null then
    raise exception 'Nenhuma conta com o e-mail %. Peça para a pessoa criar a conta no app e tente de novo.', btrim(p_email)
      using errcode = 'P0002';
  end if;

  if not app.usuario_na_empresa(v_usuario, v_empresa) then
    if app.e_admin_empresa(v_empresa) then
      insert into public.membro_empresa (empresa_id, usuario_id, papel) values (v_empresa, v_usuario, 'membro');
    else
      raise exception 'Essa pessoa ainda não faz parte da empresa. Peça a um administrador para adicioná-la.'
        using errcode = '42501';
    end if;
  end if;

  insert into public.membro_projeto (projeto_id, usuario_id, empresa_id, papel)
  values (p_projeto_id, v_usuario, v_empresa, p_papel)
  on conflict (projeto_id, usuario_id) do update set papel = excluded.papel;

  return v_usuario;
end;
$$;

revoke all on function
  public.membros_do_projeto(uuid),
  public.adicionar_membro_projeto(uuid, text, public.papel_projeto)
from public, anon;
grant execute on function
  public.membros_do_projeto(uuid),
  public.adicionar_membro_projeto(uuid, text, public.papel_projeto)
to authenticated;
