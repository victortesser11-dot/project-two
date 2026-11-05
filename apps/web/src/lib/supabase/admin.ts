import 'server-only';
import { createClient } from '@supabase/supabase-js';
import { supabaseUrl } from '@/lib/env';

// Chave secreta do Supabase (ignora o RLS). Usada só para mandar convite de conta
// (auth.admin.inviteUserByEmail) depois que o banco já confirmou a permissão de quem convida.
// Nunca use para ler ou gravar dados de negócio: isso continua com o cliente da sessão.
const chave = process.env.SUPABASE_SECRET_KEY ?? process.env.SUPABASE_SERVICE_ROLE_KEY ?? '';

export function adminConfigurado() {
  return supabaseUrl !== '' && chave !== '';
}

export function criarClienteAdmin() {
  return createClient(supabaseUrl, chave, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
}
