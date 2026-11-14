-- =============================================================================
-- Importar cronograma de obra em andamento: a planilha traz o que já foi feito de cada tarefa.
--
-- importar_eap passa a aceitar, em cada tarefa, "percentual" (0 a 100) e "avanco_data". Depois de criar os
-- itens, registra um apontamento de avanço para cada tarefa com percentual > 0, chamando registrar_avanco
-- (mesmas regras, mesmo histórico, mesma auditoria do apontamento feito no campo). Tudo ou nada, como antes.
-- Itens sem "percentual" entram como sempre: a assinatura e as permissões da função não mudam.
-- =============================================================================

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
  v_itens   jsonb;
  v_hoje    date := (now() at time zone 'America/Sao_Paulo')::date;
  v_av      record;
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

  -- O id de cada item é sorteado antes, para o avanço (mais abaixo) achar a tarefa que acabou de entrar.
  select jsonb_agg(t.e || jsonb_build_object('_id', gen_random_uuid()) order by t.ord) into v_itens
    from jsonb_array_elements(p_itens) with ordinality as t(e, ord);

  with entrada as materialized (
    select t.ord, t.e ->> 'chave' as chave, t.e ->> 'pai' as pai_chave, t.e,
           (t.e ->> '_id')::uuid as novo_id
      from jsonb_array_elements(v_itens) with ordinality as t(e, ord)
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

  -- Obra em andamento: a tarefa que chega com "percentual" ganha um apontamento de avanço, pela mesma
  -- função do campo (mesmas regras e auditoria). Data no futuro vira hoje.
  for v_av in
    select (e ->> '_id')::uuid as id,
           (e ->> 'percentual')::numeric as percentual,
           nullif(e ->> 'avanco_data', '')::date as data
      from jsonb_array_elements(v_itens) as e
     where e ->> 'tipo' = 'tarefa' and nullif(e ->> 'percentual', '')::numeric > 0
  loop
    perform public.registrar_avanco(gen_random_uuid(), v_av.id, least(coalesce(v_av.data, v_hoje), v_hoje), v_av.percentual, null,
                                    'Avanço trazido na importação do cronograma');
  end loop;

  return v_qtd;
end;
$$;
