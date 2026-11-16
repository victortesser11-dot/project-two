// Leitura das fotos do diário: o que não é ação do servidor (o arquivo 'use server' só exporta funções assíncronas).
import { z } from 'zod';
import { leituraFotosSchema, type ItemEap, type TarefaParaFoto } from '@obras/shared';

export const MAX_TAREFAS_FOTO = 40;

/** O que fica gravado: a resposta e as tarefas que foram no pedido (para reabrir a leitura sem a IA). */
export const leituraFotosGravadaSchema = z.object({
  leitura: leituraFotosSchema,
  pedidas: z.array(z.object({ id: z.string(), codigo: z.string(), nome: z.string(), etapa: z.string().nullable(), percentual: z.number() })),
});


/** Tarefas que o dia pede: as marcadas nas fotos primeiro, depois as programadas para a data e ainda não concluídas. */
export function tarefasDoDia(itens: ItemEap[], data: string, marcadasNasFotos: string[]): TarefaParaFoto[] {
  const etapa = new Map(itens.filter((i) => i.tipo === 'etapa').map((e) => [e.id, e.nome]));
  const tarefas = itens.filter((i) => i.tipo === 'tarefa');
  const nasFotos = new Set(marcadasNasFotos);
  const doDia = tarefas.filter(
    (t) => nasFotos.has(t.id) || (t.inicio_previsto && t.fim_previsto && t.inicio_previsto <= data && t.fim_previsto >= data && t.percentual_fisico < 100),
  );
  doDia.sort((a, b) => Number(nasFotos.has(b.id)) - Number(nasFotos.has(a.id)));
  return doDia.slice(0, MAX_TAREFAS_FOTO).map((t) => ({
    id: t.id,
    codigo: t.codigo,
    nome: t.nome,
    etapa: t.pai_id ? (etapa.get(t.pai_id) ?? null) : null,
    percentual: Number(t.percentual_fisico),
  }));
}

