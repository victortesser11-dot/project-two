import { describe, expect, it } from 'vitest';
import type { ItemEap } from '@obras/shared';
import { tarefasDoDia } from './leituraIa';

const item = (id: string, tipo: 'etapa' | 'tarefa', nome: string, extra: Partial<ItemEap> = {}): ItemEap => ({
  id, pai_id: null, posicao: 1, nivel: 1, codigo: id, tipo, nome, unidade: null, quantidade: null, custo_previsto: null,
  inicio_previsto: null, fim_previsto: null, codigo_externo: null, qtd_filhos: 0, qtd_tarefas: 0, inicio_base: null, fim_base: null,
  custo_base: null, percentual_fisico: 0, avanco_em: null, ...extra,
});

describe('tarefas que vão para a leitura das fotos', () => {
  const itens = [
    item('e1', 'etapa', 'Torre A 4º Pavimento'),
    item('t1', 'tarefa', 'Alvenaria lado 2', { pai_id: 'e1', inicio_previsto: '2026-11-10', fim_previsto: '2026-11-20', percentual_fisico: 60 }),
    item('t2', 'tarefa', 'Laje lado 2', { pai_id: 'e1', inicio_previsto: '2026-11-21', fim_previsto: '2026-11-25' }),
    item('t3', 'tarefa', 'Graute', { pai_id: 'e1', inicio_previsto: '2026-11-01', fim_previsto: '2026-11-30', percentual_fisico: 100 }),
    item('t4', 'tarefa', 'Contrapiso', { inicio_previsto: '2026-12-01', fim_previsto: '2026-12-05' }),
  ];

  it('as marcadas nas fotos vêm primeiro; depois as programadas para o dia e não concluídas', () => {
    expect(tarefasDoDia(itens, '2026-11-16', ['t4'])).toEqual([
      { id: 't4', codigo: 't4', nome: 'Contrapiso', etapa: null, percentual: 0 },
      { id: 't1', codigo: 't1', nome: 'Alvenaria lado 2', etapa: 'Torre A 4º Pavimento', percentual: 60 },
    ]);
  });
});
