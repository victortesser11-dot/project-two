'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import {
  dataIsoValida,
  extrairJson,
  leituraFotosSchema,
  LIMITE_BYTES_IA,
  LIMITE_FOTOS_IA,
  mimeParaIa,
  pedidoLeituraFotos,
  tarefasDaLeitura,
  type LeituraFotos,
} from '@obras/shared';
import type { Json } from '@/lib/database.types';
import { buscarDiario, buscarEap, buscarProjeto, leiturasIaHoje, podeApontarCampo, podeEditarProjeto } from '@/lib/dados';
import { ErroIa, limiteDiarioIa, perguntarIa, type Anexo } from '@/lib/ia';
import { mensagemDoBanco } from '@/lib/erros';
import { criarClienteServidor } from '@/lib/supabase/server';
import { MAX_TAREFAS_FOTO, tarefasDoDia } from './leituraIa';

export type LinhaLeituraFoto = ReturnType<typeof tarefasDaLeitura>[number];
export type LeituraFotosPronta = { id: string; modelo: string; leitura: LeituraFotos; linhas: LinhaLeituraFoto[] };
export type ResultadoIa<T> = { ok: true; valor: T } | { ok: false; erro: string };

const uuid = z.string().uuid();

/** A IA olha as fotos do dia e diz, para cada tarefa prevista, se há sinal de avanço. Só sugestão. */
export async function lerFotosDoDiaComIa(projetoId: string, data: string): Promise<ResultadoIa<LeituraFotosPronta>> {
  if (!uuid.safeParse(projetoId).success || !dataIsoValida(data)) return { ok: false, erro: 'Pedido inválido.' };
  const dados = await buscarProjeto(projetoId);
  if (!dados) return { ok: false, erro: 'Obra não encontrada.' };
  const { projeto, papel } = dados;
  const [apontar, editar] = await Promise.all([podeApontarCampo(projeto, papel), podeEditarProjeto(projeto, papel)]);
  if (!apontar && !editar) return { ok: false, erro: 'Só o engenheiro e o mestre pedem a leitura das fotos.' };
  if ((await leiturasIaHoje(projetoId)) >= limiteDiarioIa()) {
    return { ok: false, erro: `A obra já fez ${limiteDiarioIa()} leituras com IA hoje (limite para não estourar a cota grátis). Tente amanhã.` };
  }

  const { diario, fotos } = await buscarDiario(projetoId, data);
  if (!diario || fotos.length === 0) return { ok: false, erro: 'Envie ao menos uma foto do dia para a IA ler.' };

  const supabase = await criarClienteServidor();
  const anexos: Anexo[] = [];
  const usadas: typeof fotos = [];
  let bytes = 0;
  // As mais recentes primeiro, até o limite de fotos e de tamanho.
  for (const f of [...fotos].reverse()) {
    if (anexos.length >= LIMITE_FOTOS_IA) break;
    const mime = mimeParaIa(f.caminho) ?? 'image/jpeg';
    const { data: arquivo, error } = await supabase.storage.from('diario').download(f.caminho);
    if (error || !arquivo) continue;
    const conteudo = new Uint8Array(await arquivo.arrayBuffer());
    if (bytes + conteudo.byteLength > LIMITE_BYTES_IA) continue;
    bytes += conteudo.byteLength;
    anexos.push({ mime, dados: conteudo, nome: f.caminho });
    usadas.push(f);
  }
  if (anexos.length === 0) return { ok: false, erro: 'Não foi possível abrir as fotos do dia no armazenamento.' };

  const itens = await buscarEap(projetoId);
  const pedidas = tarefasDoDia(itens, data, usadas.flatMap((f) => (f.tarefa_id ? [f.tarefa_id] : [])));
  const instrucao = pedidoLeituraFotos({
    obra: projeto.nome,
    data,
    tarefas: pedidas,
    fotos: usadas.map((f) => ({ legenda: f.legenda, tarefaId: f.tarefa_id })),
  });

  let resposta;
  try {
    resposta = await perguntarIa(instrucao, anexos);
  } catch (erro) {
    return { ok: false, erro: erro instanceof ErroIa ? erro.message : 'A leitura com IA falhou. Tente de novo.' };
  }
  const leitura = leituraFotosSchema.safeParse(extrairJson(resposta.texto));
  if (!leitura.success) return { ok: false, erro: 'A IA respondeu fora do formato esperado. Tente de novo.' };

  const id = crypto.randomUUID();
  const { error } = await supabase.rpc('registrar_analise_ia', {
    p_id: id,
    p_projeto_id: projetoId,
    p_tipo: 'fotos_diario',
    p_modelo: resposta.modelo,
    p_resultado: { leitura: leitura.data, pedidas } as unknown as Json,
    p_diario_id: diario.id,
  });
  if (error) return { ok: false, erro: mensagemDoBanco(error) };
  revalidatePath(`/projetos/${projetoId}/diario/${data}`);
  return { ok: true, valor: { id, modelo: resposta.modelo, leitura: leitura.data, linhas: tarefasDaLeitura(leitura.data, pedidas) } };
}

/** Grava o avanço que o engenheiro ou o mestre confirmou, pela mesma função do apontamento de campo. */
export async function confirmarAvancosDaIa(
  projetoId: string,
  data: string,
  itens: { tarefaId: string; percentual: number }[],
): Promise<ResultadoIa<number>> {
  const pedido = z
    .object({ p: uuid, d: z.string(), i: z.array(z.object({ tarefaId: uuid, percentual: z.number().min(0).max(100) })).min(1).max(MAX_TAREFAS_FOTO) })
    .safeParse({ p: projetoId, d: data, i: itens });
  if (!pedido.success || !dataIsoValida(data)) return { ok: false, erro: 'Marque ao menos uma tarefa com o % de 0 a 100.' };
  const { diario } = await buscarDiario(projetoId, data);
  if (diario?.status === 'assinado') return { ok: false, erro: 'O diário deste dia já foi assinado: aponte o avanço em outro dia.' };

  const supabase = await criarClienteServidor();
  let gravados = 0;
  for (const i of pedido.data.i) {
    const { error } = await supabase.rpc('registrar_avanco', {
      p_id: crypto.randomUUID(),
      p_tarefa_id: i.tarefaId,
      p_data: data,
      p_percentual: Math.round(i.percentual * 100) / 100,
      p_observacao: 'Confirmado a partir da leitura das fotos pela IA',
    });
    if (error) return { ok: false, erro: gravados ? `${gravados} gravados; parou numa tarefa: ${mensagemDoBanco(error)}` : mensagemDoBanco(error) };
    gravados += 1;
  }
  revalidatePath(`/projetos/${projetoId}`, 'layout');
  return { ok: true, valor: gravados };
}
