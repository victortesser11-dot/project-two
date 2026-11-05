'use server';

import { redirect } from 'next/navigation';
import { criarClienteServidor } from '@/lib/supabase/server';
import { DESTINO_LINK, tipoDeLink, tokenValido } from '@/lib/links-email';

/** Valida o link do e-mail (só depois do toque na página, nunca no GET). */
export async function confirmarLink(form: FormData) {
  const token = form.get('token_hash');
  const tipo = tipoDeLink(form.get('type'));
  if (!tokenValido(token) || !tipo) redirect('/login?erro=link');

  const supabase = await criarClienteServidor();
  const { error } = await supabase.auth.verifyOtp({ type: tipo, token_hash: token });
  if (error) redirect('/login?erro=link');
  redirect(DESTINO_LINK[tipo]);
}
