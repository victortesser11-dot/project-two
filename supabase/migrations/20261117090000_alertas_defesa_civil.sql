-- =============================================================================
-- Alertas da Defesa Civil para as obras do Rio Grande do Sul.
--
-- * Fonte: o feed nacional da IDAP (Interface de Divulgação de Alertas Públicos, da Defesa Civil Nacional), no formato
--   CAP 1.2: https://idapfile.mdr.gov.br/idap/api/rss/cap. Traz os alertas que as Defesas Civis (estaduais, municipais e
--   a nacional) mandam à população, com evento, severidade, validade, orientação e o polígono da área atingida.
--   O feed é grande (~17 MB, ~40 s para baixar) e guarda só as últimas ~12 horas: por isso o banco busca sozinho a cada
--   15 minutos (pg_cron + pg_net, só no Supabase) e guarda aqui os alertas do RS.
-- * Dado público, igual para todas as empresas: a tabela não tem empresa_id e não é lida direto pelo app. Cada obra pede
--   os seus por alertas_defesa_civil_da_obra, que confere a permissão e se o ponto da obra cai dentro da área do alerta.
-- * Alerta substituído (Update) ou cancelado (Cancel) pela Defesa Civil deixa de valer.
-- =============================================================================

create table public.alerta_defesa_civil (
  id            text primary key check (length(id) between 1 and 200),  -- identificador CAP
  remetente     text,                     -- senderName (ex.: Defesa Civil Estadual do Rio Grande do Sul)
  evento        text not null,            -- ex.: CHUVAS INTENSAS, VENDAVAL, INUNDAÇÕES
  severidade    text,                     -- Extreme, Severe, Moderate, Minor, Unknown
  urgencia      text,
  certeza       text,
  enviado_em    timestamptz,
  inicio        timestamptz,
  fim           timestamptz,
  titulo        text,
  descricao     text,
  instrucao     text,
  link          text,
  area          text,                     -- areaDesc (ex.: Porto Alegre/RS)
  municipios    text[] not null default '{}',  -- códigos IBGE, quando vêm
  poligonos     text[] not null default '{}',  -- "lat,lon lat,lon ..." como no CAP
  lat_min       double precision,
  lat_max       double precision,
  lon_min       double precision,
  lon_max       double precision,
  cancelado_em  timestamptz,
  recebido_em   timestamptz not null default now(),
  atualizado_em timestamptz not null default now()
);
create index alerta_defesa_civil_fim_idx on public.alerta_defesa_civil (fim) where cancelado_em is null;

alter table public.alerta_defesa_civil enable row level security;
revoke all on public.alerta_defesa_civil from anon, authenticated;

-- Situação da coleta automática (uma linha). Fica em app: não aparece na API.
create table app.coleta_defesa_civil (
  id            integer primary key default 1 check (id = 1),
  pedido        bigint,          -- id do pedido no pg_net ainda não processado
  pedido_em     timestamptz,
  processado_em timestamptz,
  importados    integer,
  erro          text
);
revoke all on app.coleta_defesa_civil from public, anon, authenticated;

-- Ponto dentro do polígono (ray casting). O polígono vem do CAP: "lat,lon lat,lon ...".
create or replace function app.ponto_no_poligono(p_lat double precision, p_lon double precision, p_poligono text)
returns boolean language plpgsql immutable set search_path = '' as $$
declare
  pts    text[] := array_remove(string_to_array(btrim(coalesce(p_poligono, '')), ' '), '');
  n      integer := coalesce(array_length(pts, 1), 0);
  j      integer;
  yi     double precision;
  xi     double precision;
  yj     double precision;
  xj     double precision;
  dentro boolean := false;
begin
  if n < 3 or p_lat is null or p_lon is null then
    return false;
  end if;
  j := n;
  for i in 1..n loop
    yi := split_part(pts[i], ',', 1)::double precision;
    xi := split_part(pts[i], ',', 2)::double precision;
    yj := split_part(pts[j], ',', 1)::double precision;
    xj := split_part(pts[j], ',', 2)::double precision;
    if ((yi > p_lat) <> (yj > p_lat)) and (p_lon < (xj - xi) * (p_lat - yi) / (yj - yi) + xi) then
      dentro := not dentro;
    end if;
    j := i;
  end loop;
  return dentro;
exception when others then
  return false;  -- polígono malformado não derruba a consulta
end;
$$;

-- Lê o feed CAP (Atom da IDAP) e guarda os alertas que tocam o RS: área "…/RS", município IBGE 43xxxxx, remetente
-- gaúcho ou polígono que encosta no retângulo do estado (os da fronteira entram; a conferência fina é por obra).
-- Devolve quantos alertas do RS entraram ou foram atualizados.
create or replace function app.importar_alertas_cap(p_xml text)
returns integer language plpgsql security definer set search_path = '' as $$
declare
  doc   xml := xmlparse(document p_xml);
  a     record;
  v_pol text[];
  v_geo text[];
  v_area text;
  v_bb  record;
  n     integer := 0;
begin
  for a in
    select x.*
      from xmltable(
        xmlnamespaces('http://www.w3.org/2005/Atom' as at, 'urn:oasis:names:tc:emergency:cap:1.2' as c),
        '/at:feed/at:entry/at:content/c:alert' passing doc
        columns
          identificador text path 'c:identifier',
          status        text path 'c:status',
          tipo_msg      text path 'c:msgType',
          enviado       text path 'c:sent',
          referencias   text path 'c:references',
          evento        text path 'c:info[1]/c:event',
          severidade    text path 'c:info[1]/c:severity',
          urgencia      text path 'c:info[1]/c:urgency',
          certeza       text path 'c:info[1]/c:certainty',
          inicio        text path 'c:info[1]/c:onset',
          fim           text path 'c:info[1]/c:expires',
          remetente     text path 'c:info[1]/c:senderName',
          titulo        text path 'c:info[1]/c:headline',
          descricao     text path 'c:info[1]/c:description',
          instrucao     text path 'c:info[1]/c:instruction',
          link          text path 'c:info[1]/c:web',
          info          xml  path 'c:info[1]'
      ) as x
  loop
    continue when a.identificador is null or coalesce(a.status, 'Actual') <> 'Actual';

    -- Substituído ou cancelado: os alertas citados em <references> ("remetente,identificador,envio ...") deixam de valer.
    if a.tipo_msg in ('Update', 'Cancel') and a.referencias is not null then
      update public.alerta_defesa_civil
         set cancelado_em = coalesce(a.enviado::timestamptz, now()), atualizado_em = now()
       where cancelado_em is null
         and id in (select split_part(r, ',', 2) from unnest(string_to_array(btrim(a.referencias), ' ')) as r);
    end if;
    continue when a.tipo_msg = 'Cancel' or a.info is null;

    select coalesce(array_agg(btrim(p.v)) filter (where btrim(coalesce(p.v, '')) <> ''), '{}') into v_pol
      from xmltable(xmlnamespaces('urn:oasis:names:tc:emergency:cap:1.2' as c), '/c:info/c:area/c:polygon' passing a.info
                    columns v text path '.') as p;
    select coalesce(array_agg(btrim(g.v)) filter (where btrim(coalesce(g.v, '')) <> ''), '{}') into v_geo
      from xmltable(xmlnamespaces('urn:oasis:names:tc:emergency:cap:1.2' as c), '/c:info/c:area/c:geocode' passing a.info
                    columns v text path 'c:value') as g;
    select string_agg(btrim(d.v), '; ') into v_area
      from xmltable(xmlnamespaces('urn:oasis:names:tc:emergency:cap:1.2' as c), '/c:info/c:area' passing a.info
                    columns v text path 'c:areaDesc') as d;
    select min(split_part(pt, ',', 1)::double precision) as lat_min, max(split_part(pt, ',', 1)::double precision) as lat_max,
           min(split_part(pt, ',', 2)::double precision) as lon_min, max(split_part(pt, ',', 2)::double precision) as lon_max
      into v_bb
      from unnest(v_pol) as poly, unnest(string_to_array(poly, ' ')) as pt
     where pt ~ '^-?[0-9.]+,-?[0-9.]+$';

    continue when not coalesce(
      coalesce(v_area, '') ~* '/\s*RS\s*$|/\s*RS\s*;|rio grande do sul'
      or coalesce(a.remetente, '') ~* 'rio grande do sul|/RS\)'
      or exists (select 1 from unnest(v_geo) as g where g like '43%')
      or (v_bb.lat_min <= -27.0 and v_bb.lat_max >= -34.0 and v_bb.lon_min <= -49.5 and v_bb.lon_max >= -58.0),
      false);

    insert into public.alerta_defesa_civil (id, remetente, evento, severidade, urgencia, certeza, enviado_em, inicio, fim, titulo,
                                            descricao, instrucao, link, area, municipios, poligonos, lat_min, lat_max, lon_min, lon_max)
    values (a.identificador, btrim(a.remetente), coalesce(btrim(a.evento), 'Alerta'), a.severidade, a.urgencia, a.certeza,
            a.enviado::timestamptz, a.inicio::timestamptz, a.fim::timestamptz, btrim(a.titulo), btrim(a.descricao), btrim(a.instrucao),
            btrim(a.link), v_area, v_geo, v_pol, v_bb.lat_min, v_bb.lat_max, v_bb.lon_min, v_bb.lon_max)
    on conflict (id) do update set
      remetente = excluded.remetente, evento = excluded.evento, severidade = excluded.severidade, urgencia = excluded.urgencia,
      certeza = excluded.certeza, enviado_em = excluded.enviado_em, inicio = excluded.inicio, fim = excluded.fim,
      titulo = excluded.titulo, descricao = excluded.descricao, instrucao = excluded.instrucao, link = excluded.link,
      area = excluded.area, municipios = excluded.municipios, poligonos = excluded.poligonos, lat_min = excluded.lat_min,
      lat_max = excluded.lat_max, lon_min = excluded.lon_min, lon_max = excluded.lon_max, atualizado_em = now();
    n := n + 1;
  end loop;

  -- Histórico curto: o que venceu há mais de 30 dias sai.
  delete from public.alerta_defesa_civil where fim < now() - interval '30 days';
  return n;
end;
$$;

-- Coleta automática (pg_cron a cada 15 min): processa o download anterior, se já chegou, e pede o próximo ao pg_net.
-- Sem pg_net (banco de testes), não faz nada.
create or replace function app.coletar_alertas_defesa_civil()
returns text language plpgsql security definer set search_path = '' as $$
declare
  v       app.coleta_defesa_civil;
  r       record;
  v_n     integer;
  v_novo  bigint;
begin
  if to_regclass('net._http_response') is null then
    return 'pg_net não instalado';
  end if;
  insert into app.coleta_defesa_civil (id) values (1) on conflict (id) do nothing;
  select * into v from app.coleta_defesa_civil where id = 1 for update;

  if v.pedido is not null then
    execute 'select status_code, content, timed_out, error_msg from net._http_response where id = $1' into r using v.pedido;
    if r is null then
      if v.pedido_em > now() - interval '10 minutes' then
        return 'download anterior ainda em andamento';
      end if;
      update app.coleta_defesa_civil set erro = 'Sem resposta do feed da IDAP', pedido = null where id = 1;
    elsif r.status_code = 200 and r.content is not null then
      begin
        v_n := app.importar_alertas_cap(r.content);
        update app.coleta_defesa_civil set importados = v_n, erro = null, processado_em = now(), pedido = null where id = 1;
      exception when others then
        update app.coleta_defesa_civil set erro = left('Feed ilegível: ' || sqlerrm, 500), pedido = null where id = 1;
      end;
    else
      update app.coleta_defesa_civil
         set erro = left(coalesce(r.error_msg, case when r.timed_out then 'Tempo esgotado' end, 'HTTP ' || r.status_code), 500), pedido = null
       where id = 1;
    end if;
  end if;

  execute 'select net.http_get(url := $1, timeout_milliseconds := 180000)' into v_novo using 'https://idapfile.mdr.gov.br/idap/api/rss/cap';
  update app.coleta_defesa_civil set pedido = v_novo, pedido_em = now() where id = 1;
  return 'pedido ' || v_novo;
end;
$$;

-- Alertas em vigor para a obra. na_obra: o ponto da obra cai dentro da área do alerta (null quando a obra não tem
-- localização). Sem os polígonos na resposta (são grandes).
create or replace function public.alertas_defesa_civil_da_obra(p_projeto_id uuid)
returns table (
  id text, remetente text, evento text, severidade text, urgencia text, titulo text, descricao text, instrucao text,
  link text, area text, inicio timestamptz, fim timestamptz, na_obra boolean
)
language plpgsql stable security definer set search_path = '' as $$
declare
  v_lat double precision;
  v_lon double precision;
begin
  if not coalesce(app.pode_ver_projeto(p_projeto_id), false) then
    raise exception 'Obra não encontrada ou sem permissão' using errcode = '42501';
  end if;
  select p.latitude, p.longitude into v_lat, v_lon from public.projeto p where p.id = p_projeto_id;

  return query
    select a.id, a.remetente, a.evento, a.severidade, a.urgencia, a.titulo, a.descricao, a.instrucao, a.link, a.area, a.inicio, a.fim,
           case
             when v_lat is null or v_lon is null then null
             else v_lat between a.lat_min and a.lat_max and v_lon between a.lon_min and a.lon_max
                  and exists (select 1 from unnest(a.poligonos) as pol where app.ponto_no_poligono(v_lat, v_lon, pol))
           end
      from public.alerta_defesa_civil a
     where a.cancelado_em is null and (a.fim is null or a.fim > now())
     order by a.fim nulls last, a.id;
end;
$$;

revoke all on function app.ponto_no_poligono(double precision, double precision, text) from public, anon, authenticated;
revoke all on function app.importar_alertas_cap(text) from public, anon, authenticated;
revoke all on function app.coletar_alertas_defesa_civil() from public, anon, authenticated;
revoke all on function public.alertas_defesa_civil_da_obra(uuid) from public, anon;
grant execute on function public.alertas_defesa_civil_da_obra(uuid) to authenticated;

-- Agendamento: só onde existem pg_cron e pg_net (Supabase). No banco de testes, nada acontece.
do $$
begin
  if exists (select 1 from pg_available_extensions where name = 'pg_net')
     and exists (select 1 from pg_available_extensions where name = 'pg_cron') then
    create extension if not exists pg_net with schema extensions;
    create extension if not exists pg_cron;
    perform cron.unschedule(jobid) from cron.job where jobname = 'alertas-defesa-civil';
    perform cron.schedule('alertas-defesa-civil', '*/15 * * * *', 'select app.coletar_alertas_defesa_civil()');
  end if;
end;
$$;
