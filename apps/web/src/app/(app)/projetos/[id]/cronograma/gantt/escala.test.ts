import { describe, expect, it } from 'vitest';
import type { ItemEap } from '@obras/shared';
import { desvioDaBase, janelaDoGantt, largura, marcasDeMes, posicao, pxParaCaber, segundasFeiras, somarDias, zoomPadrao } from './escala';

function tarefa(p: Partial<ItemEap>): ItemEap {
  return {
    id: 'x', pai_id: null, posicao: 1, nivel: 1, codigo: '1', tipo: 'tarefa', nome: 't',
    unidade: null, quantidade: null, custo_previsto: null, inicio_previsto: null, fim_previsto: null,
    codigo_externo: null, qtd_filhos: 0, qtd_tarefas: 1, inicio_base: null, fim_base: null, custo_base: null,
    ...p,
  };
}

describe('somarDias', () => {
  it('vira o mês e o ano', () => {
    expect(somarDias('2026-11-30', 2)).toBe('2026-12-02');
    expect(somarDias('2026-12-31', 1)).toBe('2027-01-01');
    expect(somarDias('2026-03-01', -1)).toBe('2026-02-28');
  });
});

describe('janelaDoGantt', () => {
  it('cobre previsto e linha de base, com margem', () => {
    const j = janelaDoGantt(
      [tarefa({ inicio_previsto: '2026-11-10', fim_previsto: '2026-11-20', inicio_base: '2026-11-05', fim_base: '2026-11-15' })],
      '2025-01-01',
    );
    expect(j).toEqual({ inicio: '2026-11-02', fim: '2026-11-27' });
  });

  it('puxa o hoje para dentro quando está perto', () => {
    const j = janelaDoGantt([tarefa({ inicio_previsto: '2026-11-10', fim_previsto: '2026-11-20' })], '2026-11-01');
    expect(j?.inicio).toBe('2026-10-29');
  });

  it('sem datas não há gráfico', () => {
    expect(janelaDoGantt([tarefa({})], '2026-11-01')).toBeNull();
  });
});

describe('posições', () => {
  it('um dia ocupa a largura de um dia', () => {
    expect(posicao('2026-11-01', '2026-11-03', 10)).toBe(20);
    expect(largura('2026-11-03', '2026-11-03', 10)).toBe(10);
    expect(largura('2026-11-03', '2026-11-09', 10)).toBe(70);
  });

  it('zoom padrão acompanha o tamanho da obra', () => {
    expect(zoomPadrao(30)).toBe('dia');
    expect(zoomPadrao(120)).toBe('semana');
    expect(zoomPadrao(700)).toBe('mes');
  });

  it('"obra toda" cabe na largura, sem passar dos limites', () => {
    expect(pxParaCaber(1000, 200)).toBe(5);
    expect(pxParaCaber(230, 400)).toBe(1.5);
    expect(pxParaCaber(1000, 10)).toBe(28);
  });
});

describe('marcas', () => {
  it('marca cada virada de mês e o ano em janeiro', () => {
    const m = marcasDeMes('2026-11-20', '2027-02-10', 1);
    expect(m.map((x) => x.rotulo)).toEqual(['dez', 'jan 2027', 'fev']);
    expect(m[0]!.x).toBe(11);
  });

  it('segundas-feiras', () => {
    // 2026-11-01 é domingo; a primeira segunda é 02/11
    expect(segundasFeiras('2026-11-01', '2026-11-20', 1)).toEqual([1, 8, 15]);
  });
});

describe('desvioDaBase', () => {
  it('positivo quando termina depois da base', () => {
    expect(desvioDaBase({ fim_previsto: '2026-11-25', fim_base: '2026-11-20' })).toBe(5);
    expect(desvioDaBase({ fim_previsto: '2026-11-18', fim_base: '2026-11-20' })).toBe(-2);
    expect(desvioDaBase({ fim_previsto: '2026-11-18', fim_base: null })).toBeNull();
  });
});
