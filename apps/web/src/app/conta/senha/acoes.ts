'use server';

import { redirect } from 'next/navigation';
import { z } from 'zod';
import { criarClienteServidor } from '@/lib/supabase/server';

export type EstadoSenha = { erro?: string };

const MENSAGENS: Record<string, string> = {
  same_password: 'A nova senha precisa ser diferente da atual.',
  weak_password: 'Essa senha é fraca ou já apareceu em vazamentos. Escolha outra.',
  reauthentication_needed: 'Por segurança, entre de novo e troque a senha logo em seguida.',
};

const pedido = z
  .object({
    senha: z.string().min(8, 'A senha precisa ter pelo menos 8 caracteres').max(72, 'Use no máximo 72 caracteres'),
    repetir: z.string(),
  })
  .refine((d) => d.senha === d.repetir, { message: 'As duas senhas não são iguais', path: ['repetir'] });

export async function definirSenha(_: EstadoSenha, form: FormData): Promise<EstadoSenha> {
  const dados = pedido.safeParse({ senha: form.get('senha'), repetir: form.get('repetir') });
  if (!dados.success) return { erro: dados.error.issues[0]?.message };

  const supabase = await criarClienteServidor();
  const { error } = await supabase.auth.updateUser({ password: dados.data.senha });
  if (error) return { erro: (error.code && MENSAGENS[error.code]) || 'Não foi possível trocar a senha. Tente de novo.' };
  redirect('/');
}
