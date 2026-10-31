import 'server-only';
import { createServerClient } from '@supabase/ssr';
import { cookies } from 'next/headers';
import type { Database } from '@/lib/database.types';
import { supabaseKey, supabaseUrl } from '@/lib/env';

/** Cliente do Supabase para Server Components, Server Actions e Route Handlers. */
export async function criarClienteServidor() {
  const cookieStore = await cookies();

  return createServerClient<Database>(supabaseUrl, supabaseKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesParaGravar) {
        try {
          for (const { name, value, options } of cookiesParaGravar) {
            cookieStore.set(name, value, options);
          }
        } catch {
          // Server Component não grava cookie; o middleware renova a sessão.
        }
      },
    },
  });
}
