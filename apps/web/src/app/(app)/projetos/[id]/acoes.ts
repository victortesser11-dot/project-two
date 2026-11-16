'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { errosPorCampo, membroProjetoSchema, PAPEIS_PROJETO, ROTULO_PAPEL_PROJETO, type PapelProjeto } from '@obras/shared';
import { criarClienteServidor } from '@/lib/supabase/server';
import { mensagemDoBanco } from '@/lib/erros';
import { avisarAcessoObra, convidarParaObra } from '@/lib/convites';

export type EstadoMembro = {
  ok?: boolean;
  mensagem?: string;
  erros?: Record<string, string>;
  erroGeral?: string;
  valores?: Record<string, string>;
};

export type ResultadoMembro = { ok: true; mensagem: string } | { ok: false; erro: string };

const uuid = z.string().uuid();

/** Dá acesso ao projeto (RF-004); quem ainda não tem conta recebe convite por e-mail. */
export async function adicionarMembro(_: EstadoMembro, form: FormData): Promise<EstadoMembro> {
  const valores = { email: String(form.get('email') ?? ''), papel: String(form.get('papel') ?? '') };
  const projetoId = uuid.safeParse(form.get('projeto_id'));
  if (!projetoId.success) return { erroGeral: 'Projeto inválido.', valores };

  const dados = membroProjetoSchema.safeParse(valores);
  if (!dados.success) return { erros: errosPorCampo(dados.error), valores };

  const supabase = await criarClienteServidor();
  const pedido = { p_projeto_id: projetoId.data, p_email: dados.data.email, p_papel: dados.data.papel };
  const { error } = await supabase.rpc('adicionar_membro_projeto', pedido);

  // Sem conta com esse e-mail (o banco só diz isso a quem pode dar acesso): convida e tenta de novo.
  if (error?.code === 'P0002') {
    const convite = await convidarParaObra(supabase, projetoId.data, dados.data.email, dados.data.papel);
    if (!convite.ok) return { erroGeral: convite.erro, valores };
    const { error: deNovo } = await supabase.rpc('adicionar_membro_projeto', pedido);
    if (deNovo) return { erroGeral: mensagemDoBanco(deNovo), valores };
    revalidatePath(`/projetos/${projetoId.data}`);
    return {
      ok: true,
      mensagem: `Convite enviado para ${dados.data.email}. A pessoa cria a senha pelo link do e-mail e já entra como ${ROTULO_PAPEL_PROJETO[dados.data.papel]}.`,
    };
  }
  if (error) return { erroGeral: mensagemDoBanco(error), valores };

  await avisarAcessoObra(supabase, projetoId.data, dados.data.email, dados.data.papel);
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

/**
 * Obra importada em andamento chega sem datas e em "Planejamento". Preenche só o que está vazio: início e fim
 * previsto pelas tarefas do cronograma e, se já há avanço apontado, a situação passa para "Em andamento".
 */
export async function alinharObraAoCronograma(projetoId: string): Promise<ResultadoMembro> {
  if (!uuid.safeParse(projetoId).success) return { ok: false, erro: 'Projeto inválido.' };
  const supabase = await criarClienteServidor();
  const tarefas = () => supabase.from('eap_item').select('inicio_previsto, fim_previsto').eq('projeto_id', projetoId).eq('tipo', 'tarefa');
  const [{ data: projeto }, { data: primeira }, { data: ultima }, { data: avanco }] = await Promise.all([
    supabase.from('projeto').select('data_inicio, data_fim_prevista, status').eq('id', projetoId).maybeSingle(),
    tarefas().not('inicio_previsto', 'is', null).order('inicio_previsto').limit(1),
    tarefas().not('fim_previsto', 'is', null).order('fim_previsto', { ascending: false }).limit(1),
    supabase.from('avanco_tarefa').select('id').eq('projeto_id', projetoId).gt('percentual', 0).limit(1),
  ]);
  if (!projeto) return { ok: false, erro: 'Obra não encontrada.' };

  const inicio = projeto.data_inicio ?? primeira?.[0]?.inicio_previsto ?? null;
  const fim = projeto.data_fim_prevista ?? ultima?.[0]?.fim_previsto ?? null;
  const mudancas: { data_inicio?: string; data_fim_prevista?: string; status?: 'em_andamento' } = {};
  // Só grava as duas datas se o par fizer sentido (o banco recusa fim antes do início).
  if (inicio && fim && fim >= inicio) {
    if (!projeto.data_inicio) mudancas.data_inicio = inicio;
    if (!projeto.data_fim_prevista) mudancas.data_fim_prevista = fim;
  }
  if (projeto.status === 'planejamento' && (avanco?.length ?? 0) > 0) mudancas.status = 'em_andamento';
  if (Object.keys(mudancas).length === 0) return { ok: true, mensagem: 'A obra já está com datas e situação em dia.' };

  const { data: linhas, error } = await supabase.from('projeto').update(mudancas).eq('id', projetoId).select('id');
  if (error) return { ok: false, erro: mensagemDoBanco(error) };
  if (!linhas || linhas.length === 0) return { ok: false, erro: 'Só o engenheiro da obra ou o admin da empresa muda as datas.' };
  revalidatePath('/');
  revalidatePath(`/projetos/${projetoId}`, 'layout');
  return { ok: true, mensagem: 'Datas da obra preenchidas pelo cronograma.' };
}
