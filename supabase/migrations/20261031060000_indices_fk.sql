-- =============================================================================
-- Índices nas chaves estrangeiras apontadas pelo advisor de desempenho do
-- Supabase. Evitam varredura completa ao apagar empresa/usuário (cascata) e
-- aceleram filtros por empresa e por autor.
-- =============================================================================
create index if not exists eap_item_empresa_idx            on public.eap_item (empresa_id);
create index if not exists membro_projeto_empresa_idx      on public.membro_projeto (empresa_id);
create index if not exists projeto_criado_por_idx          on public.projeto (criado_por);
create index if not exists projeto_responsavel_idx         on public.projeto (responsavel_id);
create index if not exists avanco_tarefa_registrado_por_idx on public.avanco_tarefa (registrado_por);
create index if not exists linha_base_definida_por_idx     on public.linha_base (definida_por);
