-- eap_do_projeto mais rápida: a permissão é conferida uma vez, não a cada linha.
--
-- A função era "security invoker": dentro da recursão, a política eap_item_select (app.pode_ver_projeto(projeto_id))
-- rodava para cada uma das linhas lidas. Na obra Nápoles (1.506 itens) isso levava ~500 ms para o usuário contra
-- ~100 ms sem a política, e a tela pede a EAP em duas páginas: ~1 s em cada clique dentro da obra.
--
-- Agora ela é "security definer" com a mesma regra de leitura conferida uma vez na entrada
-- (coalesce(app.pode_ver_projeto(p_projeto_id), false): sem permissão, nada volta, como antes com o RLS),
-- e a recursão filtra pelo projeto (usa o índice e não sobe para itens de outro projeto).
-- Os grants continuam os mesmos (authenticated e service_role; create or replace mantém).
create or replace function public.eap_do_projeto(p_projeto_id uuid)
returns table (
  id uuid, pai_id uuid, posicao integer, nivel integer, codigo text, tipo public.tipo_item_eap, nome text, unidade text,
  quantidade numeric, custo_previsto numeric, inicio_previsto date, fim_previsto date, codigo_externo text,
  qtd_filhos integer, qtd_tarefas integer, inicio_base date, fim_base date, custo_base numeric,
  percentual_fisico numeric, avanco_em date
)
language sql
stable
security definer
set search_path = ''
as $$
  with recursive permitido as (
    select coalesce(app.pode_ver_projeto(p_projeto_id), false) as ok
  ),
  arvore as (
    select e.*, array[e.ordem] as caminho, array[e.id] as linha
      from public.eap_item e
     where e.projeto_id = p_projeto_id and e.pai_id is null
       and (select ok from permitido)
    union all
    select f.*, a.caminho || f.ordem, a.linha || f.id
      from public.eap_item f
      join arvore a on f.pai_id = a.id
     where f.projeto_id = p_projeto_id
  ),
  criterio as (
    select bool_and(coalesce(t.custo_previsto, 0) > 0) as por_custo
      from arvore t where t.tipo = 'tarefa'
  ),
  pesos as (
    select t.*,
           case when c.por_custo then t.custo_previsto
                else coalesce(t.fim_previsto - t.inicio_previsto + 1, 1) end::numeric as peso
      from arvore t cross join criterio c
     where t.tipo = 'tarefa'
  ),
  -- Cada tarefa soma em si mesma e em todos os ancestrais.
  somas as (
    select anc.id as item_id,
           sum(t.custo_previsto)    as custo,
           min(t.inicio_previsto)   as inicio,
           max(t.fim_previsto)      as fim,
           count(*)::integer        as tarefas,
           sum(t.custo_base)        as custo_b,
           min(t.inicio_base)       as inicio_b,
           max(t.fim_base)          as fim_b,
           sum(t.peso * t.percentual_fisico) / nullif(sum(t.peso), 0) as pct,
           max(t.avanco_em)         as avanco
      from pesos t
      cross join lateral unnest(t.linha) as anc(id)
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
         coalesce(s.tarefas, 0),
         case when a.tipo = 'etapa' then s.inicio_b else a.inicio_base end,
         case when a.tipo = 'etapa' then s.fim_b    else a.fim_base    end,
         case when a.tipo = 'etapa' then s.custo_b  else a.custo_base  end,
         case when a.tipo = 'etapa' then round(coalesce(s.pct, 0), 2) else a.percentual_fisico end,
         case when a.tipo = 'etapa' then s.avanco else a.avanco_em end
    from arvore a
    left join somas  s  on s.item_id  = a.id
    left join filhos fi on fi.item_id = a.id
   order by a.caminho;
$$;

revoke all on function public.eap_do_projeto(uuid) from public, anon;
grant execute on function public.eap_do_projeto(uuid) to authenticated, service_role;
