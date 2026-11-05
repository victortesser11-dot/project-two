// Medição: resumo do contrato, situação de pagamento e previsto × medido mês a mês.
// Valores e travas são do banco (o juiz); aqui só se soma e organiza para a tela.
import { z } from 'zod';
import { CRITERIOS_MEDICAO, PARTES_MEDICAO, type ItemContratoMedicao, type ItemMedicao, type Medicao } from './dominio';
import { fisicoFinanceiro, type TarefaFinanceira } from './orcamento';
import { lerNumero } from './importacao/valores';

const cent = (v: number) => Math.round(v * 100) / 100;
const q4 = (v: number) => Math.round(v * 10000) / 10000;

const numero = (min: number, max: number, mensagem: string, { obrigatorio = true } = {}) =>
  z
    .union([z.string(), z.number()])
    .nullable()
    .optional()
    .transform((v, ctx) => {
      const n = v === null || v === undefined || v === '' ? null : typeof v === 'number' ? v : lerNumero(v, ',');
      if (n === null) {
        if (obrigatorio) {
          ctx.addIssue({ code: 'custom', message: mensagem });
          return z.NEVER;
        }
        return null;
      }
      if (Number.isNaN(n) || n < min || n > max) {
        ctx.addIssue({ code: 'custom', message: mensagem });
        return z.NEVER;
      }
      return n;
    });

export const contratoMedicaoSchema = z
  .object({
    parte: z.enum(PARTES_MEDICAO, { error: 'Escolha cliente ou empreiteira' }),
    nome: z.string().trim().min(2, 'Informe o nome do cliente ou do contrato').max(160, 'Use no máximo 160 caracteres'),
    empreiteira_id: z
      .union([z.string().uuid(), z.literal('')])
      .nullable()
      .optional()
      .transform((v) => v || null),
    bdi_pct: numero(0, 200, 'BDI de 0 a 200%', { obrigatorio: false }),
    retencao_pct: numero(0, 30, 'Retenção de 0 a 30%', { obrigatorio: false }),
    prazo_pagamento_dias: numero(0, 180, 'Prazo de 0 a 180 dias', { obrigatorio: false }).refine(
      (v) => v === null || Number.isInteger(v),
      'Dias inteiros',
    ),
    base: z.enum(['custo', 'mao_obra']).optional().default('custo'),
  })
  .superRefine((c, ctx) => {
    if (c.parte === 'empreiteiro' && !c.empreiteira_id)
      ctx.addIssue({ code: 'custom', path: ['empreiteira_id'], message: 'Escolha a empreiteira' });
  });

export const itemContratoSchema = z
  .object({
    criterio: z.enum(CRITERIOS_MEDICAO, { error: 'Escolha o critério' }),
    unidade: z.string().trim().max(20, 'Unidade com até 20 caracteres').optional().default(''),
    quantidade: numero(0, 1e9, 'Quantidade maior que zero', { obrigatorio: false }),
    preco_unitario: numero(0, 1e12, 'Preço unitário inválido', { obrigatorio: false }),
    valor_total: numero(0, 1e12, 'Valor inválido', { obrigatorio: false }),
  })
  .transform((i, ctx) => {
    if (i.criterio === 'percentual') {
      if (i.valor_total === null) {
        ctx.addIssue({ code: 'custom', path: ['valor_total'], message: 'Informe o valor do serviço' });
        return z.NEVER;
      }
      // Medido em %: quantidade 100, preço unitário = valor ÷ 100.
      return { criterio: i.criterio, unidade: '%', quantidade: 100, preco_unitario: Math.round(i.valor_total * 100) / 10000 };
    }
    if (!i.unidade) {
      ctx.addIssue({ code: 'custom', path: ['unidade'], message: 'Informe a unidade (m², m³, kg…)' });
      return z.NEVER;
    }
    if (!i.quantidade || i.quantidade <= 0) {
      ctx.addIssue({ code: 'custom', path: ['quantidade'], message: 'Quantidade maior que zero' });
      return z.NEVER;
    }
    if (i.preco_unitario === null) {
      ctx.addIssue({ code: 'custom', path: ['preco_unitario'], message: 'Informe o preço unitário' });
      return z.NEVER;
    }
    return { criterio: i.criterio, unidade: i.unidade, quantidade: q4(i.quantidade), preco_unitario: i.preco_unitario };
  });

export type SituacaoPagamento = 'rascunho' | 'a_vencer' | 'vencida' | 'paga';

export function situacaoPagamento(m: Pick<Medicao, 'status' | 'vencimento'>, hoje: string): SituacaoPagamento {
  if (m.status === 'paga') return 'paga';
  if (m.status === 'rascunho') return 'rascunho';
  return m.vencimento && m.vencimento < hoje ? 'vencida' : 'a_vencer';
}

export const ROTULO_SITUACAO_PAGAMENTO: Record<SituacaoPagamento, string> = {
  rascunho: 'Rascunho',
  a_vencer: 'Liberada para pagar',
  vencida: 'Vencida',
  paga: 'Paga',
};

export interface ResumoContratoMedicao {
  contratado: number;
  medido: number;
  pago: number;
  /** Aprovado e ainda não pago (líquido). */
  aPagar: number;
  retido: number;
  percentualMedido: number;
  /** Medido acumulado (aprovado ou pago) por item do contrato, na unidade do item. */
  medidoPorItem: Map<string, number>;
}

/** Totais do contrato pelas medições aprovadas e pagas (o rascunho não conta). */
export function resumoContrato(itens: ItemContratoMedicao[], medicoes: Medicao[], itensMedidos: ItemMedicao[]): ResumoContratoMedicao {
  const valendo = new Set(medicoes.filter((m) => m.status !== 'rascunho').map((m) => m.id));
  const medidoPorItem = new Map<string, number>();
  for (const mi of itensMedidos) {
    if (!valendo.has(mi.medicao_id)) continue;
    medidoPorItem.set(mi.contrato_item_id, q4((medidoPorItem.get(mi.contrato_item_id) ?? 0) + mi.quantidade));
  }
  const contratado = cent(itens.reduce((s, i) => s + i.valor_total, 0));
  const aprovadas = medicoes.filter((m) => m.status !== 'rascunho');
  const medido = cent(aprovadas.reduce((s, m) => s + m.valor_bruto, 0));
  return {
    contratado,
    medido,
    pago: cent(medicoes.filter((m) => m.status === 'paga').reduce((s, m) => s + (m.pago_valor ?? 0), 0)),
    aPagar: cent(medicoes.filter((m) => m.status === 'aprovada').reduce((s, m) => s + m.valor_liquido, 0)),
    retido: cent(aprovadas.reduce((s, m) => s + m.retencao, 0)),
    percentualMedido: contratado > 0 ? Math.round((medido / contratado) * 1000) / 10 : 0,
    medidoPorItem,
  };
}

export interface LinhaPrevistoMedido {
  mes: string;
  previsto: number;
  previstoAcumulado: number;
  medido: number;
  medidoAcumulado: number;
  pago: number;
}

/**
 * Cronograma físico-financeiro do contrato: o valor de cada item distribuído pelos dias da tarefa
 * (linha de base, se houver, senão o previsto) contra o medido (pelo fim do período de cada
 * boletim aprovado) e o pago (pela data do pagamento), mês a mês.
 */
export function previstoMedidoMensal(
  itens: ItemContratoMedicao[],
  datas: Map<string, { inicio: string | null; fim: string | null }>,
  medicoes: Medicao[],
): { linhas: LinhaPrevistoMedido[]; semDatas: number } {
  const tarefas: TarefaFinanceira[] = itens.map((i) => ({
    id: i.id,
    custo: i.valor_total,
    inicio: datas.get(i.tarefa_id)?.inicio ?? null,
    fim: datas.get(i.tarefa_id)?.fim ?? null,
  }));
  const ff = fisicoFinanceiro(tarefas);
  const mesesSet = new Set(ff.meses);
  const valendo = medicoes.filter((m) => m.status !== 'rascunho');
  for (const m of valendo) mesesSet.add(m.fim.slice(0, 7));
  for (const m of medicoes) if (m.pago_em) mesesSet.add(m.pago_em.slice(0, 7));
  const meses = [...mesesSet].sort();
  let pa = 0;
  let ma = 0;
  const linhas = meses.map((mes) => {
    const i = ff.meses.indexOf(mes);
    const previsto = i >= 0 ? ff.porMes[i]! : 0;
    const medido = cent(valendo.filter((m) => m.fim.slice(0, 7) === mes).reduce((s, m) => s + m.valor_bruto, 0));
    const pago = cent(medicoes.filter((m) => m.pago_em?.slice(0, 7) === mes).reduce((s, m) => s + (m.pago_valor ?? 0), 0));
    pa = cent(pa + previsto);
    ma = cent(ma + medido);
    return { mes, previsto, previstoAcumulado: pa, medido, medidoAcumulado: ma, pago };
  });
  return { linhas, semDatas: ff.semDatas };
}

/**
 * Fração executada (0 a 1) de cada tarefa até a data, pelo último avanço apontado (por data do
 * serviço, depois pela hora do registro): o mesmo critério de app.executado_tarefa no banco.
 */
export function executadoAte(
  apontamentos: { tarefa_id: string; data: string; percentual: number | string; registrado_em: string }[],
  data: string,
): Map<string, number> {
  const ultimo = new Map<string, { data: string; registrado_em: string; percentual: number }>();
  for (const a of apontamentos) {
    if (a.data > data) continue;
    const atual = ultimo.get(a.tarefa_id);
    if (!atual || a.data > atual.data || (a.data === atual.data && a.registrado_em > atual.registrado_em)) {
      ultimo.set(a.tarefa_id, { data: a.data, registrado_em: a.registrado_em, percentual: Number(a.percentual) });
    }
  }
  return new Map([...ultimo].map(([t, u]) => [t, u.percentual / 100]));
}
