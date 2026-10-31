'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import {
  ajusteSchema,
  emprestimoSchema,
  entradaSchema,
  errosPorCampo,
  formatarData,
  formatarQuantidade,
  hojeIso,
  itemEstoqueSchema,
  saidaSchema,
} from '@obras/shared';
import { criarClienteServidor } from '@/lib/supabase/server';
import { mensagemDoBanco } from '@/lib/erros';

export type EstadoForm = { ok?: boolean; mensagem?: string; erros?: Record<string, string>; erroGeral?: string; valores?: Record<string, string> };
export type Resultado<T = undefined> = { ok: true; mensagem?: string; valor?: T } | { ok: false; erro: string };

const uuid = z.string().uuid();

function revalidar(projetoId: string) {
  revalidatePath(`/projetos/${projetoId}`, 'layout');
}

async function empresaDoProjeto(projetoId: string) {
  const supabase = await criarClienteServidor();
  const { data } = await supabase.from('projeto').select('empresa_id').eq('id', projetoId).maybeSingle();
  return { supabase, empresaId: data?.empresa_id ?? null };
}

const valoresDe = (form: FormData) => Object.fromEntries([...form.entries()].map(([k, v]) => [k, String(v)]));

// ---------------------------------------------------------------- catálogo

/** Cadastra (sem item_id) ou edita (com item_id) um item do catálogo da empresa. */
export async function salvarItem(_: EstadoForm, form: FormData): Promise<EstadoForm> {
  const valores = valoresDe(form);
  const projetoId = uuid.safeParse(valores.projeto_id);
  if (!projetoId.success) return { erroGeral: 'Obra inválida.', valores };
  const item = itemEstoqueSchema.safeParse(valores);
  if (!item.success) return { erros: errosPorCampo(item.error), valores };

  const { supabase, empresaId } = await empresaDoProjeto(projetoId.data);
  if (!empresaId) return { erroGeral: 'Obra não encontrada.', valores };

  const itemId = valores.item_id ? uuid.safeParse(valores.item_id) : null;
  if (itemId) {
    if (!itemId.success) return { erroGeral: 'Item inválido.', valores };
    // Tipo não muda depois de cadastrado (o banco também barra).
    const { tipo: _tipo, codigo, ...resto } = item.data;
    const { data, error } = await supabase
      .from('item_estoque')
      .update(codigo ? { ...resto, codigo } : resto)
      .eq('id', itemId.data)
      .select('id');
    if (error) return { erroGeral: mensagemDoBanco(error), valores };
    if (!data?.length) return { erroGeral: 'Sem permissão para editar este item.', valores };
    revalidar(projetoId.data);
    return { ok: true, mensagem: 'Item salvo.' };
  }

  const { data, error } = await supabase
    .from('item_estoque')
    .insert({ ...item.data, codigo: item.data.codigo ?? '', empresa_id: empresaId })
    .select('codigo')
    .single();
  if (error) return { erroGeral: mensagemDoBanco(error), valores };
  revalidar(projetoId.data);
  return { ok: true, mensagem: `${item.data.nome} entrou no catálogo com o código ${data.codigo}.` };
}

export async function definirItemAtivo(projetoId: string, itemId: string, ativo: boolean): Promise<Resultado> {
  if (!uuid.safeParse(projetoId).success || !uuid.safeParse(itemId).success) return { ok: false, erro: 'Pedido inválido.' };
  const supabase = await criarClienteServidor();
  const { data, error } = await supabase.from('item_estoque').update({ ativo }).eq('id', itemId).select('id');
  if (error) return { ok: false, erro: mensagemDoBanco(error) };
  if (!data?.length) return { ok: false, erro: 'Sem permissão para mudar este item.' };
  revalidar(projetoId);
  return { ok: true, mensagem: ativo ? 'Item reativado.' : 'Item desativado: não aparece mais nas entradas, saídas e empréstimos.' };
}

// ---------------------------------------------------------------- entradas (RF-402)

const linhaEntradaPedido = z.object({
  item_id: z.string().uuid().nullable(),
  /** Item novo para o catálogo, criado antes da entrada (linha de NF-e sem correspondente). */
  novo: z
    .object({ nome: z.string(), unidade: z.string(), ncm: z.string().nullable().optional(), categoria: z.string().nullable().optional() })
    .nullable()
    .optional(),
  quantidade: z.union([z.string(), z.number()]),
  valor_unitario: z.union([z.string(), z.number()]),
  codigo_fornecedor: z.string().nullable().optional(),
});

const pedidoEntrada = z.object({
  data: z.string(),
  fornecedor: z.string().nullable().optional(),
  cnpj_fornecedor: z.string().nullable().optional(),
  nota_fiscal: z.string().nullable().optional(),
  chave_nfe: z.string().nullable().optional(),
  itens: z.array(linhaEntradaPedido).min(1, 'Inclua pelo menos um item').max(500),
});
export type PedidoEntrada = z.input<typeof pedidoEntrada>;

/**
 * Dá entrada numa nota inteira (ou numa compra sem nota). Itens novos da NF-e entram
 * no catálogo primeiro; a entrada em si é tudo ou nada (registrar_entradas).
 */
export async function registrarEntrada(projetoId: string, pedido: PedidoEntrada): Promise<Resultado<number>> {
  if (!uuid.safeParse(projetoId).success) return { ok: false, erro: 'Obra inválida.' };
  const p = pedidoEntrada.safeParse(pedido);
  if (!p.success) return { ok: false, erro: p.error.issues[0]?.message ?? 'Pedido inválido.' };
  if (p.data.data > hojeIso()) return { ok: false, erro: 'A entrada não pode ser de um dia futuro.' };

  const { supabase, empresaId } = await empresaDoProjeto(projetoId);
  if (!empresaId) return { ok: false, erro: 'Obra não encontrada.' };

  // Valida tudo (com um id provisório para os novos) antes de criar qualquer item no catálogo.
  const PROVISORIO = '00000000-0000-4000-8000-000000000000';
  const previa = entradaSchema.safeParse({
    ...p.data,
    itens: p.data.itens.map((l) => ({ ...l, item_id: l.item_id ?? PROVISORIO })),
  });
  if (!previa.success) {
    const erro = previa.error.issues[0];
    const linha = typeof erro?.path[1] === 'number' ? ` (linha ${erro.path[1] + 1})` : '';
    return { ok: false, erro: `${erro?.message ?? 'Dados inválidos'}${linha}.` };
  }
  for (const [i, l] of p.data.itens.entries()) {
    if (!l.item_id && !l.novo) return { ok: false, erro: `Escolha o item do catálogo da linha ${i + 1}.` };
  }

  if (previa.data.chave_nfe) {
    const { data: ja } = await supabase
      .from('movimento_estoque')
      .select('data')
      .eq('empresa_id', empresaId)
      .eq('chave_nfe', previa.data.chave_nfe)
      .eq('tipo', 'entrada')
      .limit(1)
      .maybeSingle();
    if (ja) return { ok: false, erro: `Esta NF-e já foi lançada (entrada de ${formatarData(ja.data)}).` };
  }

  const novos = p.data.itens.filter((l) => !l.item_id && l.novo);
  const criados: string[] = [];
  for (const l of novos) {
    const item = itemEstoqueSchema.safeParse({ ...l.novo, tipo: 'material', ncm: l.novo?.ncm ?? '', categoria: l.novo?.categoria ?? '' });
    if (!item.success) return { ok: false, erro: `Item novo "${l.novo?.nome}": ${item.error.issues[0]?.message}` };
    const { data, error } = await supabase
      .from('item_estoque')
      .insert({ ...item.data, codigo: '', empresa_id: empresaId })
      .select('id')
      .single();
    if (error) return { ok: false, erro: `Não deu para cadastrar "${item.data.nome}": ${mensagemDoBanco(error)}` };
    criados.push(data.id);
  }

  let k = 0;
  const itens = previa.data.itens.map((l, i) => ({
    item_id: p.data.itens[i]!.item_id ?? criados[k++]!,
    quantidade: l.quantidade,
    valor_unitario: l.valor_unitario,
    codigo_fornecedor: l.codigo_fornecedor,
  }));

  const { data, error } = await supabase.rpc('registrar_entradas', {
    p_projeto_id: projetoId,
    p_data: previa.data.data,
    p_itens: itens,
    p_fornecedor: previa.data.fornecedor ?? undefined,
    p_cnpj_fornecedor: previa.data.cnpj_fornecedor ?? undefined,
    p_nota_fiscal: previa.data.nota_fiscal ?? undefined,
    p_chave_nfe: previa.data.chave_nfe ?? undefined,
  });
  if (error) {
    const extra = criados.length > 0 ? ` (${criados.length} item(ns) novo(s) já ficaram no catálogo)` : '';
    return { ok: false, erro: `${mensagemDoBanco(error)}${extra}` };
  }
  revalidar(projetoId);
  return { ok: true, valor: data, mensagem: `Entrada registrada: ${data} ${data === 1 ? 'item' : 'itens'}.` };
}

// ---------------------------------------------------------------- saídas (RF-403)

export async function registrarSaida(_: EstadoForm, form: FormData): Promise<EstadoForm> {
  const valores = valoresDe(form);
  const projetoId = uuid.safeParse(valores.projeto_id);
  if (!projetoId.success) return { erroGeral: 'Obra inválida.', valores };
  const s = saidaSchema.safeParse(valores);
  if (!s.success) return { erros: errosPorCampo(s.error), valores };
  if (s.data.data > hojeIso()) return { erros: { data: 'A saída não pode ser de um dia futuro' }, valores };

  const supabase = await criarClienteServidor();
  const { data, error } = await supabase.rpc('registrar_saida', {
    p_projeto_id: projetoId.data,
    p_item_id: s.data.item_id,
    p_data: s.data.data,
    p_quantidade: s.data.quantidade,
    p_tarefa_id: s.data.tarefa_id,
    p_trabalhador_id: s.data.trabalhador_id ?? undefined,
    p_responsavel: s.data.responsavel ?? undefined,
    p_observacao: s.data.observacao ?? undefined,
  });
  if (error) return { erroGeral: mensagemDoBanco(error), valores };
  revalidar(projetoId.data);
  const unidade = valores.unidade ?? '';
  return {
    ok: true,
    mensagem: `Saída registrada: ${formatarQuantidade(s.data.quantidade, unidade)}. Restam ${formatarQuantidade(Number(data), unidade)} na obra.`,
    // Mantém a tarefa e a pessoa para a próxima saída do mesmo serviço.
    valores: { tarefa_id: s.data.tarefa_id, trabalhador_id: s.data.trabalhador_id ?? '', data: s.data.data },
  };
}

// ---------------------------------------------------------------- inventário

/** Salva a contagem do inventário: um ajuste por item que mudou. */
export async function registrarInventario(
  projetoId: string,
  data: string,
  motivo: string,
  linhas: { item_id: string; quantidade_contada: string }[],
): Promise<Resultado<number>> {
  if (!uuid.safeParse(projetoId).success) return { ok: false, erro: 'Obra inválida.' };
  if (linhas.length === 0) return { ok: false, erro: 'Nenhuma contagem diferente do saldo.' };
  if (data > hojeIso()) return { ok: false, erro: 'O inventário não pode ser de um dia futuro.' };
  const validas = [];
  for (const l of linhas) {
    const a = ajusteSchema.safeParse({ ...l, data, motivo });
    if (!a.success) return { ok: false, erro: a.error.issues[0]?.message ?? 'Contagem inválida.' };
    validas.push(a.data);
  }
  const supabase = await criarClienteServidor();
  let feitos = 0;
  for (const a of validas) {
    const { error } = await supabase.rpc('registrar_ajuste', {
      p_projeto_id: projetoId,
      p_item_id: a.item_id,
      p_data: a.data,
      p_quantidade_contada: a.quantidade_contada,
      p_motivo: a.motivo,
    });
    if (error) {
      if (feitos > 0) revalidar(projetoId);
      return { ok: false, erro: `${mensagemDoBanco(error)}${feitos > 0 ? ` (${feitos} ajuste(s) já gravados)` : ''}` };
    }
    feitos++;
  }
  revalidar(projetoId);
  return { ok: true, valor: feitos, mensagem: `Inventário salvo: ${feitos} ${feitos === 1 ? 'ajuste' : 'ajustes'}.` };
}

// ---------------------------------------------------------------- ferramentas (RF-404)

export async function emprestarFerramenta(_: EstadoForm, form: FormData): Promise<EstadoForm> {
  const valores = valoresDe(form);
  const projetoId = uuid.safeParse(valores.projeto_id);
  if (!projetoId.success) return { erros: { projeto_id: 'Escolha a obra' }, valores };
  const e = emprestimoSchema.safeParse(valores);
  if (!e.success) return { erros: errosPorCampo(e.error), valores };

  const supabase = await criarClienteServidor();
  const { error } = await supabase.rpc('emprestar_ferramenta', {
    p_projeto_id: projetoId.data,
    p_item_id: e.data.item_id,
    p_trabalhador_id: e.data.trabalhador_id ?? undefined,
    p_responsavel: e.data.responsavel ?? undefined,
    p_devolver_ate: e.data.devolver_ate ?? undefined,
    p_observacao: e.data.observacao ?? undefined,
  });
  if (error) return { erroGeral: mensagemDoBanco(error), valores };
  revalidar(projetoId.data);
  revalidatePath(`/f/${e.data.item_id}`);
  return { ok: true, mensagem: 'Ferramenta emprestada.' };
}

export async function devolverFerramenta(projetoId: string, itemId: string, observacao: string): Promise<Resultado<number>> {
  if (!uuid.safeParse(projetoId).success || !uuid.safeParse(itemId).success) return { ok: false, erro: 'Pedido inválido.' };
  const supabase = await criarClienteServidor();
  const { data, error } = await supabase.rpc('devolver_ferramenta', {
    p_item_id: itemId,
    p_observacao: observacao.trim().slice(0, 500) || undefined,
  });
  if (error) return { ok: false, erro: mensagemDoBanco(error) };
  revalidar(projetoId);
  revalidatePath(`/f/${itemId}`);
  return {
    ok: true,
    valor: data,
    mensagem: data === 0 ? 'Devolução registrada (no mesmo dia).' : `Devolução registrada: ${data} ${data === 1 ? 'dia' : 'dias'} fora.`,
  };
}
