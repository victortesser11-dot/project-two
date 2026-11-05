'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { z } from 'zod';
import { contratoMedicaoSchema, errosPorCampo, hojeIso, itemContratoSchema } from '@obras/shared';
import { criarClienteServidor } from '@/lib/supabase/server';
import { mensagemDoBanco } from '@/lib/erros';
import type { EstadoForm, Resultado } from '../acoes';

const uuid = z.string().uuid();
const dataIso = z.string().regex(/^\d{4}-\d{2}-\d{2}$/);
const valoresDe = (form: FormData) => Object.fromEntries([...form.entries()].map(([k, v]) => [k, String(v)]));

function revalidar(projetoId: string) {
  revalidatePath(`/projetos/${projetoId}/orcamento`, 'layout');
}

/** Cria o contrato (cliente ou empreiteira) com os itens tirados da EAP. */
export async function criarContratoMedicao(_: EstadoForm, form: FormData): Promise<EstadoForm> {
  const valores = valoresDe(form);
  const projetoId = uuid.safeParse(valores.projeto_id);
  if (!projetoId.success) return { erroGeral: 'Obra inválida.', valores };
  const c = contratoMedicaoSchema.safeParse(valores);
  if (!c.success) return { erros: errosPorCampo(c.error), valores };
  // Cada etapa marcada traz as tarefas de dentro, separadas por vírgula.
  const tarefas = form
    .getAll('etapas')
    .flatMap((v) => String(v).split(','))
    .filter((t) => uuid.safeParse(t).success);
  if (c.data.parte === 'empreiteiro' && tarefas.length === 0) return { erros: { etapas: 'Escolha as etapas da empreitada' }, valores };
  const supabase = await criarClienteServidor();
  const { data, error } = await supabase.rpc('salvar_contrato_medicao', {
    p_id: null as unknown as string,
    p_projeto_id: projetoId.data,
    p_campos: { ...c.data, ...(c.data.parte === 'empreiteiro' ? { tarefas } : {}) },
  });
  if (error || !data) return { erroGeral: mensagemDoBanco(error), valores };
  revalidar(projetoId.data);
  redirect(`/projetos/${projetoId.data}/orcamento/medicoes?contrato=${data}`);
}

export async function atualizarContratoMedicao(_: EstadoForm, form: FormData): Promise<EstadoForm> {
  const valores = valoresDe(form);
  const projetoId = uuid.safeParse(valores.projeto_id);
  const contratoId = uuid.safeParse(valores.contrato_id);
  if (!projetoId.success || !contratoId.success) return { erroGeral: 'Contrato inválido.', valores };
  const c = contratoMedicaoSchema.safeParse(valores);
  if (!c.success) return { erros: errosPorCampo(c.error), valores };
  const supabase = await criarClienteServidor();
  const { error } = await supabase.rpc('salvar_contrato_medicao', {
    p_id: contratoId.data,
    p_projeto_id: projetoId.data,
    p_campos: { nome: c.data.nome, retencao_pct: c.data.retencao_pct, prazo_pagamento_dias: c.data.prazo_pagamento_dias },
  });
  if (error) return { erroGeral: mensagemDoBanco(error), valores };
  revalidar(projetoId.data);
  return { ok: true, mensagem: 'Contrato atualizado. A retenção nova vale para as próximas medições.' };
}

export async function definirItemContrato(_: EstadoForm, form: FormData): Promise<EstadoForm> {
  const valores = valoresDe(form);
  const projetoId = uuid.safeParse(valores.projeto_id);
  const contratoId = uuid.safeParse(valores.contrato_id);
  const tarefaId = uuid.safeParse(valores.tarefa_id);
  if (!projetoId.success || !contratoId.success) return { erroGeral: 'Contrato inválido.', valores };
  if (!tarefaId.success) return { erros: { tarefa_id: 'Escolha a tarefa' }, valores };
  const i = itemContratoSchema.safeParse(valores);
  if (!i.success) return { erros: errosPorCampo(i.error), valores };
  const supabase = await criarClienteServidor();
  const { error } = await supabase.rpc('definir_item_contrato', { p_contrato_id: contratoId.data, p_tarefa_id: tarefaId.data, p_campos: i.data });
  if (error) return { erroGeral: mensagemDoBanco(error), valores };
  revalidar(projetoId.data);
  return { ok: true, mensagem: 'Item do contrato salvo.' };
}

export async function removerItemContrato(projetoId: string, itemId: string): Promise<Resultado> {
  if (!uuid.safeParse(projetoId).success || !uuid.safeParse(itemId).success) return { ok: false, erro: 'Pedido inválido.' };
  const supabase = await criarClienteServidor();
  const { error } = await supabase.rpc('remover_item_contrato', { p_item_id: itemId });
  if (error) return { ok: false, erro: mensagemDoBanco(error) };
  revalidar(projetoId);
  return { ok: true };
}

/** Gera o rascunho do próximo boletim até a data escolhida e abre o boletim. */
export async function gerarMedicao(_: EstadoForm, form: FormData): Promise<EstadoForm> {
  const valores = valoresDe(form);
  const projetoId = uuid.safeParse(valores.projeto_id);
  const contratoId = uuid.safeParse(valores.contrato_id);
  const fim = dataIso.safeParse(valores.fim);
  if (!projetoId.success || !contratoId.success) return { erroGeral: 'Contrato inválido.', valores };
  if (!fim.success) return { erros: { fim: 'Informe até que dia medir' }, valores };
  if (fim.data > hojeIso()) return { erros: { fim: 'A medição vai até hoje, no máximo' }, valores };
  const supabase = await criarClienteServidor();
  const { data, error } = await supabase.rpc('gerar_medicao', { p_contrato_id: contratoId.data, p_fim: fim.data });
  if (error || !data) return { erroGeral: mensagemDoBanco(error), valores };
  revalidar(projetoId.data);
  redirect(`/projetos/${projetoId.data}/orcamento/medicoes/${data}`);
}

/** Ajusta as quantidades do rascunho; para no primeiro item que o banco recusar. */
export async function ajustarMedicao(
  projetoId: string,
  medicaoId: string,
  ajustes: { itemId: string; quantidade: number }[],
): Promise<Resultado<{ itemId: string } | undefined>> {
  if (!uuid.safeParse(projetoId).success || !uuid.safeParse(medicaoId).success) return { ok: false, erro: 'Pedido inválido.' };
  const supabase = await criarClienteServidor();
  for (const a of ajustes) {
    if (!uuid.safeParse(a.itemId).success || !Number.isFinite(a.quantidade) || a.quantidade < 0) return { ok: false, erro: 'Quantidade inválida.' };
    const { error } = await supabase.rpc('ajustar_item_medicao', { p_medicao_id: medicaoId, p_contrato_item_id: a.itemId, p_quantidade: a.quantidade });
    if (error) {
      revalidar(projetoId);
      return { ok: false, erro: mensagemDoBanco(error) };
    }
  }
  revalidar(projetoId);
  return { ok: true, mensagem: 'Medição atualizada.' };
}

export async function observarMedicao(projetoId: string, medicaoId: string, observacao: string): Promise<Resultado> {
  if (!uuid.safeParse(projetoId).success || !uuid.safeParse(medicaoId).success) return { ok: false, erro: 'Pedido inválido.' };
  if (observacao.length > 2000) return { ok: false, erro: 'Observação com até 2.000 caracteres.' };
  const supabase = await criarClienteServidor();
  const { error } = await supabase.rpc('observar_medicao', { p_medicao_id: medicaoId, p_observacao: observacao });
  if (error) return { ok: false, erro: mensagemDoBanco(error) };
  revalidar(projetoId);
  return { ok: true, mensagem: 'Observação salva.' };
}

export async function aprovarMedicao(projetoId: string, medicaoId: string): Promise<Resultado<string>> {
  if (!uuid.safeParse(projetoId).success || !uuid.safeParse(medicaoId).success) return { ok: false, erro: 'Pedido inválido.' };
  const supabase = await criarClienteServidor();
  const { data, error } = await supabase.rpc('aprovar_medicao', { p_medicao_id: medicaoId });
  if (error) return { ok: false, erro: mensagemDoBanco(error) };
  revalidar(projetoId);
  return { ok: true, valor: data ?? undefined };
}

export async function registrarPagamentoMedicao(_: EstadoForm, form: FormData): Promise<EstadoForm> {
  const valores = valoresDe(form);
  const projetoId = uuid.safeParse(valores.projeto_id);
  const medicaoId = uuid.safeParse(valores.medicao_id);
  const data = dataIso.safeParse(valores.data);
  if (!projetoId.success || !medicaoId.success) return { erroGeral: 'Medição inválida.', valores };
  if (!data.success) return { erros: { data: 'Informe a data do pagamento' }, valores };
  const valor = valores.valor ? Number(valores.valor.replace(/\./g, '').replace(',', '.')) : null;
  if (valor !== null && (!Number.isFinite(valor) || valor < 0)) return { erros: { valor: 'Valor inválido' }, valores };
  const supabase = await criarClienteServidor();
  const { error } = await supabase.rpc('registrar_pagamento_medicao', {
    p_medicao_id: medicaoId.data,
    p_data: data.data,
    ...(valor !== null ? { p_valor: valor } : {}),
  });
  if (error) return { erroGeral: mensagemDoBanco(error), valores };
  revalidar(projetoId.data);
  return { ok: true, mensagem: 'Pagamento registrado.' };
}

export async function excluirMedicao(projetoId: string, medicaoId: string): Promise<Resultado> {
  if (!uuid.safeParse(projetoId).success || !uuid.safeParse(medicaoId).success) return { ok: false, erro: 'Pedido inválido.' };
  const supabase = await criarClienteServidor();
  const { error } = await supabase.rpc('excluir_medicao', { p_medicao_id: medicaoId });
  if (error) return { ok: false, erro: mensagemDoBanco(error) };
  revalidar(projetoId);
  redirect(`/projetos/${projetoId}/orcamento/medicoes`);
}
