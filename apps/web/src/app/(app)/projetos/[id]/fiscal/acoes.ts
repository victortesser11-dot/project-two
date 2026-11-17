'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import {
  achadosDaLeitura,
  dataIsoValida,
  extrairJson,
  hojeIso,
  leituraFiscalSchema,
  LIMITE_BYTES_IA,
  MAX_IMAGENS_PEDIDO_FISCAL,
  mimeParaIa,
  pedidoFiscalDia,
} from '@obras/shared';
import type { Json } from '@/lib/database.types';
import { avancosDoDia, buscarDiario, buscarEap, buscarProjeto, fotosCameraParaFiscal, leiturasIaHoje, podeApontarCampo } from '@/lib/dados';
import { ErroIa, limiteDiarioIa, perguntarIa, type Anexo } from '@/lib/ia';
import { mensagemDoBanco } from '@/lib/erros';
import { criarClienteServidor } from '@/lib/supabase/server';
import { tarefasDoDia } from '../diario/leituraIa';

export type ResultadoFiscal<T> = { ok: true; valor: T } | { ok: false; erro: string };

const uuid = z.string().uuid();
const MAX_CAMERAS = 3;

const hora = (instante: string) =>
  new Date(instante).toLocaleTimeString('pt-BR', { timeZone: 'America/Sao_Paulo', hour: '2-digit', minute: '2-digit' });

/**
 * Fiscaliza um dia: a última foto de cada câmera no dia e no dia anterior, mais as fotos do diário, contra as tarefas
 * previstas e o avanço apontado no dia. Os achados ficam pendentes até alguém conferir.
 */
export async function fiscalizarDia(projetoId: string, data: string): Promise<ResultadoFiscal<{ id: string; modelo: string; achados: number }>> {
  if (!uuid.safeParse(projetoId).success || !dataIsoValida(data) || data > hojeIso()) return { ok: false, erro: 'Escolha um dia até hoje.' };
  const dados = await buscarProjeto(projetoId);
  if (!dados) return { ok: false, erro: 'Obra não encontrada.' };
  const { projeto, papel } = dados;
  if (!(await podeApontarCampo(projeto, papel))) return { ok: false, erro: 'Só o engenheiro, o mestre e o admin fiscalizam com IA.' };
  if ((await leiturasIaHoje(projetoId)) >= limiteDiarioIa()) {
    return { ok: false, erro: `A obra já fez ${limiteDiarioIa()} leituras com IA hoje (limite para não estourar a cota grátis). Tente amanhã.` };
  }

  const [cameras, { diario, fotos: fotosDiario }, itens, apontados] = await Promise.all([
    fotosCameraParaFiscal(projetoId, data),
    buscarDiario(projetoId, data),
    buscarEap(projetoId),
    avancosDoDia(projetoId, data),
  ]);

  const supabase = await criarClienteServidor();
  const anexos: Anexo[] = [];
  const rotulos: string[] = [];
  const fotosCamera: string[] = [];
  let bytes = 0;
  const baixar = async (bucket: 'cameras' | 'diario', caminho: string, rotulo: string) => {
    if (anexos.length >= MAX_IMAGENS_PEDIDO_FISCAL) return false;
    const { data: arquivo, error } = await supabase.storage.from(bucket).download(caminho);
    if (error || !arquivo) return false;
    const conteudo = new Uint8Array(await arquivo.arrayBuffer());
    if (bytes + conteudo.byteLength > LIMITE_BYTES_IA) return false;
    bytes += conteudo.byteLength;
    anexos.push({ mime: mimeParaIa(caminho) ?? 'image/jpeg', dados: conteudo, nome: caminho });
    rotulos.push(rotulo);
    return true;
  };

  for (const c of cameras.slice(0, MAX_CAMERAS)) {
    if (c.hoje && (await baixar('cameras', c.hoje.caminho, `Câmera ${c.camera.nome}, dia fiscalizado ${hora(c.hoje.capturada_em)}`))) fotosCamera.push(c.hoje.id);
    if (c.ontem && (await baixar('cameras', c.ontem.caminho, `Câmera ${c.camera.nome}, dia anterior ${hora(c.ontem.capturada_em)}`))) fotosCamera.push(c.ontem.id);
  }
  let usouDiario = false;
  for (const [i, f] of [...fotosDiario].reverse().entries()) {
    if (await baixar('diario', f.caminho, `Foto do diário ${i + 1}${f.legenda ? `: "${f.legenda}"` : ''}`)) usouDiario = true;
  }
  if (anexos.length === 0) {
    return { ok: false, erro: 'Esse dia não tem foto de câmera nem foto no diário. Envie fotos ao diário ou confira as câmeras.' };
  }

  const tarefas = tarefasDoDia(itens, data, usouDiario ? fotosDiario.flatMap((f) => (f.tarefa_id ? [f.tarefa_id] : [])) : []);
  const instrucao = pedidoFiscalDia({ obra: projeto.nome, data, tarefas, imagens: rotulos, apontadosNoDia: apontados });

  let resposta;
  try {
    resposta = await perguntarIa(instrucao, anexos, { prazoMs: 250_000, maxTokens: 3_000 });
  } catch (erro) {
    if (!(erro instanceof ErroIa)) console.error('IA: falha inesperada', erro);
    return { ok: false, erro: erro instanceof ErroIa ? erro.message : 'A leitura com IA falhou. Tente de novo.' };
  }
  const leitura = leituraFiscalSchema.safeParse(extrairJson(resposta.texto));
  if (!leitura.success) {
    console.error(`IA (${resposta.modelo}) respondeu fora do formato: ${resposta.texto.slice(0, 300)}`);
    return { ok: false, erro: 'A IA respondeu fora do formato esperado. Tente de novo.' };
  }
  const achados = achadosDaLeitura(leitura.data, tarefas, apontados);

  const id = crypto.randomUUID();
  const { error } = await supabase.rpc('registrar_fiscal_ia', {
    p_id: id,
    p_projeto_id: projetoId,
    p_data: data,
    p_modelo: resposta.modelo,
    p_resultado: { leitura: leitura.data, imagens: rotulos, tarefas } as unknown as Json,
    p_fotos_camera: fotosCamera,
    ...(usouDiario && diario ? { p_diario_id: diario.id } : {}),
    p_achados: achados as unknown as Json,
  });
  if (error) return { ok: false, erro: mensagemDoBanco(error) };
  revalidatePath(`/projetos/${projetoId}`, 'layout');
  return { ok: true, valor: { id, modelo: resposta.modelo, achados: achados.length } };
}

const resolucaoSchema = z.object({
  achadoId: z.string().uuid(),
  situacao: z.enum(['confirmado', 'corrigido', 'descartado']),
  percentual: z.number().min(0).max(100).nullable(),
  resposta: z.string().trim().max(500).nullable(),
});

/** Confere um achado. Avanço confirmado ou corrigido vira apontamento (registrar_avanco, no banco). */
export async function conferirAchado(
  projetoId: string,
  entrada: { achadoId: string; situacao: 'confirmado' | 'corrigido' | 'descartado'; percentual?: number | null; resposta?: string | null },
): Promise<ResultadoFiscal<null>> {
  const r = resolucaoSchema.safeParse({ percentual: null, resposta: null, ...entrada });
  if (!uuid.safeParse(projetoId).success || !r.success) return { ok: false, erro: 'Pedido inválido.' };
  if (r.data.situacao === 'corrigido' && r.data.percentual === null) return { ok: false, erro: 'Informe o avanço certo, de 0 a 100%.' };
  const supabase = await criarClienteServidor();
  const { error } = await supabase.rpc('resolver_achado_fiscal', {
    p_id: r.data.achadoId,
    p_situacao: r.data.situacao,
    ...(r.data.percentual !== null ? { p_percentual: r.data.percentual } : {}),
    ...(r.data.resposta ? { p_resposta: r.data.resposta } : {}),
    p_avanco_id: crypto.randomUUID(),
  });
  if (error) return { ok: false, erro: mensagemDoBanco(error) };
  revalidatePath(`/projetos/${projetoId}`, 'layout');
  return { ok: true, valor: null };
}
