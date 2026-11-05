'use server';

import { redirect } from 'next/navigation';
import { headers } from 'next/headers';
import { z } from 'zod';
import { criarClienteServidor } from '@/lib/supabase/server';
import { urlDoSite } from '@/lib/env';

export type EstadoLogin = { erro?: string; aviso?: string; email?: string };

const credenciais = z.object({
  email: z.string().trim().toLowerCase().email('Informe um e-mail válido'),
  senha: z.string().min(8, 'A senha precisa ter pelo menos 8 caracteres'),
  voltar: z.string().optional(),
});

/** Só aceita voltar para caminhos internos. */
function destinoSeguro(voltar: string | undefined) {
  return voltar && voltar.startsWith('/') && !voltar.startsWith('//') ? voltar : '/';
}

const MENSAGENS: Record<string, string> = {
  'Invalid login credentials': 'E-mail ou senha incorretos.',
  'Email not confirmed': 'Confirme seu e-mail pelo link que enviamos antes de entrar.',
  'User already registered': 'Já existe uma conta com esse e-mail. Use "Entrar".',
};

function traduzir(mensagem: string) {
  return MENSAGENS[mensagem] ?? mensagem;
}

export async function entrar(_: EstadoLogin, form: FormData): Promise<EstadoLogin> {
  const dados = credenciais.safeParse(Object.fromEntries(form));
  const email = String(form.get('email') ?? '');
  if (!dados.success) return { erro: dados.error.issues[0]?.message, email };

  const supabase = await criarClienteServidor();
  const { error } = await supabase.auth.signInWithPassword({ email: dados.data.email, password: dados.data.senha });
  if (error) return { erro: traduzir(error.message), email };

  redirect(destinoSeguro(dados.data.voltar));
}

export async function criarConta(_: EstadoLogin, form: FormData): Promise<EstadoLogin> {
  const dados = credenciais.safeParse(Object.fromEntries(form));
  const email = String(form.get('email') ?? '');
  if (!dados.success) return { erro: dados.error.issues[0]?.message, email };

  const supabase = await criarClienteServidor();
  const { data, error } = await supabase.auth.signUp({
    email: dados.data.email,
    password: dados.data.senha,
    options: { emailRedirectTo: `${urlDoSite()}/auth/callback` },
  });
  if (error) return { erro: traduzir(error.message), email };

  // Com confirmação de e-mail ligada, não há sessão até clicar no link.
  if (!data.session) {
    return { aviso: `Enviamos um link de confirmação para ${dados.data.email}. Abra o e-mail para ativar a conta.`, email };
  }
  redirect('/');
}

export async function entrarComGoogle(form: FormData) {
  const supabase = await criarClienteServidor();
  const origem = (await headers()).get('origin') ?? urlDoSite();
  const voltar = destinoSeguro(String(form.get('voltar') ?? ''));
  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: 'google',
    options: { redirectTo: `${origem}/auth/callback?voltar=${encodeURIComponent(voltar)}` },
  });
  if (error || !data.url) redirect('/login?erro=google');
  redirect(data.url);
}

const pedidoSenha = z.object({ email: z.string().trim().toLowerCase().email('Informe um e-mail válido') });

/** Manda o link para criar uma nova senha. Não conta se o e-mail tem conta (evita descobrir quem usa o app). */
export async function pedirLinkSenha(_: EstadoLogin, form: FormData): Promise<EstadoLogin> {
  const email = String(form.get('email') ?? '');
  const dados = pedidoSenha.safeParse({ email });
  if (!dados.success) return { erro: dados.error.issues[0]?.message, email };

  const supabase = await criarClienteServidor();
  const { error } = await supabase.auth.resetPasswordForEmail(dados.data.email, { redirectTo: `${urlDoSite()}/conta/senha` });
  if (error?.code === 'over_email_send_rate_limit' || error?.status === 429) {
    return { erro: 'Muitos pedidos seguidos. Espere alguns minutos e peça de novo.', email };
  }
  // O Supabase responde sem erro para e-mail sem conta; erro aqui é falha de verdade (SMTP, rede).
  if (error) {
    console.error('Link de senha não enviado:', error.code ?? error.message);
    return { erro: 'Não foi possível enviar o link agora. Tente de novo em alguns minutos.', email };
  }
  return {
    aviso: `Se houver uma conta com ${dados.data.email}, o link para criar a nova senha chega em alguns minutos. Confira também a caixa de spam.`,
    email,
  };
}
