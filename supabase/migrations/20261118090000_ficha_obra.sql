-- Ficha técnica da obra: o que vem no carimbo das pranchas e no licenciamento (tipo, áreas, pavimentos, unidades,
-- proprietário, responsável técnico, ART/RRT, alvará, matrícula) e o CEP, que antes só virava latitude/longitude.
-- Gravada pelo UPDATE direto em projeto, como os outros dados da obra: RLS projeto_update (pode_editar_projeto),
-- chaves fixas e audit_log já valem. Preenchida à mão em "Editar dados da obra" ou conferida a partir da leitura dos
-- projetos pela IA (o engenheiro marca campo a campo o que grava).
alter table public.projeto
  add column cep text check (cep ~ '^[0-9]{8}$'),
  add column tipo_obra text check (char_length(tipo_obra) between 1 and 160),
  add column area_construida_m2 numeric(12,2) check (area_construida_m2 > 0),
  add column area_terreno_m2 numeric(12,2) check (area_terreno_m2 > 0),
  add column pavimentos text check (char_length(pavimentos) between 1 and 160),
  add column unidades text check (char_length(unidades) between 1 and 300),
  add column proprietario text check (char_length(proprietario) between 1 and 200),
  add column responsavel_tecnico text check (char_length(responsavel_tecnico) between 1 and 200),
  add column art_rrt text check (char_length(art_rrt) between 1 and 100),
  add column alvara text check (char_length(alvara) between 1 and 100),
  add column matricula text check (char_length(matricula) between 1 and 100);

comment on column public.projeto.cep is 'CEP da obra (8 dígitos); a localização (clima, Defesa Civil) vem dele.';
comment on column public.projeto.responsavel_tecnico is 'Nome e registro (CREA/CAU) de quem assina o projeto ou a execução.';
comment on column public.projeto.art_rrt is 'Número da ART (CREA) ou do RRT (CAU).';
comment on column public.projeto.alvara is 'Número do alvará ou do processo de licenciamento na prefeitura.';
comment on column public.projeto.matricula is 'Matrícula do imóvel no registro de imóveis.';
