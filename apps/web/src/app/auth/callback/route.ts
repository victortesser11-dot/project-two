import { NextResponse, type NextRequest } from 'next/server';
import { criarClienteServidor } from '@/lib/supabase/server';

/** Retorno do Google e do link de confirmação de e-mail. */
export async function GET(request: NextRequest) {
  const { searchParams, origin } = request.nextUrl;
  const codigo = searchParams.get('code');
  const voltar = searchParams.get('voltar') ?? '/';
  const destino = voltar.startsWith('/') && !voltar.startsWith('//') ? voltar : '/';

  if (codigo) {
    const supabase = await criarClienteServidor();
    const { error } = await supabase.auth.exchangeCodeForSession(codigo);
    if (!error) return NextResponse.redirect(`${origin}${destino}`);
  }
  return NextResponse.redirect(`${origin}/login?erro=link`);
}
