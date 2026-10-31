import { describe, expect, it } from 'vitest';
import { curvaS, fisicoPlanejadoEm, fisicoReal, pesosDasTarefas, projetarTermino, type TarefaAvanco } from './avanco';

function t(id: string, p: Partial<TarefaAvanco>): TarefaAvanco {
  return {
    id, custo_previsto: null, inicio_previsto: null, fim_previsto: null,
    inicio_base: null, fim_base: null, percentual_fisico: 0, ...p,
  };
}

// Duas tarefas de 10 dias em sequência, mesmo custo: obra de 20 dias.
const A = { custo_previsto: 1000, inicio_base: '2026-11-01', fim_base: '2026-11-10', inicio_previsto: '2026-11-01', fim_previsto: '2026-11-10' };
const B = { custo_previsto: 1000, inicio_base: '2026-11-11', fim_base: '2026-11-20', inicio_previsto: '2026-11-11', fim_previsto: '2026-11-20' };

describe('pesos e % real', () => {
  it('pondera pelo custo quando todas têm custo', () => {
    const p = pesosDasTarefas([t('a', { custo_previsto: 300 }), t('b', { custo_previsto: 100 })]);
    expect(p.get('a')).toBe(0.75);
  });

  it('cai para a duração quando falta custo', () => {
    const p = pesosDasTarefas([
      t('a', { custo_previsto: 300, inicio_previsto: '2026-11-01', fim_previsto: '2026-11-03' }),
      t('b', { inicio_previsto: '2026-11-01', fim_previsto: '2026-11-01' }),
    ]);
    expect(p.get('a')).toBe(0.75);
  });

  it('% real é a média ponderada', () => {
    expect(fisicoReal([t('a', { ...A, percentual_fisico: 100 }), t('b', { ...B, percentual_fisico: 50 })])).toBe(75);
  });
});

describe('planejado', () => {
  const obra = [t('a', A), t('b', B)];
  it('linear dentro de cada tarefa', () => {
    expect(fisicoPlanejadoEm(obra, '2026-10-31')).toBe(0);
    expect(fisicoPlanejadoEm(obra, '2026-11-05')).toBe(25);
    expect(fisicoPlanejadoEm(obra, '2026-11-10')).toBe(50);
    expect(fisicoPlanejadoEm(obra, '2026-11-30')).toBe(100);
  });

  it('usa a linha de base, não o previsto atual', () => {
    const atrasada = [t('a', { ...A, inicio_previsto: '2026-11-06', fim_previsto: '2026-11-15' }), t('b', B)];
    expect(fisicoPlanejadoEm(atrasada, '2026-11-05')).toBe(25);
    expect(fisicoPlanejadoEm(atrasada, '2026-11-05', false)).toBe(0);
  });
});

describe('projetarTermino', () => {
  it('no prazo quando o real acompanha o plano', () => {
    const r = projetarTermino([t('a', { ...A, percentual_fisico: 50 }), t('b', B)], '2026-11-05', true);
    expect(r.situacao).toBe('no_prazo');
    expect(r.atrasoDias).toBe(0);
    expect(r.fimProjetado).toBe('2026-11-20');
  });

  it('atrasada: avanço de 5 dias em 10 dias decorridos', () => {
    const r = projetarTermino([t('a', { ...A, percentual_fisico: 50 }), t('b', B)], '2026-11-10', true);
    expect(r.situacao).toBe('atrasada');
    expect(r.real).toBe(25);
    expect(r.planejado).toBe(50);
    expect(r.atrasoDias).toBe(5);
    // ritmo de 50%: os 20 dias viram 40
    expect(r.fimProjetado).toBe('2026-12-10');
  });

  it('adiantada', () => {
    const r = projetarTermino([t('a', { ...A, percentual_fisico: 100 }), t('b', B)], '2026-11-05', true);
    expect(r.situacao).toBe('adiantada');
    expect(r.atrasoDias).toBe(-5);
    expect(r.fimProjetado! < '2026-11-20').toBe(true);
  });

  it('sem avanço apontado depois de começar', () => {
    const r = projetarTermino([t('a', A), t('b', B)], '2026-11-04', true);
    expect(r.situacao).toBe('sem_avanco');
    expect(r.atrasoDias).toBe(4);
  });

  it('antes do início e concluída', () => {
    expect(projetarTermino([t('a', A)], '2026-10-01', true).situacao).toBe('nao_comecou');
    expect(projetarTermino([t('a', { ...A, percentual_fisico: 100 })], '2026-11-03', true).situacao).toBe('concluida');
  });

  it('sem linha de base usa o previsto', () => {
    const r = projetarTermino([t('a', { ...A, inicio_base: null, fim_base: null, percentual_fisico: 50 })], '2026-11-05', false);
    expect(r.referencia).toBe('previsto');
    expect(r.situacao).toBe('no_prazo');
  });

  it('sem datas não projeta', () => {
    expect(projetarTermino([t('a', { percentual_fisico: 10 })], '2026-11-05', true).situacao).toBe('sem_dados');
  });
});

describe('curvaS', () => {
  it('planejado até o fim e real até hoje, com o último apontamento de cada tarefa', () => {
    const pontos = curvaS(
      [t('a', A), t('b', B)],
      [
        { tarefa_id: 'a', data: '2026-11-03', percentual: 20, registrado_em: '2026-11-03T20:00:00Z' },
        { tarefa_id: 'a', data: '2026-11-03', percentual: 30, registrado_em: '2026-11-03T21:00:00Z' },
        { tarefa_id: 'a', data: '2026-11-08', percentual: 60, registrado_em: '2026-11-08T20:00:00Z' },
      ],
      '2026-11-08',
      true,
      100,
    );
    const em = (d: string) => pontos.find((p) => p.data === d)!;
    expect(em('2026-11-03').real).toBe(15);
    expect(em('2026-11-08').real).toBe(30);
    expect(em('2026-11-08').planejado).toBe(40);
    expect(em('2026-11-20').real).toBeNull();
    expect(em('2026-11-20').planejado).toBe(100);
  });
});
