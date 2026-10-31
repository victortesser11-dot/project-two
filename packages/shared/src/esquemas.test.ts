import { describe, expect, it } from 'vitest';
import { errosPorCampo, lerValorEmReais, projetoSchema } from './esquemas';
import { formatarData, prazoDecorrido } from './formato';

describe('lerValorEmReais', () => {
  it.each([
    ['4500000', 4_500_000],
    ['4.500.000,00', 4_500_000],
    ['R$ 1.234,56', 1234.56],
    ['1234.5', 1234.5],
    ['', null],
  ])('%s → %s', (entrada, esperado) => {
    expect(lerValorEmReais(entrada)).toBe(esperado);
  });

  it('marca texto que não é número', () => {
    expect(lerValorEmReais('mil reais')).toBeNaN();
  });
});

describe('projetoSchema', () => {
  it('aceita só o nome e completa o resto', () => {
    const r = projetoSchema.parse({ nome: '  Residencial Aurora  ' });
    expect(r).toEqual({
      nome: 'Residencial Aurora',
      endereco: null,
      data_inicio: null,
      data_fim_prevista: null,
      orcamento_total: null,
      status: 'planejamento',
    });
  });

  it('converte campos vazios do formulário em null', () => {
    const r = projetoSchema.parse({ nome: 'Obra', endereco: '', data_inicio: '', orcamento_total: '' });
    expect(r.endereco).toBeNull();
    expect(r.data_inicio).toBeNull();
    expect(r.orcamento_total).toBeNull();
  });

  it('lê orçamento no formato brasileiro', () => {
    expect(projetoSchema.parse({ nome: 'Obra', orcamento_total: '4.500.000,00' }).orcamento_total).toBe(4_500_000);
  });

  it('recusa fim antes do início', () => {
    const r = projetoSchema.safeParse({ nome: 'Obra', data_inicio: '2027-01-10', data_fim_prevista: '2026-12-01' });
    expect(r.success).toBe(false);
    if (!r.success) expect(errosPorCampo(r.error).data_fim_prevista).toMatch(/antes do início/);
  });

  it('recusa orçamento zero, negativo ou ilegível', () => {
    for (const orcamento_total of ['0', '-10', 'muito']) {
      expect(projetoSchema.safeParse({ nome: 'Obra', orcamento_total }).success).toBe(false);
    }
  });

  it('recusa nome curto e status desconhecido', () => {
    const r = projetoSchema.safeParse({ nome: 'A', status: 'demolido' });
    expect(r.success).toBe(false);
    if (!r.success) {
      const erros = errosPorCampo(r.error);
      expect(erros.nome).toBeDefined();
      expect(erros.status).toBeDefined();
    }
  });

  it('recusa data inexistente', () => {
    expect(projetoSchema.safeParse({ nome: 'Obra', data_inicio: '2026-13-45' }).success).toBe(false);
  });
});

describe('formato', () => {
  it('formata data sem mexer no fuso', () => {
    expect(formatarData('2026-11-03')).toBe('03/11/2026');
    expect(formatarData(null)).toBe('—');
  });

  it('calcula o prazo decorrido entre 0 e 1', () => {
    expect(prazoDecorrido('2026-01-01', '2026-01-11', '2026-01-06')).toBeCloseTo(0.5);
    expect(prazoDecorrido('2026-01-01', '2026-01-11', '2025-12-01')).toBe(0);
    expect(prazoDecorrido('2026-01-01', '2026-01-11', '2026-03-01')).toBe(1);
    expect(prazoDecorrido(null, '2026-01-11', '2026-01-06')).toBeNull();
  });
});
