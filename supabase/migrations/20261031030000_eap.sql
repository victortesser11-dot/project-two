-- =============================================================================
-- Sprint 1 — EAP (estrutura analítica do projeto): etapas e tarefas em árvore.
--
-- * Etapas agrupam; tarefas são as folhas e guardam unidade, quantidade,
--   custo previsto e datas. Etapas somam as tarefas de dentro (eap_do_projeto).
-- * Toda escrita passa pelas funções abaixo (regra 3 do CLAUDE.md); o cliente
--   só tem SELECT. O trigger de integridade é a garantia final: pai no mesmo
--   projeto, só etapa tem filhos, sem ciclo e no máximo 6 níveis.
-- * O código hierárquico (1.2.3) é calculado da posição, não guardado.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Correção: funções de permissão nunca devolvem NULL.
-- Sem papel, papel_no_projeto() é NULL e "NULL = 'engenheiro'" também é NULL;
-- num "if not ..." em PL/pgSQL isso não bloqueia. As políticas de RLS já
-- tratavam NULL como falso, mas as funções de escrita precisam de false.
-- -----------------------------------------------------------------------------
create or replace function app.pode_editar_projeto(p_projeto uuid)
returns boolean language sql stable security definer set search_path = '' as $$
  select coalesce(app.papel_no_projeto(p_projeto) = 'engenheiro', false);
$$;

-- -----------------------------------------------------------------------------
-- Auditoria: permite ignorar colunas de serviço (ex.: reordenação de irmãos)
-- -----------------------------------------------------------------------------
create or replace function app.tg_auditoria()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  v_linha   jsonb  := to_jsonb(coalesce(new, old));
  v_empresa uuid   := coalesce((v_linha ->> 'empresa_id')::uuid, (v_linha ->> 'id')::uuid);
  v_id      text   := coalesce(
                        v_linha ->> 'id',
                        concat_ws(':', v_linha ->> 'projeto_id', v_linha ->> 'empresa_id', v_linha ->> 'usuario_id'));
  -- Argumento opcional do trigger: colunas separadas por vírgula que, sozinhas, não geram registro.
  v_ignorar text[] := case when tg_nargs > 0 then string_to_array(tg_argv[0], ',') else '{}'::text[] end;
begin
  if tg_op = 'UPDATE' and (to_jsonb(old) - v_ignorar) = (to_jsonb(new) - v_ignorar) then
    return new;
  end if;

  insert into public.audit_log (empresa_id, tabela, registro_id, acao, antes, depois, usuario_id)
  values (
    v_empresa,
    tg_table_name,
    v_id,
    tg_op,
    case when tg_op in ('UPDATE', 'DELETE') then to_jsonb(old) end,
    case when tg_op in ('INSERT', 'UPDATE') then to_jsonb(new) end,
    auth.uid()
  );
  return coalesce(new, old);
end;
$$;

-- -----------------------------------------------------------------------------
-- Tabela
-- -----------------------------------------------------------------------------
create type public.tipo_item_eap as enum ('etapa', 'tarefa');

create table public.eap_item (
  id               uuid primary key default gen_random_uuid(),
  empresa_id       uuid not null references public.empresa(id) on delete cascade,
  projeto_id       uuid not null references public.projeto(id) on delete cascade,
  pai_id           uuid references public.eap_item(id) on delete cascade,
  ordem            integer not null check (ordem >= 0),
  tipo             public.tipo_item_eap not null,
  nome             text not null check (length(btrim(nome)) between 1 and 300),
  unidade          text check (unidade is null or length(btrim(unidade)) between 1 and 20),
  quantidade       numeric(16, 4) check (quantidade is null or quantidade >= 0),
  custo_previsto   numeric(16, 2) check (custo_previsto is null or custo_previsto >= 0),
  inicio_previsto  date,
  fim_previsto     date,
  codigo_externo   text check (codigo_externo is null or length(codigo_externo) <= 40),
  criado_em        timestamptz not null default now(),
  atualizado_em    timestamptz not null default now(),
  constraint eap_item_datas_ck check (
    fim_previsto is null or inicio_previsto is null or fim_previsto >= inicio_previsto),
  -- Etapa não tem valores próprios: soma as tarefas de dentro.
  constraint eap_item_etapa_sem_valores_ck check (
    tipo = 'tarefa' or (unidade is null and quantidade is null and custo_previsto is null
                        and inicio_previsto is null and fim_previsto is null)),
  -- Posição única entre irmãos (raiz incluída). Checada no fim de cada comando,
  -- para permitir deslocar vários irmãos de uma vez.
  constraint eap_item_posicao_uk unique nulls not distinct (projeto_id, pai_id, ordem)
    deferrable initially immediate
);
create index eap_item_pai_idx on public.eap_item (pai_id);

comment on column public.eap_item.codigo_externo is 'Código do item na planilha ou no MS Project de origem (rastreabilidade).';

-- -----------------------------------------------------------------------------
-- Integridade da árvore
-- -----------------------------------------------------------------------------
create or replace function app.tg_eap_item_integridade()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  v_pai_projeto uuid;
  v_pai_tipo    public.tipo_item_eap;
  v_nivel       integer := 1;
  v_altura      integer := 0;
  v_ciclo       boolean := false;
begin
  if tg_op = 'UPDATE' and new.projeto_id <> old.projeto_id then
    raise exception 'Um item da EAP não pode mudar de projeto';
  end if;

  -- empresa sempre vem do projeto (não confia no cliente)
  select p.empresa_id into new.empresa_id from public.projeto p where p.id = new.projeto_id;
  if new.empresa_id is null then
    raise exception 'Projeto % não encontrado', new.projeto_id;
  end if;

  if new.pai_id is not null then
    if new.pai_id = new.id then
      raise exception 'Um item não pode ficar dentro dele mesmo';
    end if;

    select e.projeto_id, e.tipo into v_pai_projeto, v_pai_tipo
      from public.eap_item e where e.id = new.pai_id;
    if v_pai_projeto is distinct from new.projeto_id then
      raise exception 'Etapa de destino não encontrada neste projeto';
    end if;
    if v_pai_tipo <> 'etapa' then
      raise exception 'Só etapas podem ter itens dentro. Transforme o item de destino em etapa antes.';
    end if;

    -- Sobe a cadeia a partir do novo pai: mede o nível e detecta ciclo.
    with recursive acima as (
      select e.id, e.pai_id, 1 as n from public.eap_item e where e.id = new.pai_id
      union all
      select e.id, e.pai_id, a.n + 1
        from public.eap_item e join acima a on e.id = a.pai_id
       where a.n < 64
    )
    select max(a.n) + 1, coalesce(bool_or(a.id = new.id), false)
      into v_nivel, v_ciclo
      from acima a;

    if v_ciclo then
      raise exception 'Não dá para colocar uma etapa dentro dela mesma';
    end if;
  end if;

  -- Ao mover um item que tem filhos, a subárvore inteira desce junto.
  if tg_op = 'UPDATE' then
    with recursive abaixo as (
      select e.id, 1 as n from public.eap_item e where e.pai_id = new.id
      union all
      select e.id, b.n + 1
        from public.eap_item e join abaixo b on e.pai_id = b.id
       where b.n < 64
    )
    select coalesce(max(b.n), 0) into v_altura from abaixo b;

    if new.tipo = 'tarefa' and old.tipo = 'etapa' and v_altura > 0 then
      raise exception 'Esta etapa tem itens dentro e não pode virar tarefa';
    end if;
  end if;

  if v_nivel + v_altura > 6 then
    raise exception 'A EAP aceita no máximo 6 níveis';
  end if;

  return new;
end;
$$;

create trigger eap_item_integridade
  before insert or update of pai_id, tipo, projeto_id, empresa_id on public.eap_item
  for each row execute function app.tg_eap_item_integridade();

create trigger eap_item_atualizado_em before update on public.eap_item
  for each row execute function app.tg_atualizado_em();

-- Reordenar irmãos muda só "ordem"/"atualizado_em": não vira linha de auditoria.
create trigger eap_item_auditoria after insert or update or delete on public.eap_item
  for each row execute function app.tg_auditoria('ordem,atualizado_em');

-- -----------------------------------------------------------------------------
-- RLS: leitura para quem vê o projeto; escrita só pelas funções
-- -----------------------------------------------------------------------------
alter table public.eap_item enable row level security;

create policy eap_item_select on public.eap_item for select to authenticated
  using (app.pode_ver_projeto(projeto_id));

revoke all on public.eap_item from anon, authenticated;
grant select on public.eap_item to authenticated;

-- -----------------------------------------------------------------------------
-- Leitura: árvore com código, nível e somatórios das etapas
-- -----------------------------------------------------------------------------
create or replace function public.eap_do_projeto(p_projeto_id uuid)
returns table (
  id              uuid,
  pai_id          uuid,
  posicao         integer,
  nivel           integer,
  codigo          text,
  tipo            public.tipo_item_eap,
  nome            text,
  unidade         text,
  quantidade      numeric,
  custo_previsto  numeric,
  inicio_previsto date,
  fim_previsto    date,
  codigo_externo  text,
  qtd_filhos      integer,
  qtd_tarefas     integer
)
language sql stable security invoker set search_path = '' as $$
  with recursive arvore as (
    select e.*, array[e.ordem] as caminho, array[e.id] as linha
      from public.eap_item e
     where e.projeto_id = p_projeto_id and e.pai_id is null
    union all
    select f.*, a.caminho || f.ordem, a.linha || f.id
      from public.eap_item f
      join arvore a on f.pai_id = a.id
  ),
  -- Cada tarefa soma em si mesma e em todos os ancestrais.
  somas as (
    select anc.id as item_id,
           sum(t.custo_previsto)    as custo,
           min(t.inicio_previsto)   as inicio,
           max(t.fim_previsto)      as fim,
           count(*)::integer        as tarefas
      from arvore t
      cross join lateral unnest(t.linha) as anc(id)
     where t.tipo = 'tarefa'
     group by anc.id
  ),
  filhos as (
    select a.pai_id as item_id, count(*)::integer as qtd
      from arvore a
     where a.pai_id is not null
     group by a.pai_id
  )
  select a.id,
         a.pai_id,
         (row_number() over (order by a.caminho))::integer,
         cardinality(a.caminho),
         array_to_string(a.caminho, '.'),
         a.tipo,
         a.nome,
         a.unidade,
         a.quantidade,
         case when a.tipo = 'etapa' then s.custo  else a.custo_previsto  end,
         case when a.tipo = 'etapa' then s.inicio else a.inicio_previsto end,
         case when a.tipo = 'etapa' then s.fim    else a.fim_previsto    end,
         a.codigo_externo,
         coalesce(fi.qtd, 0),
         coalesce(s.tarefas, 0)
    from arvore a
    left join somas  s  on s.item_id  = a.id
    left join filhos fi on fi.item_id = a.id
   order by a.caminho;
$$;

-- -----------------------------------------------------------------------------
-- Escrita
-- -----------------------------------------------------------------------------
create or replace function app.validar_campos_eap(p_campos jsonb)
returns void language plpgsql immutable set search_path = '' as $$
declare
  v_extra text;
begin
  if p_campos is null then
    return;
  end if;
  if jsonb_typeof(p_campos) <> 'object' then
    raise exception 'Campos da EAP precisam ser um objeto';
  end if;
  select string_agg(k, ', ') into v_extra
    from jsonb_object_keys(p_campos) as k
   where k not in ('nome', 'tipo', 'unidade', 'quantidade', 'custo_previsto',
                   'inicio_previsto', 'fim_previsto', 'codigo_externo');
  if v_extra is not null then
    raise exception 'Campos desconhecidos na EAP: %', v_extra;
  end if;
end;
$$;

-- Cria etapa ou tarefa. Sem posição, entra no fim dos irmãos.
create or replace function public.criar_item_eap(
  p_projeto_id uuid,
  p_tipo       public.tipo_item_eap,
  p_nome       text,
  p_pai_id     uuid    default null,
  p_campos     jsonb   default '{}'::jsonb,
  p_posicao    integer default null
)
returns uuid language plpgsql security definer set search_path = '' as $$
declare
  v_id  uuid := gen_random_uuid();
  v_qtd integer;
  v_pos integer;
begin
  if not app.pode_editar_projeto(p_projeto_id) then
    raise exception 'Sem permissão para editar a EAP deste projeto' using errcode = '42501';
  end if;
  perform app.validar_campos_eap(p_campos);

  select count(*) into v_qtd
    from public.eap_item
   where projeto_id = p_projeto_id and pai_id is not distinct from p_pai_id;
  v_pos := least(greatest(coalesce(p_posicao, v_qtd + 1), 1), v_qtd + 1);

  update public.eap_item set ordem = ordem + 1
   where projeto_id = p_projeto_id and pai_id is not distinct from p_pai_id and ordem >= v_pos;

  insert into public.eap_item (
    id, projeto_id, pai_id, ordem, tipo, nome,
    unidade, quantidade, custo_previsto, inicio_previsto, fim_previsto, codigo_externo
  ) values (
    v_id, p_projeto_id, p_pai_id, v_pos, p_tipo, btrim(p_nome),
    nullif(btrim(p_campos ->> 'unidade'), ''),
    nullif(p_campos ->> 'quantidade', '')::numeric,
    nullif(p_campos ->> 'custo_previsto', '')::numeric,
    nullif(p_campos ->> 'inicio_previsto', '')::date,
    nullif(p_campos ->> 'fim_previsto', '')::date,
    nullif(btrim(p_campos ->> 'codigo_externo'), '')
  );
  return v_id;
end;
$$;

-- Atualiza só as chaves presentes em p_campos (valor null limpa o campo).
create or replace function public.atualizar_item_eap(p_id uuid, p_campos jsonb)
returns void language plpgsql security definer set search_path = '' as $$
declare
  v      public.eap_item;
  v_tipo public.tipo_item_eap;
begin
  select * into v from public.eap_item where id = p_id;
  if not found or not app.pode_editar_projeto(v.projeto_id) then
    raise exception 'Item da EAP não encontrado ou sem permissão' using errcode = '42501';
  end if;
  perform app.validar_campos_eap(p_campos);

  v_tipo := coalesce((p_campos ->> 'tipo')::public.tipo_item_eap, v.tipo);

  if v_tipo = 'etapa' and v.tipo = 'tarefa' and (
       (case when p_campos ? 'unidade'         then nullif(btrim(p_campos ->> 'unidade'), '') else v.unidade end) is not null
    or (case when p_campos ? 'quantidade'      then nullif(p_campos ->> 'quantidade', '')      else v.quantidade::text end) is not null
    or (case when p_campos ? 'custo_previsto'  then nullif(p_campos ->> 'custo_previsto', '')  else v.custo_previsto::text end) is not null
    or (case when p_campos ? 'inicio_previsto' then nullif(p_campos ->> 'inicio_previsto', '') else v.inicio_previsto::text end) is not null
    or (case when p_campos ? 'fim_previsto'    then nullif(p_campos ->> 'fim_previsto', '')    else v.fim_previsto::text end) is not null
  ) then
    raise exception 'Etapas não têm unidade, quantidade, custo nem datas próprias: elas somam as tarefas de dentro. Limpe esses campos antes de transformar em etapa.';
  end if;

  update public.eap_item set
    tipo            = v_tipo,
    nome            = case when p_campos ? 'nome'            then btrim(p_campos ->> 'nome')                    else nome end,
    unidade         = case when p_campos ? 'unidade'         then nullif(btrim(p_campos ->> 'unidade'), '')    else unidade end,
    quantidade      = case when p_campos ? 'quantidade'      then nullif(p_campos ->> 'quantidade', '')::numeric else quantidade end,
    custo_previsto  = case when p_campos ? 'custo_previsto'  then nullif(p_campos ->> 'custo_previsto', '')::numeric else custo_previsto end,
    inicio_previsto = case when p_campos ? 'inicio_previsto' then nullif(p_campos ->> 'inicio_previsto', '')::date else inicio_previsto end,
    fim_previsto    = case when p_campos ? 'fim_previsto'    then nullif(p_campos ->> 'fim_previsto', '')::date   else fim_previsto end,
    codigo_externo  = case when p_campos ? 'codigo_externo'  then nullif(btrim(p_campos ->> 'codigo_externo'), '') else codigo_externo end
  where id = p_id;
end;
$$;

-- Move para dentro de outra etapa (ou para a raiz, com p_novo_pai_id null) na posição pedida.
create or replace function public.mover_item_eap(
  p_id          uuid,
  p_novo_pai_id uuid,
  p_posicao     integer default null
)
returns void language plpgsql security definer set search_path = '' as $$
declare
  v     public.eap_item;
  v_qtd integer;
  v_pos integer;
begin
  select * into v from public.eap_item where id = p_id;
  if not found or not app.pode_editar_projeto(v.projeto_id) then
    raise exception 'Item da EAP não encontrado ou sem permissão' using errcode = '42501';
  end if;

  -- 1) sai da posição atual e fecha o buraco entre os irmãos antigos
  update public.eap_item set ordem = 0 where id = v.id;
  update public.eap_item set ordem = ordem - 1
   where projeto_id = v.projeto_id and pai_id is not distinct from v.pai_id and ordem > v.ordem;

  -- 2) abre espaço entre os novos irmãos
  select count(*) into v_qtd
    from public.eap_item
   where projeto_id = v.projeto_id and pai_id is not distinct from p_novo_pai_id and id <> v.id;
  v_pos := least(greatest(coalesce(p_posicao, v_qtd + 1), 1), v_qtd + 1);

  update public.eap_item set ordem = ordem + 1
   where projeto_id = v.projeto_id and pai_id is not distinct from p_novo_pai_id
     and id <> v.id and ordem >= v_pos;

  -- 3) entra no lugar (o trigger valida pai, ciclo e profundidade)
  update public.eap_item set pai_id = p_novo_pai_id, ordem = v_pos where id = v.id;
end;
$$;

-- Atalhos de teclado/menu: subir, descer, recuar (sai da etapa) e avançar (entra no item de cima).
create or replace function public.reposicionar_item_eap(p_id uuid, p_acao text)
returns void language plpgsql security definer set search_path = '' as $$
declare
  v       public.eap_item;
  v_acima public.eap_item;
  v_pai   public.eap_item;
begin
  select * into v from public.eap_item where id = p_id;
  if not found or not app.pode_editar_projeto(v.projeto_id) then
    raise exception 'Item da EAP não encontrado ou sem permissão' using errcode = '42501';
  end if;

  case p_acao
    when 'subir' then
      if v.ordem > 1 then
        perform public.mover_item_eap(v.id, v.pai_id, v.ordem - 1);
      end if;

    when 'descer' then
      if exists (select 1 from public.eap_item
                  where projeto_id = v.projeto_id and pai_id is not distinct from v.pai_id
                    and ordem = v.ordem + 1) then
        perform public.mover_item_eap(v.id, v.pai_id, v.ordem + 1);
      end if;

    when 'avancar' then
      select * into v_acima from public.eap_item
       where projeto_id = v.projeto_id and pai_id is not distinct from v.pai_id and ordem = v.ordem - 1;
      if not found then
        raise exception 'Não há item acima para colocar este dentro';
      end if;
      if v_acima.tipo = 'tarefa' then
        if v_acima.unidade is not null or v_acima.quantidade is not null or v_acima.custo_previsto is not null
           or v_acima.inicio_previsto is not null or v_acima.fim_previsto is not null then
          raise exception 'O item acima é uma tarefa com valores. Transforme-o em etapa antes de colocar itens dentro dele.';
        end if;
        update public.eap_item set tipo = 'etapa' where id = v_acima.id;
      end if;
      perform public.mover_item_eap(v.id, v_acima.id, null);

    when 'recuar' then
      if v.pai_id is not null then
        select * into v_pai from public.eap_item where id = v.pai_id;
        perform public.mover_item_eap(v.id, v_pai.pai_id, v_pai.ordem + 1);
      end if;

    else
      raise exception 'Ação desconhecida: %', p_acao;
  end case;
end;
$$;

-- Exclui o item e tudo que está dentro dele. Devolve quantos itens saíram.
create or replace function public.excluir_item_eap(p_id uuid)
returns integer language plpgsql security definer set search_path = '' as $$
declare
  v     public.eap_item;
  v_qtd integer;
begin
  select * into v from public.eap_item where id = p_id;
  if not found or not app.pode_editar_projeto(v.projeto_id) then
    raise exception 'Item da EAP não encontrado ou sem permissão' using errcode = '42501';
  end if;

  with recursive sub as (
    select e.id from public.eap_item e where e.id = v.id
    union all
    select e.id from public.eap_item e join sub s on e.pai_id = s.id
  )
  select count(*) into v_qtd from sub;

  delete from public.eap_item where id = v.id;
  update public.eap_item set ordem = ordem - 1
   where projeto_id = v.projeto_id and pai_id is not distinct from v.pai_id and ordem > v.ordem;
  return v_qtd;
end;
$$;

-- Importação em lote (planilha ou MS Project), tudo ou nada.
-- p_itens: [{chave, pai, tipo, nome, unidade, quantidade, custo_previsto,
--            inicio_previsto, fim_previsto, codigo_externo}], pais antes dos filhos.
create or replace function public.importar_eap(
  p_projeto_id  uuid,
  p_itens       jsonb,
  p_substituir  boolean default false
)
returns integer language plpgsql security definer set search_path = '' as $$
declare
  v_qtd     integer;
  v_offset  integer := 0;
  v_problema text;
begin
  if not app.pode_editar_projeto(p_projeto_id) then
    raise exception 'Sem permissão para editar a EAP deste projeto' using errcode = '42501';
  end if;
  if p_itens is null or jsonb_typeof(p_itens) <> 'array' or jsonb_array_length(p_itens) = 0 then
    raise exception 'Nenhum item para importar';
  end if;
  v_qtd := jsonb_array_length(p_itens);
  if v_qtd > 5000 then
    raise exception 'A importação aceita até 5.000 itens por vez (recebidos: %)', v_qtd;
  end if;

  -- chaves únicas e preenchidas
  select string_agg(coalesce(s.chave, '(vazia)'), ', ') into v_problema
    from (select e ->> 'chave' as chave, count(*) as n
            from jsonb_array_elements(p_itens) as e group by 1) s
   where s.n > 1 or s.chave is null;
  if v_problema is not null then
    raise exception 'Chaves repetidas ou vazias na importação: %', v_problema;
  end if;

  -- todo pai precisa vir antes do filho
  with entrada as materialized (
    select t.ord, t.e ->> 'chave' as chave, t.e ->> 'pai' as pai_chave, t.e
      from jsonb_array_elements(p_itens) with ordinality as t(e, ord)
  )
  select string_agg(coalesce(f.e ->> 'nome', f.chave), ', ') into v_problema
    from entrada f
    left join entrada p on p.chave = f.pai_chave and p.ord < f.ord
   where f.pai_chave is not null and p.chave is null;
  if v_problema is not null then
    raise exception 'Itens sem etapa pai válida na importação: %', v_problema;
  end if;

  if p_substituir then
    delete from public.eap_item where projeto_id = p_projeto_id;
  else
    select coalesce(max(ordem), 0) into v_offset
      from public.eap_item where projeto_id = p_projeto_id and pai_id is null;
  end if;

  with entrada as materialized (
    select t.ord, t.e ->> 'chave' as chave, t.e ->> 'pai' as pai_chave, t.e,
           gen_random_uuid() as novo_id
      from jsonb_array_elements(p_itens) with ordinality as t(e, ord)
  ),
  resolvida as (
    select f.*, p.novo_id as pai_id,
           row_number() over (partition by f.pai_chave order by f.ord) as pos
      from entrada f
      left join entrada p on p.chave = f.pai_chave
  )
  insert into public.eap_item (
    id, projeto_id, pai_id, ordem, tipo, nome,
    unidade, quantidade, custo_previsto, inicio_previsto, fim_previsto, codigo_externo
  )
  select r.novo_id,
         p_projeto_id,
         r.pai_id,
         r.pos + case when r.pai_chave is null then v_offset else 0 end,
         (r.e ->> 'tipo')::public.tipo_item_eap,
         btrim(r.e ->> 'nome'),
         nullif(btrim(r.e ->> 'unidade'), ''),
         nullif(r.e ->> 'quantidade', '')::numeric,
         nullif(r.e ->> 'custo_previsto', '')::numeric,
         nullif(r.e ->> 'inicio_previsto', '')::date,
         nullif(r.e ->> 'fim_previsto', '')::date,
         nullif(btrim(r.e ->> 'codigo_externo'), '')
    from resolvida r
   order by r.ord;

  return v_qtd;
end;
$$;

-- -----------------------------------------------------------------------------
-- Permissões das funções
-- -----------------------------------------------------------------------------
revoke all on function app.validar_campos_eap(jsonb) from public;
grant execute on function app.validar_campos_eap(jsonb) to authenticated;

revoke all on function
  public.eap_do_projeto(uuid),
  public.criar_item_eap(uuid, public.tipo_item_eap, text, uuid, jsonb, integer),
  public.atualizar_item_eap(uuid, jsonb),
  public.mover_item_eap(uuid, uuid, integer),
  public.reposicionar_item_eap(uuid, text),
  public.excluir_item_eap(uuid),
  public.importar_eap(uuid, jsonb, boolean)
from public, anon;

grant execute on function
  public.eap_do_projeto(uuid),
  public.criar_item_eap(uuid, public.tipo_item_eap, text, uuid, jsonb, integer),
  public.atualizar_item_eap(uuid, jsonb),
  public.mover_item_eap(uuid, uuid, integer),
  public.reposicionar_item_eap(uuid, text),
  public.excluir_item_eap(uuid),
  public.importar_eap(uuid, jsonb, boolean)
to authenticated;
