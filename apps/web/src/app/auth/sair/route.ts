import { NextResponse, type NextRequest } from 'next/server';
import { criarClienteServidor } from '@/lib/supabase/server';

export async function POST(request: NextRequest) {
  const supabase = await criarClienteServidor();
  await supabase.auth.signOut();
  const resposta = NextResponse.redirect(new URL('/login', request.url), { status: 303 });
  // Apaga as páginas guardadas para uso offline (celular compartilhado no canteiro).
  resposta.headers.set('Clear-Site-Data', '"cache"');
  return resposta;
}
