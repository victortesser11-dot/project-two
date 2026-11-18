'use server';

import { z } from 'zod';
import {
  agruparVersoes,
  CAMPOS_FICHA,
  hojeIso,
  instrucaoAssistente,
  itensComSaldo,
  leituraArquivosSchema,
  lerRespostaAssistente,
  ligarItensAssistente,
  LIMITE_MENSAGENS_ASSISTENTE,
  LIMITE_TEXTO_PERGUNTA,
  ROTULO_CATEGORIA_ARQUIVO,
  ROTULO_STATUS,
  textoContextoObra,
  textoDaResposta,
  type ContextoObra,
  type RespostaAssistente,
  type TarefaContexto,
} from '@obras/shared';
import {
  buscarApontamentos,
  buscarEap,
  buscarLinhaBase,
  buscarProjeto,
  equipeNoDia,
  listarAnalisesIa,
  listarArquivos,
  listarDiarios,
  listarItensEstoque,
  listarSaldos,
  podeVerCustos,
} from '@/lib/dados';
import { alertasDaObra } from '@/lib/alertas';
import { conversarIa, ErroIa } from '@/lib/ia';
import { montarPainel } from '../painel';

/** `resposta` em cartões quando o modelo devolveu o JSON pedido; senão só o texto, como veio. */
export type ResultadoAssistente =
  | { ok: true; texto: string; resposta: RespostaAssistente | null; modelo: string }
  | { ok: false; erro: string };

const mensagensSchema = z
  .array(z.object({ papel: z.enum(['usuario', 'assistente']), texto: z.string().trim().min(1).max(LIMITE_TEXTO_PERGUNTA * 3) }))
  .min(1)
  .max(LIMITE_MENSAGENS_ASSISTENTE)
  .refine((m) => m.at(-1)?.papel === 'usuario' && m.at(-1)!.texto.length <= LIMITE_TEXTO_PERGUNTA, 'Pergunta inválida');

/** Junta os dados da obra que a pessoa pode ver num texto para o modelo. Módulo que falhar fica de fora. */
async function contextoDaObra(projetoId: string): Promise<{ texto: string; tarefas: TarefaContexto[]; hoje: string } | null> {
  const dados = await buscarProjeto(projetoId);
  if (!dados) return null;
  const { projeto, papel } = dados;
  const hoje = hojeIso();
  const vazio = <T,>(p: Promise<T[]>) => p.catch(() => [] as T[]);
  const [itens, linhaBase, apontamentos, alertas, diarios, equipeHoje, catalogo, saldos, arquivos, leituras, verCustos] = await Promise.all([
    vazio(buscarEap(projetoId)),
    buscarLinhaBase(projetoId).catch(() => null),
    vazio(buscarApontamentos(projetoId)),
    alertasDaObra(projeto, papel).catch(() => ({ alertas: [], previsao: [] })),
    vazio(listarDiarios(projetoId)),
    equipeNoDia(projetoId, hoje).catch(() => null),
    vazio(listarItensEstoque(projeto.empresa_id, projeto)),
    vazio(listarSaldos(projetoId)),
    vazio(listarArquivos(projetoId)),
    vazio(listarAnalisesIa(projetoId, 'arquivos')),
    podeVerCustos(projeto, papel),
  ]);
  const temTarefas = itens.some((i) => i.tipo === 'tarefa');
  const painel = temTarefas ? montarPainel(itens, apontamentos, linhaBase !== null, hoje) : null;
  const etapa = new Map(itens.filter((i) => i.tipo === 'etapa').map((e) => [e.id, e.nome]));
  const naObra = new Set(saldos.map((s) => s.item_id));
  const resumoProjeto = leituras[0] ? leituraArquivosSchema.safeParse(leituras[0].resultado) : null;

  const c: ContextoObra = {
    hoje,
    obra: {
      nome: projeto.nome,
      endereco: projeto.endereco,
      situacao: ROTULO_STATUS[projeto.status],
      inicio: projeto.data_inicio,
      fim: projeto.data_fim_prevista,
      ficha: CAMPOS_FICHA.flatMap((f) => {
        const v = projeto[f.campo];
        if (v === null || v === undefined || v === '') return [];
        return [{ rotulo: f.rotulo, valor: f.area ? Number(v).toLocaleString('pt-BR') : String(v) }];
      }),
    },
    prazo: painel
      ? {
          real: painel.projecao.real,
          planejado: painel.projecao.planejado,
          atrasoDias: painel.projecao.atrasoDias,
          fimProjetado: painel.projecao.fimProjetado,
          referencia: linhaBase ? 'a linha de base' : 'o cronograma previsto (sem linha de base)',
        }
      : null,
    etapas: painel ? painel.etapas.map((e) => ({ nome: e.nome, real: e.real, planejado: e.planejado })) : [],
    tarefas: itens
      .filter((i) => i.tipo === 'tarefa')
      .map((t) => ({
        codigo: t.codigo,
        nome: t.nome,
        etapa: t.pai_id ? (etapa.get(t.pai_id) ?? null) : null,
        inicio: t.inicio_previsto,
        fim: t.fim_previsto,
        percentual: Number(t.percentual_fisico),
      })),
    alertas: alertas.alertas,
    previsao: alertas.previsao,
    diarios: diarios.slice(0, 7).map((d) => ({ data: d.data, status: d.status, efetivo: d.pessoas, fotos: d.fotos })),
    equipeHoje,
    materiais: itensComSaldo(catalogo.filter((i) => i.tipo === 'material' && naObra.has(i.id)), saldos).map((m) => ({
      nome: m.nome,
      quantidade: m.quantidade,
      unidade: m.unidade,
      abaixoDoMinimo: m.abaixoDoMinimo,
    })),
    arquivos: agruparVersoes(arquivos).map((d) => ({ nome: d.atual.nome, pasta: ROTULO_CATEGORIA_ARQUIVO[d.atual.categoria] })),
    resumoProjeto: resumoProjeto?.success ? resumoProjeto.data.resumo || null : null,
    custos: verCustos
      ? { orcamento: projeto.orcamento_total !== null ? Number(projeto.orcamento_total) : null, previstoEap: painel?.custoTotal ?? null, realizado: null }
      : null,
  };
  return { texto: textoContextoObra(c), tarefas: c.tarefas, hoje };
}

/**
 * Pergunta ao assistente da obra. A conversa vem do navegador (nada é gravado); o servidor junta um retrato atual da
 * obra, só com o que a pessoa pode ver, e manda ao modelo junto das mensagens.
 */
export async function perguntarAoAssistente(projetoId: string, mensagens: { papel: 'usuario' | 'assistente'; texto: string }[]): Promise<ResultadoAssistente> {
  if (!z.string().uuid().safeParse(projetoId).success) return { ok: false, erro: 'Obra inválida.' };
  const m = mensagensSchema.safeParse(mensagens);
  if (!m.success) return { ok: false, erro: `Escreva a pergunta (até ${LIMITE_TEXTO_PERGUNTA} letras). Conversas longas: comece outra.` };

  const inicio = Date.now();
  const contexto = await contextoDaObra(projetoId);
  if (!contexto) return { ok: false, erro: 'Obra não encontrada.' };
  const montado = Date.now();
  try {
    // Fila de conversa (modelos rápidos, só texto); até 60 s somando as tentativas, dentro dos 120 s da página.
    const r = await conversarIa({ tarefa: 'conversa', sistema: instrucaoAssistente(contexto.texto), mensagens: m.data, json: true, maxTokens: 2_000 });
    console.info(
      `Assistente: dados da obra em ${((montado - inicio) / 1000).toFixed(1)} s (${contexto.texto.length} letras), IA (${r.modelo}) em ${((Date.now() - montado) / 1000).toFixed(1)} s.`,
    );
    const lida = lerRespostaAssistente(r.texto);
    const resposta = lida ? ligarItensAssistente(lida, contexto.tarefas, contexto.hoje) : null;
    return { ok: true, texto: resposta ? textoDaResposta(resposta) : r.texto.trim(), resposta, modelo: r.modelo };
  } catch (erro) {
    if (!(erro instanceof ErroIa)) console.error('IA: falha inesperada', erro);
    return { ok: false, erro: erro instanceof ErroIa ? erro.message : 'O assistente não respondeu. Tente de novo.' };
  }
}
