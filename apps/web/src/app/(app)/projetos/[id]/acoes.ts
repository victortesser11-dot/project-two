'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { errosPorCampo, membroProjetoSchema, PAPEIS_PROJETO, type PapelProjeto } from '@obras/shared';
import { criarClienteServidor } from '@/lib/supabase/server';
import { mensagemDoBanco } from '@/lib/erros';

export type EstadoMembro = {
  ok?: boolean;
  mensagem?: string;
  erros?: Record<string, string>;
  erroGeral?: string;
  valores?: Record<string, string>;
};

export type ResultadoMembro = { ok: true; mensagem: string } | { ok: false; erro: string };

const uuid = z.string().uuid();

/** Dá acesso ao projeto para quem já tem conta (RF-004). */
export async function adicionarMembro(_: EstadoMembro, form: FormData): Promise<EstadoMembro> {
  const valores = { email: String(form.get('email') ?? ''), papel: String(form.get('papel') ?? '') };
  const projetoId = uuid.safeParse(form.get('projeto_id'));
  if (!projetoId.success) return { erroGeral: 'Projeto inválido.', valores };

  const dados = membroProjetoSchema.safeParse(valores);
  if (!dados.success) return { erros: errosPorCampo(dados.error), valores };

  const supabase = await criarClienteServidor();
  const { error } = await supabase.rpc('adicionar_membro_projeto', {
    p_projeto_id: projetoId.data,
    p_email: dados.data.email,
    p_papel: dados.data.papel,
  });
  if (error) return { erroGeral: mensagemDoBanco(error), valores };

  revalidatePath(`/projetos/${projetoId.data}`);
  return { ok: true, mensagem: `${dados.data.email} agora acessa o projeto.` };
}

export async function alterarPapelMembro(projetoId: string, usuarioId: string, papel: PapelProjeto): Promise<ResultadoMembro> {
  const pedido = z.object({ projetoId: uuid, usuarioId: uuid, papel: z.enum(PAPEIS_PROJETO) }).safeParse({ projetoId, usuarioId, papel });
  if (!pedido.success) return { ok: false, erro: 'Pedido inválido.' };

  const supabase = await criarClienteServidor();
  // O RLS filtra em silêncio: sem linha de volta, a pessoa não tinha permissão.
  const { data, error } = await supabase
    .from('membro_projeto')
    .update({ papel })
    .eq('projeto_id', projetoId)
    .eq('usuario_id', usuarioId)
    .select('usuario_id');
  if (error) return { ok: false, erro: mensagemDoBanco(error) };
  if (!data?.length) return { ok: false, erro: 'Você não tem permissão para mudar papéis neste projeto.' };

  revalidatePath(`/projetos/${projetoId}`);
  return { ok: true, mensagem: 'Papel alterado.' };
}

export async function removerMembro(projetoId: string, usuarioId: string): Promise<ResultadoMembro> {
  const pedido = z.object({ projetoId: uuid, usuarioId: uuid }).safeParse({ projetoId, usuarioId });
  if (!pedido.success) return { ok: false, erro: 'Pedido inválido.' };

  const supabase = await criarClienteServidor();
  const { data, error } = await supabase
    .from('membro_projeto')
    .delete()
    .eq('projeto_id', projetoId)
    .eq('usuario_id', usuarioId)
    .select('usuario_id');
  if (error) return { ok: false, erro: mensagemDoBanco(error) };
  if (!data?.length) return { ok: false, erro: 'Você não tem permissão para tirar pessoas deste projeto.' };

  revalidatePath(`/projetos/${projetoId}`);
  return { ok: true, mensagem: 'Acesso removido.' };
}
