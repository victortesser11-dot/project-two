import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';
import type { Database } from '@/lib/database.types';
import { supabaseConfigurado, supabaseKey, supabaseUrl } from '@/lib/env';

const ROTAS_PUBLICAS = ['/login', '/auth'];

/** Renova a sessão em toda requisição e manda para /login quem não está logado. */
export async function atualizarSessao(request: NextRequest) {
  let resposta = NextResponse.next({ request });
  if (!supabaseConfigurado) return resposta;

  const supabase = createServerClient<Database>(supabaseUrl, supabaseKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesParaGravar) {
        for (const { name, value } of cookiesParaGravar) request.cookies.set(name, value);
        resposta = NextResponse.next({ request });
        for (const { name, value, options } of cookiesParaGravar) {
          resposta.cookies.set(name, value, options);
        }
      },
    },
  });

  // Não colocar código entre a criação do cliente e getClaims(): é o que renova o token.
  // getClaims confere a assinatura do token com a chave pública do projeto (ES256, guardada em cache), sem ir ao
  // servidor de login a cada clique como o getUser ia; o token vencido é renovado aqui do mesmo jeito.
  const { data } = await supabase.auth.getClaims();
  const user = data?.claims?.sub ? data.claims : null;

  const caminho = request.nextUrl.pathname;
  const publica = ROTAS_PUBLICAS.some((r) => caminho === r || caminho.startsWith(`${r}/`));

  if (!user && !publica) {
    const url = request.nextUrl.clone();
    url.pathname = '/login';
    url.search = caminho === '/' ? '' : `?voltar=${encodeURIComponent(caminho)}`;
    return NextResponse.redirect(url);
  }

  if (user && caminho === '/login') {
    const url = request.nextUrl.clone();
    url.pathname = '/';
    url.search = '';
    return NextResponse.redirect(url);
  }

  return resposta;
}
