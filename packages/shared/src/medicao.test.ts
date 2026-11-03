import { describe, expect, it } from 'vitest';
import type { ItemContratoMedicao, ItemMedicao, Medicao } from './dominio';
import { contratoMedicaoSchema, executadoAte, itemContratoSchema, previstoMedidoMensal, resumoContrato, situacaoPagamento } from './medicao';

const item = (id: string, tarefa: string, valor: number, extra: Partial<ItemContratoMedicao> = {}): ItemContratoMedicao => ({
  id, contrato_id: 'c', tarefa_id: tarefa, criterio: 'quantidade', unidade: 'm²', quantidade: 100, preco_unitario: valor / 100, valor_total: valor, ...extra,
});
const med = (id: string, numero: number, fim: string, status: Medicao['status'], bruto: number, extra: Partial<Medicao> = {}): Medicao => ({
  id, contrato_id: 'c', numero, inicio: '2027-01-01', fim, status, observacao: null, valor_bruto: bruto, retencao: bruto * 0.05,
  valor_liquido: bruto * 0.95, vencimento: status === 'rascunho' ? null : '2027-02-15', aprovada_nome: null, aprovada_em: null,
  pago_em: null, pago_valor: null, ...extra,
});

describe('medição', () => {
  it('resumo do contrato conta só o aprovado e o pago', () => {
    const itens = [item('i1', 't1', 12000), item('i2', 't2', 6000)];
    const medicoes = [
      med('m1', 1, '2027-01-31', 'paga', 4000, { pago_em: '2027-02-10', pago_valor: 3800 }),
      med('m2', 2, '2027-02-28', 'aprovada', 2000),
      med('m3', 3, '2027-03-31', 'rascunho', 9999),
    ];
    const mi: ItemMedicao[] = [
      { medicao_id: 'm1', contrato_item_id: 'i1', quantidade: 30, valor: 3600, executado_acumulado: 30 },
      { medicao_id: 'm2', contrato_item_id: 'i1', quantidade: 10, valor: 1200, executado_acumulado: 40 },
      { medicao_id: 'm3', contrato_item_id: 'i1', quantidade: 50, valor: 6000, executado_acumulado: 90 },
    ];
    const r = resumoContrato(itens, medicoes, mi);
    expect(r).toMatchObject({ contratado: 18000, medido: 6000, pago: 3800, aPagar: 1900, retido: 300, percentualMedido: 33.3 });
    expect(r.medidoPorItem.get('i1')).toBe(40);
  });

  it('situação do pagamento pelo vencimento', () => {
    expect(situacaoPagamento({ status: 'aprovada', vencimento: '2027-02-15' }, '2027-02-10')).toBe('a_vencer');
    expect(situacaoPagamento({ status: 'aprovada', vencimento: '2027-02-15' }, '2027-02-16')).toBe('vencida');
    expect(situacaoPagamento({ status: 'paga', vencimento: '2027-02-15' }, '2027-03-01')).toBe('paga');
  });

  it('previsto × medido × pago mês a mês', () => {
    const itens = [item('i1', 't1', 3100)];
    const datas = new Map([['t1', { inicio: '2027-01-01', fim: '2027-01-31' }]]);
    const { linhas } = previstoMedidoMensal(itens, datas, [
      med('m1', 1, '2027-01-31', 'paga', 1000, { pago_em: '2027-02-10', pago_valor: 950 }),
    ]);
    expect(linhas).toEqual([
      { mes: '2027-01', previsto: 3100, previstoAcumulado: 3100, medido: 1000, medidoAcumulado: 1000, pago: 0 },
      { mes: '2027-02', previsto: 0, previstoAcumulado: 3100, medido: 0, medidoAcumulado: 1000, pago: 950 },
    ]);
  });

  it('valida contrato e item', () => {
    expect(contratoMedicaoSchema.safeParse({ parte: 'empreiteiro', nome: 'Empreitada' }).success).toBe(false);
    expect(contratoMedicaoSchema.parse({ parte: 'cliente', nome: 'João', bdi_pct: '25,5', retencao_pct: '5', prazo_pagamento_dias: '15' })).toMatchObject({
      bdi_pct: 25.5, retencao_pct: 5, prazo_pagamento_dias: 15, base: 'custo',
    });
    expect(itemContratoSchema.parse({ criterio: 'percentual', valor_total: '6.000,00' })).toEqual({
      criterio: 'percentual', unidade: '%', quantidade: 100, preco_unitario: 60,
    });
    expect(itemContratoSchema.parse({ criterio: 'quantidade', unidade: 'm³', quantidade: '12,5', preco_unitario: '480' })).toEqual({
      criterio: 'quantidade', unidade: 'm³', quantidade: 12.5, preco_unitario: 480,
    });
    expect(itemContratoSchema.safeParse({ criterio: 'quantidade', unidade: '', quantidade: '1', preco_unitario: '1' }).success).toBe(false);
  });
});

describe('executado até a data', () => {
  it('pega o último avanço pela data do serviço, depois pela hora do registro', () => {
    const aps = [
      { tarefa_id: 't1', data: '2027-01-10', percentual: 40, registrado_em: '2027-01-10T10:00:00Z' },
      { tarefa_id: 't1', data: '2027-01-10', percentual: 45, registrado_em: '2027-01-10T18:00:00Z' },
      { tarefa_id: 't1', data: '2027-01-20', percentual: 70, registrado_em: '2027-01-20T10:00:00Z' },
      { tarefa_id: 't2', data: '2027-01-05', percentual: '10.00', registrado_em: '2027-01-05T10:00:00Z' },
    ];
    const ex = executadoAte(aps, '2027-01-15');
    expect(ex.get('t1')).toBe(0.45);
    expect(ex.get('t2')).toBe(0.1);
    expect(executadoAte(aps, '2027-01-04').size).toBe(0);
  });
});
