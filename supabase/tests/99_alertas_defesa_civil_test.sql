-- Alertas da Defesa Civil: lê o feed CAP da IDAP, guarda só o RS, respeita cancelamento, confere se a obra está dentro
-- da área do alerta; só quem vê a obra consulta; nada é lido direto da tabela.
\set ON_ERROR_STOP 1
begin;

insert into auth.users (id, email) values
  ('00000000-0000-0000-0000-00000000000a', 'ana@a.test'),    -- admin da empresa A
  ('00000000-0000-0000-0000-00000000000b', 'bruno@a.test'),  -- engenheiro das obras
  ('00000000-0000-0000-0000-00000000000e', 'edu@a.test'),    -- leitura na obra de Porto Alegre
  ('00000000-0000-0000-0000-00000000000d', 'davi@b.test');   -- admin da empresa B

set local role authenticated;
select tests.entrar('00000000-0000-0000-0000-00000000000a');
select set_config('t.a', criar_empresa('Construtora A')::text, true);
select adicionar_membro_empresa(current_setting('t.a')::uuid, u) from unnest(array['bruno@a.test','edu@a.test']) u;
select tests.entrar('00000000-0000-0000-0000-00000000000b');
select set_config('t.poa', criar_projeto(current_setting('t.a')::uuid, 'Obra em Porto Alegre')::text, true);
select set_config('t.cxs', criar_projeto(current_setting('t.a')::uuid, 'Obra em Caxias do Sul')::text, true);
select set_config('t.sem', criar_projeto(current_setting('t.a')::uuid, 'Obra sem localização')::text, true);
update projeto set latitude = -30.03, longitude = -51.20 where id = current_setting('t.poa')::uuid;
update projeto set latitude = -29.17, longitude = -51.18 where id = current_setting('t.cxs')::uuid;
select adicionar_membro_projeto(current_setting('t.poa')::uuid, 'edu@a.test', 'leitura');
select tests.entrar('00000000-0000-0000-0000-00000000000d');
select set_config('t.b', criar_empresa('Construtora B')::text, true);

-- ---------------------------------------------------------------- importação (como o pg_cron faria)
reset role;
select tests.afirmar(app.ponto_no_poligono(-30.03, -51.20, '-30.1,-51.3 -30.1,-51.0 -29.9,-51.0 -29.9,-51.3 -30.1,-51.3'), 'ponto dentro do polígono');
select tests.afirmar(not app.ponto_no_poligono(-29.17, -51.18, '-30.1,-51.3 -30.1,-51.0 -29.9,-51.0 -29.9,-51.3 -30.1,-51.3'), 'ponto fora do polígono');
select tests.afirmar(not app.ponto_no_poligono(-30.0, -51.2, 'lixo'), 'polígono malformado não derruba');

-- Amostra no formato real do feed (Atom + CAP 1.2), com polígonos encurtados.
select set_config('t.feed', $feed$<?xml version="1.0" encoding="UTF-8"?>
<feed xmlns="http://www.w3.org/2005/Atom" xmlns:dc="http://purl.org/dc/elements/1.1/">
  <title>Rss Idap</title>
  <entry><title>CHUVAS INTENSAS</title><id>RS-1/2026</id><content type="text/xml">
    <alert xmlns="urn:oasis:names:tc:emergency:cap:1.2"><identifier>RS-1/2026</identifier><sender>DEFESA-CIVIL-RS</sender>
      <sent>2026-11-16T10:00:00-03:00</sent><status>Actual</status><msgType>Alert</msgType><scope>Public</scope>
      <info><language>pt-BR</language><category>Met</category><event>CHUVAS INTENSAS</event><urgency>Expected</urgency>
        <severity>Severe</severity><certainty>Likely</certainty><onset>2026-11-16T10:00:00-03:00</onset><expires>2099-01-01T00:00:00-03:00</expires>
        <senderName>Defesa Civil Estadual do Rio Grande do Sul</senderName>
        <headline>Defesa Civil: ALERTA RISCO ALTO: chuva forte &amp; ventania em Porto Alegre.</headline>
        <description>Acumulados de 80 mm em 24 h.</description><instruction>Evite áreas alagáveis.</instruction>
        <web>https://www.defesacivil.rs.gov.br</web>
        <area><areaDesc>Porto Alegre/RS</areaDesc><polygon>-30.1,-51.3 -30.1,-51.0 -29.9,-51.0 -29.9,-51.3 -30.1,-51.3</polygon>
          <geocode><valueName>IBGE</valueName><value>4314902</value></geocode></area></info></alert></content></entry>
  <entry><title>VENDAVAL</title><id>RS-2/2026</id><content type="text/xml">
    <alert xmlns="urn:oasis:names:tc:emergency:cap:1.2"><identifier>RS-2/2026</identifier><sender>DEFESA-CIVIL-RS</sender>
      <sent>2020-01-01T10:00:00-03:00</sent><status>Actual</status><msgType>Alert</msgType><scope>Public</scope>
      <info><event>VENDAVAL</event><severity>Moderate</severity><onset>2020-01-01T10:00:00-03:00</onset><expires>2020-01-02T00:00:00-03:00</expires>
        <senderName>Defesa Civil Estadual do Rio Grande do Sul</senderName><headline>Vendaval que já passou</headline>
        <area><areaDesc>Porto Alegre/RS</areaDesc><polygon>-30.1,-51.3 -30.1,-51.0 -29.9,-51.0 -29.9,-51.3 -30.1,-51.3</polygon></area></info></alert></content></entry>
  <entry><title>CHUVAS INTENSAS</title><id>AM-1/2026</id><content type="text/xml">
    <alert xmlns="urn:oasis:names:tc:emergency:cap:1.2"><identifier>AM-1/2026</identifier><sender>CENAD-SEDEC</sender>
      <sent>2026-11-16T10:00:00-03:00</sent><status>Actual</status><msgType>Alert</msgType><scope>Public</scope>
      <info><event>CHUVAS INTENSAS</event><severity>Moderate</severity><expires>2099-01-01T00:00:00-03:00</expires>
        <senderName>Defesa Civil Estadual do Amazonas</senderName><headline>Chuva no Amazonas</headline>
        <area><areaDesc>AMAZONAS/AM</areaDesc><polygon>-3.1,-64.9 -3.0,-64.9 -3.0,-64.8 -3.1,-64.8 -3.1,-64.9</polygon>
          <geocode><valueName>IBGE</valueName><value>1300029</value></geocode></area></info></alert></content></entry>
  <entry><title>CHUVAS INTENSAS</title><id>NAC-3/2026</id><content type="text/xml">
    <alert xmlns="urn:oasis:names:tc:emergency:cap:1.2"><identifier>NAC-3/2026</identifier><sender>CENAD-SEDEC</sender>
      <sent>2026-11-16T11:00:00-03:00</sent><status>Actual</status><msgType>Alert</msgType><scope>Public</scope>
      <info><event>CHUVAS INTENSAS</event><severity>Extreme</severity><expires>2099-01-01T00:00:00-03:00</expires>
        <senderName>Defesa Civil Nacional</senderName><headline>Alerta nacional na serra</headline>
        <area><areaDesc>Serra gaúcha</areaDesc><polygon>-29.3,-51.3 -29.3,-51.0 -29.0,-51.0 -29.0,-51.3 -29.3,-51.3</polygon></area></info></alert></content></entry>
  <entry><title>ENXURRADA</title><id>RS-5/2026</id><content type="text/xml">
    <alert xmlns="urn:oasis:names:tc:emergency:cap:1.2"><identifier>RS-5/2026</identifier><sender>DEFESA-CIVIL-RS</sender>
      <sent>2026-11-16T12:00:00-03:00</sent><status>Actual</status><msgType>Alert</msgType><scope>Public</scope>
      <info><event>ENXURRADA</event><severity>Moderate</severity><expires>2099-01-01T00:00:00-03:00</expires>
        <senderName>Defesa Civil Estadual do Rio Grande do Sul</senderName><headline>Enxurrada em Santa Maria</headline>
        <area><areaDesc>Santa Maria/RS</areaDesc><polygon>-29.8,-53.9 -29.8,-53.7 -29.6,-53.7 -29.6,-53.9 -29.8,-53.9</polygon></area></info></alert></content></entry>
  <entry><title>TESTE</title><id>RS-T/2026</id><content type="text/xml">
    <alert xmlns="urn:oasis:names:tc:emergency:cap:1.2"><identifier>RS-T/2026</identifier><sender>DEFESA-CIVIL-RS</sender>
      <sent>2026-11-16T12:00:00-03:00</sent><status>Exercise</status><msgType>Alert</msgType><scope>Public</scope>
      <info><event>SIMULADO</event><expires>2099-01-01T00:00:00-03:00</expires><senderName>Defesa Civil Estadual do Rio Grande do Sul</senderName>
        <area><areaDesc>Porto Alegre/RS</areaDesc></area></info></alert></content></entry>
</feed>$feed$, true);

select tests.afirmar(app.importar_alertas_cap(current_setting('t.feed')) = 4, 'importa os 4 alertas do RS (fica de fora o do AM e o simulado)');
select tests.afirmar((select count(*) from alerta_defesa_civil) = 3 and not exists (select 1 from alerta_defesa_civil where id in ('AM-1/2026', 'RS-T/2026')),
  'alerta de outro estado e simulado não entram');
select tests.afirmar(not exists (select 1 from alerta_defesa_civil where id = 'RS-2/2026'), 'alerta vencido há mais de 30 dias sai do histórico');
select tests.afirmar(
  (select titulo = 'Defesa Civil: ALERTA RISCO ALTO: chuva forte & ventania em Porto Alegre.' and municipios = '{4314902}' and area = 'Porto Alegre/RS'
          and lat_min = -30.1 and lon_max = -51.0 from alerta_defesa_civil where id = 'RS-1/2026'),
  'texto decodificado, município IBGE, área e retângulo guardados');
select tests.afirmar((select area = 'Serra gaúcha' from alerta_defesa_civil where id = 'NAC-3/2026'),
  'alerta da Defesa Civil Nacional sem "/RS" entra pelo polígono dentro do estado');
select tests.afirmar(app.importar_alertas_cap(current_setting('t.feed')) = 4 and (select count(*) from alerta_defesa_civil) = 3,
  'a mesma leitura de novo não duplica');

-- Cancelamento chega num feed seguinte.
select tests.afirmar(app.importar_alertas_cap($feed$<?xml version="1.0" encoding="UTF-8"?>
<feed xmlns="http://www.w3.org/2005/Atom"><entry><id>NAC-3C/2026</id><content type="text/xml">
  <alert xmlns="urn:oasis:names:tc:emergency:cap:1.2"><identifier>NAC-3C/2026</identifier><sender>CENAD-SEDEC</sender>
    <sent>2026-11-16T13:00:00-03:00</sent><status>Actual</status><msgType>Cancel</msgType><scope>Public</scope>
    <references>CENAD-SEDEC,NAC-3/2026,2026-11-16T11:00:00-03:00</references></alert></content></entry></feed>$feed$) = 0,
  'cancelamento não vira alerta novo');
select tests.afirmar((select cancelado_em is not null from alerta_defesa_civil where id = 'NAC-3/2026'), 'alerta citado no cancelamento deixa de valer');

select tests.afirmar(app.coletar_alertas_defesa_civil() = 'pg_net não instalado', 'sem pg_net a coleta automática não faz nada');

-- ---------------------------------------------------------------- consulta por obra
set local role authenticated;
select tests.entrar('00000000-0000-0000-0000-00000000000b');
select tests.afirmar(
  (select string_agg(id || ':' || coalesce(na_obra::text, 'null'), ' ' order by id) from alertas_defesa_civil_da_obra(current_setting('t.poa')::uuid))
  = 'RS-1/2026:true RS-5/2026:false',
  'obra em Porto Alegre: o alerta da capital vale para ela; o de Santa Maria aparece fora da área; vencido e cancelado somem');
select tests.afirmar(
  (select string_agg(id || ':' || coalesce(na_obra::text, 'null'), ' ' order by id) from alertas_defesa_civil_da_obra(current_setting('t.cxs')::uuid))
  = 'RS-1/2026:false RS-5/2026:false',
  'obra em Caxias do Sul fica fora da área dos dois');
select tests.afirmar(
  (select bool_and(na_obra is null) from alertas_defesa_civil_da_obra(current_setting('t.sem')::uuid)),
  'obra sem localização: não dá para saber (null)');
select tests.deve_falhar($$select count(*) from alerta_defesa_civil$$, 'o app não lê a tabela direto');
select tests.deve_falhar($$select app.importar_alertas_cap('<feed/>')$$, 'o app não importa alerta');
select tests.deve_falhar($$select app.coletar_alertas_defesa_civil()$$, 'o app não dispara a coleta');

select tests.entrar('00000000-0000-0000-0000-00000000000e');
select tests.afirmar((select count(*) from alertas_defesa_civil_da_obra(current_setting('t.poa')::uuid)) = 2, 'quem só lê a obra vê os alertas dela');
select tests.deve_falhar(format($$select * from alertas_defesa_civil_da_obra(%L)$$, current_setting('t.cxs')), 'mas não os de obra que não acessa');

select tests.entrar('00000000-0000-0000-0000-00000000000d');
select tests.deve_falhar(format($$select * from alertas_defesa_civil_da_obra(%L)$$, current_setting('t.poa')), 'outra empresa não consulta a obra');

rollback;
