'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import {
  conferirSugestoes,
  extrairJson,
  leituraArquivosSchema,
  LIMITE_ARQUIVOS_IA,
  LIMITE_BYTES_IA,
  mimeParaIa,
  pedidoLeituraArquivos,
  resumoDaEap,
  ROTULO_CATEGORIA_ARQUIVO,
  type LeituraArquivos,
  type SugestaoConferida,
} from '@obras/shared';
import type { Json } from '@/lib/database.types';
import { buscarEap, buscarProjeto, leiturasIaHoje, listarArquivos, podeEditarProjeto } from '@/lib/dados';
import { ErroIa, iaLePdf, limiteDiarioIa, perguntarIa, type Anexo } from '@/lib/ia';
import { mensagemDoBanco } from '@/lib/erros';
import { criarClienteServidor } from '@/lib/supabase/server';

export type LeituraArquivosPronta = {
  id: string;
  modelo: string;
  leitura: LeituraArquivos;
  sugestoes: SugestaoConferida[];
};
export type ResultadoIa<T> = { ok: true; valor: T } | { ok: false; erro: string };

const uuid = z.string().uuid();

/**
 * Lê os arquivos escolhidos com a IA e compara com o cronograma: resumo da obra, tarefas que faltam, documentos e
 * informações que faltam e sugestões. Só sugere; nada entra na EAP sem o engenheiro marcar e confirmar.
 */
export async function lerArquivosComIa(projetoId: string, arquivoIds: string[]): Promise<ResultadoIa<LeituraArquivosPronta>> {
  const pedido = z.object({ p: uuid, a: z.array(uuid).min(1).max(LIMITE_ARQUIVOS_IA) }).safeParse({ p: projetoId, a: arquivoIds });
  if (!pedido.success) return { ok: false, erro: `Escolha de 1 a ${LIMITE_ARQUIVOS_IA} arquivos para a IA ler.` };

  const dados = await buscarProjeto(projetoId);
  if (!dados) return { ok: false, erro: 'Obra não encontrada.' };
  const { projeto, papel } = dados;
  if (!(await podeEditarProjeto(projeto, papel))) return { ok: false, erro: 'Só o engenheiro da obra ou o admin pede a leitura dos arquivos.' };
  if ((await leiturasIaHoje(projetoId)) >= limiteDiarioIa()) {
    return { ok: false, erro: `A obra já fez ${limiteDiarioIa()} leituras com IA hoje (limite para não estourar a cota grátis). Tente amanhã.` };
  }

  const todos = await listarArquivos(projetoId);
  const escolhidos = pedido.data.a.map((id) => todos.find((a) => a.id === id)).filter((a): a is NonNullable<typeof a> => Boolean(a));
  if (escolhidos.length !== pedido.data.a.length) return { ok: false, erro: 'Algum arquivo não foi encontrado nesta obra. Atualize a página.' };
  const semLeitura = escolhidos.filter((a) => !mimeParaIa(a.nome) || (!iaLePdf() && mimeParaIa(a.nome) === 'application/pdf'));
  if (semLeitura.length > 0) {
    return { ok: false, erro: `A IA não lê ${semLeitura.map((a) => a.nome).join(', ')}. Envie a prancha em PDF ou imagem (DWG não é lido).` };
  }
  const total = escolhidos.reduce((s, a) => s + a.tamanho, 0);
  if (total > LIMITE_BYTES_IA) {
    return { ok: false, erro: `Os arquivos somam ${Math.round(total / 1024 / 1024)} MB; a IA lê até ${LIMITE_BYTES_IA / 1024 / 1024} MB por vez. Escolha menos arquivos.` };
  }

  const supabase = await criarClienteServidor();
  const anexos: Anexo[] = [];
  for (const a of escolhidos) {
    const { data, error } = await supabase.storage.from('arquivos').download(a.caminho);
    if (error || !data) return { ok: false, erro: `Não foi possível abrir ${a.nome} no armazenamento.` };
    anexos.push({ mime: mimeParaIa(a.nome)!, dados: new Uint8Array(await data.arrayBuffer()), nome: a.nome });
  }

  const eap = await buscarEap(projetoId);
  // Documentos vigentes da obra (uma linha por documento), para a IA dizer o que falta.
  const vigentes = new Map<string, (typeof todos)[number]>();
  for (const a of todos) if ((vigentes.get(a.documento_id)?.versao ?? 0) < a.versao) vigentes.set(a.documento_id, a);
  const instrucao = pedidoLeituraArquivos({
    obra: { nome: projeto.nome, endereco: projeto.endereco },
    arquivos: escolhidos.map((a) => ({ nome: a.nome, pasta: ROTULO_CATEGORIA_ARQUIVO[a.categoria] })),
    documentos: [...vigentes.values()].map((a) => ({ nome: a.nome, pasta: ROTULO_CATEGORIA_ARQUIVO[a.categoria] })),
    eap: resumoDaEap(eap),
  });

  let resposta;
  try {
    resposta = await perguntarIa(instrucao, anexos);
  } catch (erro) {
    return { ok: false, erro: erro instanceof ErroIa ? erro.message : 'A leitura com IA falhou. Tente de novo.' };
  }
  const leitura = leituraArquivosSchema.safeParse(extrairJson(resposta.texto));
  if (!leitura.success) return { ok: false, erro: 'A IA respondeu fora do formato esperado. Tente de novo.' };

  const id = crypto.randomUUID();
  const { error } = await supabase.rpc('registrar_analise_ia', {
    p_id: id,
    p_projeto_id: projetoId,
    p_tipo: 'arquivos',
    p_modelo: resposta.modelo,
    p_resultado: leitura.data as unknown as Json,
    p_arquivos: escolhidos.map((a) => a.id),
  });
  if (error) return { ok: false, erro: mensagemDoBanco(error) };
  revalidatePath(`/projetos/${projetoId}/arquivos`);
  return { ok: true, valor: { id, modelo: resposta.modelo, leitura: leitura.data, sugestoes: conferirSugestoes(leitura.data.tarefas, eap) } };
}

const tarefaEscolhidaSchema = z.object({
  etapa: z.string().trim().min(1).max(120),
  nome: z.string().trim().min(2).max(300),
  unidade: z.string().trim().max(20).nullable(),
  quantidade: z.number().nonnegative().nullable(),
});

/**
 * Cria no cronograma as tarefas que o engenheiro marcou. Cada uma vai para a etapa de mesmo nome (a de nível mais
 * alto) ou para uma etapa nova no fim da EAP. Tudo pelas funções da EAP (permissão e auditoria de sempre); sem datas:
 * o engenheiro programa depois no Gantt.
 */
export async function criarTarefasSugeridas(
  projetoId: string,
  analiseId: string,
  tarefas: z.input<typeof tarefaEscolhidaSchema>[],
): Promise<ResultadoIa<{ criadas: number; etapasNovas: number }>> {
  const pedido = z
    .object({ p: uuid, a: uuid, t: z.array(tarefaEscolhidaSchema).min(1).max(60) })
    .safeParse({ p: projetoId, a: analiseId, t: tarefas });
  if (!pedido.success) return { ok: false, erro: 'Marque ao menos uma tarefa válida.' };

  const eap = await buscarEap(projetoId);
  const conferidas = conferirSugestoes(
    pedido.data.t.map((t) => ({ ...t, motivo: '', arquivo: null })),
    eap,
  );
  const supabase = await criarClienteServidor();
  const etapaNova = new Map<string, string>();
  let criadas = 0;
  for (const [i, t] of conferidas.entries()) {
    let paiId = t.etapaExistente?.id ?? etapaNova.get(t.etapa.toLowerCase()) ?? null;
    if (!paiId) {
      const { data, error } = await supabase.rpc('criar_item_eap', { p_projeto_id: projetoId, p_tipo: 'etapa', p_nome: t.etapa });
      if (error || !data) return { ok: false, erro: criadas ? `${criadas} tarefas criadas; parou em "${t.etapa}": ${mensagemDoBanco(error!)}` : mensagemDoBanco(error!) };
      paiId = data;
      etapaNova.set(t.etapa.toLowerCase(), data);
    }
    const { error } = await supabase.rpc('criar_item_eap', {
      p_projeto_id: projetoId,
      p_tipo: 'tarefa',
      p_nome: t.nome,
      p_pai_id: paiId,
      p_campos: {
        unidade: t.unidade ?? '',
        quantidade: t.quantidade ?? '',
        codigo_externo: `ia:${analiseId.slice(0, 8)}:${i + 1}`,
      },
    });
    if (error) return { ok: false, erro: criadas ? `${criadas} tarefas criadas; parou em "${t.nome}": ${mensagemDoBanco(error)}` : mensagemDoBanco(error) };
    criadas += 1;
  }
  revalidatePath(`/projetos/${projetoId}`, 'layout');
  return { ok: true, valor: { criadas, etapasNovas: etapaNova.size } };
}
