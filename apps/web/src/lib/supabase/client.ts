import { createBrowserClient } from '@supabase/ssr';
import type { Database } from '@/lib/database.types';
import { supabaseKey, supabaseUrl } from '@/lib/env';

/**
 * Cliente do Supabase no navegador, com a sessão dos cookies. Usado onde o
 * volume não passa bem por Server Action (importação de milhares de itens);
 * as permissões continuam garantidas pelas funções e pelo RLS do banco.
 */
export function criarClienteNavegador() {
  return createBrowserClient<Database>(supabaseUrl, supabaseKey);
}
