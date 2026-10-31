'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import {
  chamadaSchema,
  cnpjValido,
  custoMaoObraSchema,
  dataIsoValida,
  empreiteiraSchema,
  errosPorCampo,

  trabalhadorSchema,
  type ChamadaValidada,
  type DadosCnpj,
} from '@obras/shared';
import { criarClienteServidor } from '@/lib/supabase/server';
import { mensagemDoBanco } from '@/lib/erros';
import { consultarCnpj } from '@/lib/brasilapi';

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

/** Cadastra (sem pessoa_id) ou edita (com pessoa_id). Pessoa nova entra na equipe da obra. */
export async function salvarPessoa(_: EstadoForm, form: FormData): Promise<EstadoForm> {
  const valores = Object.fromEntries([...form.entries()].map(([k, v]) => [k, String(v)]));
  const projetoId = uuid.safeParse(valores.projeto_id);
  if (!projetoId.success) return { erroGeral: 'Obra inválida.', valores };
  const p = trabalhadorSchema.safeParse(valores);
  if (!p.success) return { erros: errosPorCampo(p.error), valores };

  const { supabase, empresaId } = await empresaDoProjeto(projetoId.data);
  if (!empresaId) return { erroGeral: 'Obra não encontrada.', valores };

  const pessoaId = valores.pessoa_id ? uuid.safeParse(valores.pessoa_id) : null;
  if (pessoaId) {
    if (!pessoaId.success) return { erroGeral: 'Pessoa inválida.', valores };
    // CPF só é regravado quando digitado (o app não recebe o CPF guardado).
    const { cpf, ...resto } = p.data;
    const { data, error } = await supabase
      .from('trabalhador')
      .update(cpf ? { ...resto, cpf } : resto)
      .eq('id', pessoaId.data)
      .select('id');
    if (error) return { erroGeral: mensagemDoBanco(error), valores };
    if (!data?.length) return { erroGeral: 'Sem permissão para editar esta pessoa.', valores };
  } else {
    const { data, error } = await supabase
      .from('trabalhador')
      .insert({ ...p.data, empresa_id: empresaId })
      .select('id')
      .single();
    if (error) return { erroGeral: mensagemDoBanco(error), valores };
    const incluir = await supabase.from('equipe_projeto').insert({ projeto_id: projetoId.data, trabalhador_id: data.id, empresa_id: empresaId });
    if (incluir.error) return { erroGeral: `Pessoa cadastrada, mas não entrou na obra: ${mensagemDoBanco(incluir.error)}` };
  }
  revalidar(projetoId.data);
  return { ok: true, mensagem: pessoaId ? 'Dados salvos.' : `${p.data.nome} entrou na equipe da obra.` };
}

export async function incluirNaEquipe(projetoId: string, pessoaIds: string[]): Promise<Resultado> {
  if (!uuid.safeParse(projetoId).success || !z.array(uuid).min(1).max(200).safeParse(pessoaIds).success) return { ok: false, erro: 'Pedido inválido.' };
  const { supabase, empresaId } = await empresaDoProjeto(projetoId);
  if (!empresaId) return { ok: false, erro: 'Obra não encontrada.' };
  const { error } = await supabase
    .from('equipe_projeto')
    .upsert(pessoaIds.map((id) => ({ projeto_id: projetoId, trabalhador_id: id, empresa_id: empresaId, ativo: true })));
  if (error) return { ok: false, erro: mensagemDoBanco(error) };
  revalidar(projetoId);
  return { ok: true, mensagem: pessoaIds.length === 1 ? 'Pessoa incluída na obra.' : `${pessoaIds.length} pessoas incluídas na obra.` };
}

/** Tira da chamada sem apagar o histórico (a pessoa fica inativa nesta obra). */
export async function definirNaObra(projetoId: string, pessoaId: string, naObra: boolean): Promise<Resultado> {
  if (!uuid.safeParse(projetoId).success || !uuid.safeParse(pessoaId).success) return { ok: false, erro: 'Pedido inválido.' };
  const supabase = await criarClienteServidor();
  const { data, error } = await supabase
    .from('equipe_projeto')
    .update({ ativo: naObra })
    .eq('projeto_id', projetoId)
    .eq('trabalhador_id', pessoaId)
    .select('trabalhador_id');
  if (error) return { ok: false, erro: mensagemDoBanco(error) };
  if (!data?.length) return { ok: false, erro: 'Sem permissão para mudar a equipe desta obra.' };
  revalidar(projetoId);
  return { ok: true, mensagem: naObra ? 'Voltou para a chamada.' : 'Saiu da chamada. O histórico continua.' };
}

/** Consulta o CNPJ na Receita (BrasilAPI) para preencher o cadastro. */
export async function buscarCnpj(cnpj: string): Promise<Resultado<DadosCnpj>> {
  if (!cnpjValido(cnpj)) return { ok: false, erro: 'CNPJ inválido: confira os números.' };
  const dados = await consultarCnpj(cnpj);
  if (!dados) return { ok: false, erro: 'Não foi possível consultar a Receita agora. Preencha o nome à mão.' };
  return { ok: true, valor: dados };
}

export async function salvarEmpreiteira(_: EstadoForm, form: FormData): Promise<EstadoForm> {
  const valores = Object.fromEntries([...form.entries()].map(([k, v]) => [k, String(v)]));
  const projetoId = uuid.safeParse(valores.projeto_id);
  if (!projetoId.success) return { erroGeral: 'Obra inválida.', valores };
  const e = empreiteiraSchema.safeParse(valores);
  if (!e.success) return { erros: errosPorCampo(e.error), valores };

  const { supabase, empresaId } = await empresaDoProjeto(projetoId.data);
  if (!empresaId) return { erroGeral: 'Obra não encontrada.', valores };
  // Situação na Receita no momento do cadastro (se a consulta responder).
  const receita = e.data.cnpj ? await consultarCnpj(e.data.cnpj) : null;
  const { error } = await supabase.from('empreiteira').insert({
    empresa_id: empresaId,
    nome: e.data.nome,
    cnpj: e.data.cnpj,
    telefone: e.data.telefone ?? (receita?.telefone ?? null),
    situacao_cnpj: receita?.situacao ?? null,
  });
  if (error) {
    if (/empreiteira_cnpj_uk/.test(`${error.message} ${error.details ?? ''}`)) return { erroGeral: 'Esse CNPJ já está cadastrado.', valores };
    return { erroGeral: mensagemDoBanco(error), valores };
  }
  revalidar(projetoId.data);
  const alerta = receita && !receita.ativa ? ` Atenção: na Receita o CNPJ está ${receita.situacao?.toLowerCase() ?? 'irregular'}.` : '';
  return { ok: true, mensagem: `Empreiteira cadastrada.${alerta}` };
}

export async function salvarCusto(_: EstadoForm, form: FormData): Promise<EstadoForm> {
  const valores = Object.fromEntries([...form.entries()].map(([k, v]) => [k, String(v)]));
  const ids = z.object({ projeto_id: uuid, pessoa_id: uuid }).safeParse(valores);
  if (!ids.success) return { erroGeral: 'Pedido inválido.', valores };
  const c = custoMaoObraSchema.safeParse(valores);
  if (!c.success) return { erros: errosPorCampo(c.error), valores };

  const supabase = await criarClienteServidor();
  const { error } = await supabase.rpc('definir_custo_mao_obra', {
    p_trabalhador_id: ids.data.pessoa_id,
    p_tipo: c.data.tipo,
    p_valor: c.data.valor,
    p_vigente_desde: c.data.vigente_desde,
    p_unidade_producao: c.data.unidade_producao ?? undefined,
  });
  if (error) return { erroGeral: mensagemDoBanco(error), valores };
  revalidar(ids.data.projeto_id);
  return { ok: true, mensagem: 'Custo lançado.' };
}

export async function registrarChamada(projetoId: string, data: string, linhas: ChamadaValidada): Promise<Resultado<number>> {
  if (!uuid.safeParse(projetoId).success || !dataIsoValida(data)) return { ok: false, erro: 'Pedido inválido.' };
  const l = chamadaSchema.safeParse(linhas);
  if (!l.success) return { ok: false, erro: l.error.issues[0]?.message ?? 'Chamada inválida.' };
  const supabase = await criarClienteServidor();
  const { data: presentes, error } = await supabase.rpc('registrar_chamada', { p_projeto_id: projetoId, p_data: data, p_linhas: l.data });
  if (error) return { ok: false, erro: mensagemDoBanco(error) };
  revalidar(projetoId);
  return { ok: true, valor: presentes, mensagem: `Chamada salva: ${presentes} de ${l.data.length} ${l.data.length === 1 ? 'pessoa' : 'pessoas'} na obra.` };
}

