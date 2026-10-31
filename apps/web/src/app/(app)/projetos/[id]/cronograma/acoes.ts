'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { dependenciaSchema, errosPorCampo, itemEapSchema, TIPOS_ITEM_EAP } from '@obras/shared';
import { criarClienteServidor } from '@/lib/supabase/server';
import { mensagemDoBanco } from '@/lib/erros';

export type EstadoItem = {
  ok?: boolean;
  erros?: Record<string, string>;
  erroGeral?: string;
  valores?: Record<string, string>;
};

export type ResultadoAcao = { ok: true; mensagem?: string } | { ok: false; erro: string };

const uuid = z.string().uuid();

function revalidar(projetoId: string) {
  // Painel e cronograma leem a EAP: revalida o projeto inteiro.
  revalidatePath(`/projetos/${projetoId}`, 'layout');
}

/** Cria (sem item_id) ou edita (com item_id) uma etapa ou tarefa. */
export async function salvarItem(_: EstadoItem, form: FormData): Promise<EstadoItem> {
  const valores = Object.fromEntries([...form.entries()].map(([k, v]) => [k, String(v)]));
  const projetoId = uuid.safeParse(valores.projeto_id);
  if (!projetoId.success) return { erroGeral: 'Projeto inválido.', valores };

  const dados = itemEapSchema.safeParse(valores);
  if (!dados.success) return { erros: errosPorCampo(dados.error), valores };
  const item = dados.data;

  const campos = {
    unidade: item.unidade,
    quantidade: item.quantidade,
    custo_previsto: item.custo_previsto,
    inicio_previsto: item.inicio_previsto,
    fim_previsto: item.fim_previsto,
  };

  const supabase = await criarClienteServidor();
  const itemId = valores.item_id ? uuid.safeParse(valores.item_id) : null;

  if (itemId) {
    if (!itemId.success) return { erroGeral: 'Item inválido.', valores };
    // Na edição o tipo não muda por aqui (há uma ação própria para isso).
    const editaveis = item.tipo === 'tarefa' ? { nome: item.nome, ...campos } : { nome: item.nome };
    const { error } = await supabase.rpc('atualizar_item_eap', { p_id: itemId.data, p_campos: editaveis });
    if (error) return { erroGeral: mensagemDoBanco(error), valores };
  } else {
    const paiId = valores.pai_id ? uuid.safeParse(valores.pai_id) : null;
    if (paiId && !paiId.success) return { erroGeral: 'Etapa inválida.', valores };
    const posicao = valores.posicao ? Number(valores.posicao) : undefined;
    const { error } = await supabase.rpc('criar_item_eap', {
      p_projeto_id: projetoId.data,
      p_tipo: item.tipo,
      p_nome: item.nome,
      p_pai_id: paiId?.data,
      p_campos: item.tipo === 'tarefa' ? campos : {},
      p_posicao: Number.isInteger(posicao) && posicao! > 0 ? posicao : undefined,
    });
    if (error) return { erroGeral: mensagemDoBanco(error), valores };
  }

  revalidar(projetoId.data);
  return { ok: true };
}

const ACOES = ['subir', 'descer', 'avancar', 'recuar'] as const;
export type AcaoPosicao = (typeof ACOES)[number];

export async function reposicionarItem(projetoId: string, itemId: string, acao: AcaoPosicao): Promise<ResultadoAcao> {
  const ids = z.object({ projetoId: uuid, itemId: uuid, acao: z.enum(ACOES) }).safeParse({ projetoId, itemId, acao });
  if (!ids.success) return { ok: false, erro: 'Pedido inválido.' };

  const supabase = await criarClienteServidor();
  const { error } = await supabase.rpc('reposicionar_item_eap', { p_id: itemId, p_acao: acao });
  if (error) return { ok: false, erro: mensagemDoBanco(error) };
  revalidar(projetoId);
  return { ok: true };
}

export async function excluirItem(projetoId: string, itemId: string): Promise<ResultadoAcao> {
  const ids = z.object({ projetoId: uuid, itemId: uuid }).safeParse({ projetoId, itemId });
  if (!ids.success) return { ok: false, erro: 'Pedido inválido.' };

  const supabase = await criarClienteServidor();
  const { data, error } = await supabase.rpc('excluir_item_eap', { p_id: itemId });
  if (error) return { ok: false, erro: mensagemDoBanco(error) };
  revalidar(projetoId);
  return { ok: true, mensagem: data && data > 1 ? `${data} itens excluídos.` : 'Item excluído.' };
}

export async function alterarTipoItem(
  projetoId: string,
  itemId: string,
  tipo: (typeof TIPOS_ITEM_EAP)[number],
): Promise<ResultadoAcao> {
  const ids = z.object({ projetoId: uuid, itemId: uuid, tipo: z.enum(TIPOS_ITEM_EAP) }).safeParse({ projetoId, itemId, tipo });
  if (!ids.success) return { ok: false, erro: 'Pedido inválido.' };

  const supabase = await criarClienteServidor();
  const { error } = await supabase.rpc('atualizar_item_eap', { p_id: itemId, p_campos: { tipo } });
  if (error) return { ok: false, erro: mensagemDoBanco(error) };
  revalidar(projetoId);
  return { ok: true, mensagem: tipo === 'etapa' ? 'Agora é uma etapa.' : 'Agora é uma tarefa.' };
}

// ---------------------------------------------------------------- RF-201

export type EstadoDependencia = {
  ok?: boolean;
  mensagem?: string;
  erros?: Record<string, string>;
  erroGeral?: string;
};

function textoEmpurradas(qtd: number) {
  if (qtd === 0) return 'Ligação salva. Nenhuma data precisou mudar.';
  return qtd === 1
    ? 'Ligação salva. 1 tarefa foi empurrada para respeitar a dependência.'
    : `Ligação salva. ${qtd} tarefas foram empurradas para respeitar a dependência.`;
}

/** Cria ou ajusta a ligação entre duas tarefas; o banco recalcula as sucessoras. */
export async function salvarDependencia(_: EstadoDependencia, form: FormData): Promise<EstadoDependencia> {
  const valores = Object.fromEntries([...form.entries()].map(([k, v]) => [k, String(v)]));
  const projetoId = uuid.safeParse(valores.projeto_id);
  if (!projetoId.success) return { erroGeral: 'Projeto inválido.' };

  const dados = dependenciaSchema.safeParse(valores);
  if (!dados.success) return { erros: errosPorCampo(dados.error) };
  const d = dados.data;

  const supabase = await criarClienteServidor();
  const { data, error } = await supabase.rpc('salvar_dependencia', {
    p_predecessora_id: d.predecessora_id,
    p_sucessora_id: d.sucessora_id,
    p_tipo: d.tipo,
    p_defasagem_dias: d.defasagem_dias,
  });
  if (error) return { erroGeral: mensagemDoBanco(error) };
  revalidar(projetoId.data);
  return { ok: true, mensagem: textoEmpurradas(data ?? 0) };
}

export async function removerDependencia(projetoId: string, dependenciaId: string): Promise<ResultadoAcao> {
  const ids = z.object({ projetoId: uuid, dependenciaId: uuid }).safeParse({ projetoId, dependenciaId });
  if (!ids.success) return { ok: false, erro: 'Pedido inválido.' };

  const supabase = await criarClienteServidor();
  const { error } = await supabase.rpc('remover_dependencia', { p_id: dependenciaId });
  if (error) return { ok: false, erro: mensagemDoBanco(error) };
  revalidar(projetoId);
  return { ok: true, mensagem: 'Ligação removida. As datas continuam como estão.' };
}

export async function definirLinhaBase(projetoId: string): Promise<ResultadoAcao> {
  if (!uuid.safeParse(projetoId).success) return { ok: false, erro: 'Projeto inválido.' };

  const supabase = await criarClienteServidor();
  const { data, error } = await supabase.rpc('definir_linha_base', { p_projeto_id: projetoId });
  if (error) return { ok: false, erro: mensagemDoBanco(error) };
  revalidar(projetoId);
  return { ok: true, mensagem: `Linha de base definida com ${data} ${data === 1 ? 'tarefa' : 'tarefas'}.` };
}
