import { describe, expect, it } from 'vitest';
import type { ItemEap } from '@obras/shared';
import { montarPainel } from './painel';

function item(p: Partial<ItemEap> & { id: string }): ItemEap {
  return {
    pai_id: null, posicao: 1, nivel: 1, codigo: '1', tipo: 'tarefa', nome: p.id,
    unidade: null, quantidade: null, custo_previsto: null, inicio_previsto: null, fim_previsto: null,
    codigo_externo: null, qtd_filhos: 0, qtd_tarefas: 1, inicio_base: null, fim_base: null, custo_base: null,
    percentual_fisico: 0, avanco_em: null, ...p,
  };
}

describe('montarPainel', () => {
  const itens = [
    item({ id: 'E', tipo: 'etapa', codigo: '1', nome: 'Fundações', percentual_fisico: 25,
      inicio_previsto: '2026-11-01', fim_previsto: '2026-11-25', inicio_base: '2026-11-01', fim_base: '2026-11-20' }),
    item({ id: 'a', pai_id: 'E', nivel: 2, codigo: '1.1', custo_previsto: 1000, percentual_fisico: 50,
      inicio_previsto: '2026-11-01', fim_previsto: '2026-11-10', inicio_base: '2026-11-01', fim_base: '2026-11-10' }),
    item({ id: 'b', pai_id: 'E', nivel: 2, codigo: '1.2', custo_previsto: 1000,
      inicio_previsto: '2026-11-16', fim_previsto: '2026-11-25', inicio_base: '2026-11-11', fim_base: '2026-11-20' }),
  ];
  const r = montarPainel(itens, [], true, '2026-11-10');

  it('valor executado = custo × % feito', () => {
    expect(r.custoTotal).toBe(2000);
    expect(r.valorExecutado).toBe(500);
  });

  it('projeção pela linha de base', () => {
    expect(r.projecao.situacao).toBe('atrasada');
    expect(r.projecao.atrasoDias).toBe(5);
  });

  it('resume cada etapa do primeiro nível', () => {
    expect(r.etapas).toEqual([
      { id: 'E', codigo: '1', nome: 'Fundações', real: 25, planejado: 50, desvioDias: 5, tarefas: 2 },
    ]);
  });

  it('conta as tarefas do dia', () => {
    expect(r.hoje).toEqual({ previstas: 1, atrasadas: 0, proximas: 0 });
  });
});
