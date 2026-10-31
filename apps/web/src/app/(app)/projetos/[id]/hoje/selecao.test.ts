import { describe, expect, it } from 'vitest';
import type { ItemEap } from '@obras/shared';
import { tarefasDoDia } from './selecao';

let n = 0;
function t(p: Partial<ItemEap>): ItemEap {
  n += 1;
  return {
    id: String(n), pai_id: null, posicao: n, nivel: 1, codigo: String(n), tipo: 'tarefa', nome: `T${n}`,
    unidade: null, quantidade: null, custo_previsto: null, inicio_previsto: null, fim_previsto: null,
    codigo_externo: null, qtd_filhos: 0, qtd_tarefas: 1, inicio_base: null, fim_base: null, custo_base: null,
    percentual_fisico: 0, avanco_em: null, ...p,
  };
}

describe('tarefasDoDia', () => {
  const hoje = '2026-11-10';
  const itens = [
    t({ nome: 'andando', inicio_previsto: '2026-11-05', fim_previsto: '2026-11-12', percentual_fisico: 40 }),
    t({ nome: 'atrasada', inicio_previsto: '2026-11-01', fim_previsto: '2026-11-08', percentual_fisico: 70 }),
    t({ nome: 'pronta', inicio_previsto: '2026-11-01', fim_previsto: '2026-11-08', percentual_fisico: 100, avanco_em: '2026-11-07' }),
    t({ nome: 'pronta hoje', inicio_previsto: '2026-11-08', fim_previsto: '2026-11-12', percentual_fisico: 100, avanco_em: hoje }),
    t({ nome: 'amanhã', inicio_previsto: '2026-11-11', fim_previsto: '2026-11-20' }),
    t({ nome: 'longe', inicio_previsto: '2026-12-01', fim_previsto: '2026-12-20' }),
    t({ nome: 'adiantada', inicio_previsto: '2026-12-01', fim_previsto: '2026-12-20', percentual_fisico: 10 }),
    t({ nome: 'sem datas' }),
    t({ nome: 'etapa', tipo: 'etapa', inicio_previsto: '2026-11-01', fim_previsto: '2026-11-30' }),
  ];
  const r = tarefasDoDia(itens, hoje);
  const nomes = (l: ItemEap[]) => l.map((i) => i.nome);

  it('separa em andamento, atrasadas, próximas e concluídas hoje', () => {
    expect(nomes(r.emAndamento)).toEqual(['andando']);
    expect(nomes(r.atrasadas)).toEqual(['atrasada']);
    expect(nomes(r.proximas)).toEqual(['amanhã', 'adiantada']);
    expect(nomes(r.concluidasHoje)).toEqual(['pronta hoje']);
  });
});
