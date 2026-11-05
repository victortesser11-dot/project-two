-- =============================================================================
-- Justificativa de atraso (reunião com a engenharia, 03/11): tarefa atrasada pede o motivo.
--
-- * justificativa_atraso: causa (chuva, material, mão de obra, equipamento, projeto, cliente,
--   fornecedor, outro), dias de impacto (opcional) e descrição. Registro imutável: errou, registra
--   outra (a mais recente vale). Serve de histórico para negociar prazo com o cliente.
-- * Quem aponta no campo justifica (engenheiro e mestre); todos da obra leem.
-- * Os alertas (tarefa atrasada, chuva prevista, material acabando, medição vencida...) são calculados
--   na hora pelo app a partir dos dados da obra; só a justificativa precisa ficar gravada.
-- =============================================================================

create type public.causa_atraso as enum ('chuva', 'material', 'mao_de_obra', 'equipamento', 'projeto', 'cliente', 'fornecedor', 'outro');

create table public.justificativa_atraso (
  id               uuid primary key default gen_random_uuid(),
  empresa_id       uuid not null references public.empresa(id) on delete cascade,
  projeto_id       uuid not null references public.projeto(id) on delete cascade,
  tarefa_id        uuid not null references public.eap_item(id) on delete cascade,
  causa            public.causa_atraso not null,
  dias_impacto     integer check (dias_impacto is null or dias_impacto between 0 and 365),
  descricao        text not null check (length(btrim(descricao)) between 3 and 1000),
  registrado_por   uuid references auth.users(id) on delete set null,
  registrado_nome  text,
  criado_em        timestamptz not null default now()
);
create index justificativa_atraso_projeto_idx on public.justificativa_atraso (projeto_id, criado_em desc);
create index justificativa_atraso_tarefa_idx on public.justificativa_atraso (tarefa_id);
create index justificativa_atraso_empresa_idx on public.justificativa_atraso (empresa_id);
create index justificativa_atraso_registrado_por_idx on public.justificativa_atraso (registrado_por);

create trigger justificativa_atraso_auditoria after insert or update or delete on public.justificativa_atraso
  for each row execute function app.tg_auditoria();

create or replace function public.justificar_atraso(p_tarefa_id uuid, p_causa public.causa_atraso, p_descricao text, p_dias_impacto integer default null)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  t      public.eap_item;
  v_nome text;
  v_id   uuid;
begin
  select * into t from public.eap_item where id = p_tarefa_id;
  if t.id is null or not coalesce(app.pode_apontar_campo(t.projeto_id), false) then
    raise exception 'Tarefa não encontrada ou sem permissão para justificar' using errcode = '42501';
  end if;
  if t.tipo <> 'tarefa' then
    raise exception 'Justifique o atraso nas tarefas; a etapa soma as de dentro';
  end if;
  if p_causa is null then
    raise exception 'Escolha a causa do atraso';
  end if;
  if length(btrim(coalesce(p_descricao, ''))) < 3 then
    raise exception 'Descreva o que aconteceu';
  end if;
  select u.email into v_nome from auth.users u where u.id = auth.uid();
  insert into public.justificativa_atraso (empresa_id, projeto_id, tarefa_id, causa, dias_impacto, descricao, registrado_por, registrado_nome)
  values (t.empresa_id, t.projeto_id, t.id, p_causa, p_dias_impacto, btrim(p_descricao), auth.uid(), v_nome)
  returning id into v_id;
  return v_id;
end;
$$;

alter table public.justificativa_atraso enable row level security;
create policy justificativa_atraso_select on public.justificativa_atraso for select to authenticated
  using (app.pode_ver_projeto(projeto_id));
grant select on public.justificativa_atraso to authenticated;

revoke all on function public.justificar_atraso(uuid, public.causa_atraso, text, integer) from public, anon;
grant execute on function public.justificar_atraso(uuid, public.causa_atraso, text, integer) to authenticated;
