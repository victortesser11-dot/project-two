'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { compromissoSchema, composicaoSchema, despesaSchema, errosPorCampo, hojeIso, regraSemaforoSchema, versaoOrcamentoSchema } from '@obras/shared';
import { criarClienteServidor } from '@/lib/supabase/server';
import { mensagemDoBanco } from '@/lib/erros';

export type EstadoForm = { ok?: boolean; mensagem?: string; erros?: Record<string, string>; erroGeral?: string; valores?: Record<string, string> };
export type Resultado<T = undefined> = { ok: true; mensagem?: string; valor?: T } | { ok: false; erro: string };

const uuid = z.string().uuid();
const valoresDe = (form: FormData) => Object.fromEntries([...form.entries()].map(([k, v]) => [k, String(v)]));

function revalidar(projetoId: string) {
  revalidatePath(`/projetos/${projetoId}`, 'layout');
  revalidatePath('/');
}

/** Composição do custo da tarefa (material, mão de obra, equipamento, outros). */
export async function definirComposicao(_: EstadoForm, form: FormData): Promise<EstadoForm> {
  const valores = valoresDe(form);
  const projetoId = uuid.safeParse(valores.projeto_id);
  const tarefaId = uuid.safeParse(valores.tarefa_id);
  if (!projetoId.success || !tarefaId.success) return { erroGeral: 'Tarefa inválida.', valores };
  const c = composicaoSchema.safeParse(valores);
  if (!c.success) return { erros: errosPorCampo(c.error), valores };
  const supabase = await criarClienteServidor();
  const { data, error } = await supabase.rpc('definir_composicao_custo', {
    p_tarefa_id: tarefaId.data,
    p_material: c.data.material as number,
    p_mao_obra: c.data.mao_obra as number,
    p_equipamento: c.data.equipamento as number,
    p_outros: c.data.outros as number,
  });
  if (error) return { erroGeral: mensagemDoBanco(error), valores };
  revalidar(projetoId.data);
  const vazio = [c.data.material, c.data.mao_obra, c.data.equipamento, c.data.outros].every((v) => v === null);
  return { ok: true, mensagem: vazio ? 'Composição removida; o custo da tarefa ficou como estava.' : `Custo da tarefa: ${Number(data).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}.` };
}

export async function salvarVersao(_: EstadoForm, form: FormData): Promise<EstadoForm> {
  const valores = valoresDe(form);
  const projetoId = uuid.safeParse(valores.projeto_id);
  if (!projetoId.success) return { erroGeral: 'Obra inválida.', valores };
  const v = versaoOrcamentoSchema.safeParse(valores);
  if (!v.success) return { erros: errosPorCampo(v.error), valores };
  const supabase = await criarClienteServidor();
  const { error } = await supabase.rpc('salvar_versao_orcamento', { p_projeto_id: projetoId.data, p_nome: v.data.nome });
  if (error) return { erroGeral: mensagemDoBanco(error), valores };
  revalidar(projetoId.data);
  return { ok: true, mensagem: `Versão "${v.data.nome}" guardada.` };
}

export async function registrarDespesa(_: EstadoForm, form: FormData): Promise<EstadoForm> {
  const valores = valoresDe(form);
  const projetoId = uuid.safeParse(valores.projeto_id);
  if (!projetoId.success) return { erroGeral: 'Obra inválida.', valores };
  const d = despesaSchema.safeParse(valores);
  if (!d.success) return { erros: errosPorCampo(d.error), valores };
  if (d.data.data > hojeIso()) return { erros: { data: 'A despesa não pode ser de um dia futuro' }, valores };
  const supabase = await criarClienteServidor();
  const { error } = await supabase.rpc('registrar_despesa', {
    p_projeto_id: projetoId.data,
    p_tarefa_id: d.data.tarefa_id,
    p_data: d.data.data,
    p_categoria: d.data.categoria,
    p_descricao: d.data.descricao,
    p_valor: d.data.valor!,
    p_fornecedor: d.data.fornecedor ?? undefined,
    p_documento: d.data.documento ?? undefined,
    p_compromisso_id: d.data.compromisso_id ?? undefined,
  });
  if (error) return { erroGeral: mensagemDoBanco(error), valores };
  revalidar(projetoId.data);
  return { ok: true, mensagem: 'Despesa lançada.', valores: { tarefa_id: d.data.tarefa_id, data: d.data.data, categoria: d.data.categoria } };
}

export async function excluirDespesa(projetoId: string, despesaId: string): Promise<Resultado> {
  if (!uuid.safeParse(projetoId).success || !uuid.safeParse(despesaId).success) return { ok: false, erro: 'Pedido inválido.' };
  const supabase = await criarClienteServidor();
  const { error } = await supabase.rpc('excluir_despesa', { p_id: despesaId });
  if (error) return { ok: false, erro: mensagemDoBanco(error) };
  revalidar(projetoId);
  return { ok: true, mensagem: 'Despesa tirada.' };
}

export async function salvarCompromisso(_: EstadoForm, form: FormData): Promise<EstadoForm> {
  const valores = valoresDe(form);
  const projetoId = uuid.safeParse(valores.projeto_id);
  if (!projetoId.success) return { erroGeral: 'Obra inválida.', valores };
  const c = compromissoSchema.safeParse(valores);
  if (!c.success) return { erros: errosPorCampo(c.error), valores };
  const id = valores.compromisso_id ? uuid.safeParse(valores.compromisso_id) : null;
  if (id && !id.success) return { erroGeral: 'Contrato inválido.', valores };
  const supabase = await criarClienteServidor();
  const { error } = await supabase.rpc('salvar_compromisso', {
    p_id: id ? id.data : (null as unknown as string),
    p_projeto_id: projetoId.data,
    p_campos: { ...c.data, empreiteira_id: c.data.empreiteira_id ?? '', cnpj: c.data.cnpj ?? '' },
  });
  if (error) return { erroGeral: mensagemDoBanco(error), valores };
  revalidar(projetoId.data);
  return { ok: true, mensagem: id ? 'Contrato salvo.' : `${c.data.tipo === 'contrato' ? 'Contrato' : 'Pedido'} lançado.` };
}

export async function encerrarCompromisso(projetoId: string, compromissoId: string, encerrado: boolean): Promise<Resultado> {
  if (!uuid.safeParse(projetoId).success || !uuid.safeParse(compromissoId).success) return { ok: false, erro: 'Pedido inválido.' };
  const supabase = await criarClienteServidor();
  const { error } = await supabase.rpc('encerrar_compromisso', { p_id: compromissoId, p_encerrado: encerrado });
  if (error) return { ok: false, erro: mensagemDoBanco(error) };
  revalidar(projetoId);
  return { ok: true, mensagem: encerrado ? 'Encerrado: o comprometido passa a ser o que foi pago.' : 'Reaberto.' };
}

export async function definirRegras(_: EstadoForm, form: FormData): Promise<EstadoForm> {
  const valores = valoresDe(form);
  const empresaId = uuid.safeParse(valores.empresa_id);
  if (!empresaId.success) return { erroGeral: 'Empresa inválida.', valores };
  const r = regraSemaforoSchema.safeParse(valores);
  if (!r.success) return { erros: errosPorCampo(r.error), valores };
  const supabase = await criarClienteServidor();
  const { error } = await supabase.rpc('definir_regras_semaforo', {
    p_empresa_id: empresaId.data,
    p_atraso_amarelo_dias: r.data.atraso_amarelo_dias,
    p_atraso_vermelho_dias: r.data.atraso_vermelho_dias,
    p_custo_amarelo_pct: r.data.custo_amarelo_pct!,
    p_custo_vermelho_pct: r.data.custo_vermelho_pct!,
  });
  if (error) return { erroGeral: mensagemDoBanco(error), valores };
  revalidatePath('/');
  return { ok: true, mensagem: 'Regras do semáforo salvas.' };
}
