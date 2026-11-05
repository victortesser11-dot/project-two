-- O Supabase dá todos os privilégios em tabela nova do schema public para anon e authenticated.
-- As migrações da medição e da justificativa de atraso esqueceram o "revoke all" que as outras fazem.
-- O RLS já barrava (só há política de leitura), mas a regra é escrita só pelas funções: fica explícito.
revoke all on public.contrato_medicao, public.contrato_medicao_item, public.medicao, public.medicao_item, public.justificativa_atraso
  from anon, authenticated;
grant select on public.contrato_medicao, public.contrato_medicao_item, public.medicao, public.medicao_item, public.justificativa_atraso
  to authenticated;
