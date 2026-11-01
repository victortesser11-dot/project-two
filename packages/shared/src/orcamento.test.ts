import { describe, expect, it } from 'vitest';
import { compromissoSchema, composicaoSchema, despesaSchema, errosPorCampo, regraSemaforoSchema } from './esquemas';
import { REGRA_SEMAFORO_PADRAO } from './dominio';
import {
  curvaSFinanceira,
  custosNaArvore,
  fisicoFinanceiro,
  indicadoresCusto,
  rotuloMes,
  semaforo,
  somarNaArvore,
  tabelaFisicoFinanceiro,
} from './orcamento';

const U = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;

// Estrutura (etapa) → Fundação, Pilares; Acabamento (etapa) → Pintura
const arvore = [
  { id: U(1), pai_id: null, tipo: 'etapa' as const, percentual_fisico: 0 },
  { id: U(2), pai_id: U(1), tipo: 'tarefa' as const, percentual_fisico: 100 },
  { id: U(3), pai_id: U(1), tipo: 'tarefa' as const, percentual_fisico: 50 },
  { id: U(4), pai_id: null, tipo: 'etapa' as const, percentual_fisico: 0 },
  { id: U(5), pai_id: U(4), tipo: 'tarefa' as const, percentual_fisico: 0 },
];

describe('soma na árvore', () => {
  it('cada tarefa soma em todas as etapas acima', () => {
    const r = somarNaArvore(arvore, new Map([[U(2), { v: 10 }], [U(3), { v: 5.5 }], [U(5), { v: 1 }]]));
    expect(Object.fromEntries([...r].map(([k, v]) => [k.slice(-1), v.v]))).toEqual({ '1': 15.5, '2': 10, '3': 5.5, '4': 1, '5': 1 });
  });

  it('orçado × comprometido × realizado com valor agregado por etapa', () => {
    const { porItem, semTarefa, obra } = custosNaArvore(arvore, [
      { tarefa_id: U(2), orcado: 10000, material: 4000, mao_obra: 3000, despesas: 1200, comprometido: 8000 },
      { tarefa_id: U(3), orcado: 5000, material: 0, mao_obra: 200, despesas: 1000, comprometido: 3000 },
      { tarefa_id: U(5), orcado: 2000, material: 0, mao_obra: 0, despesas: 0, comprometido: 0 },
      { tarefa_id: null, orcado: 0, material: 300, mao_obra: 0, despesas: 0, comprometido: 0 },
    ]);
    expect(porItem.get(U(1))).toEqual({ orcado: 15000, comprometido: 11000, realizado: 9400, material: 4000, mao_obra: 3200, despesas: 2200, agregado: 12500 });
    expect(porItem.get(U(4))?.agregado).toBe(0);
    expect(semTarefa?.realizado).toBe(300);
    expect(obra.realizado).toBe(9700);
    expect(obra.orcado).toBe(17000);
  });

  it('indicadores: desvio, % acima, IDC e custo projetado', () => {
    expect(indicadoresCusto({ orcado: 15000, realizado: 9400, agregado: 12500 })).toEqual({
      desvio: -3100,
      acimaPct: -24.8,
      idc: 1.33,
      projetadoNoTermino: 11280,
    });
    expect(indicadoresCusto({ orcado: 10000, realizado: 6000, agregado: 5000 })).toMatchObject({ acimaPct: 20, idc: 0.83, projetadoNoTermino: 12000 });
    expect(indicadoresCusto({ orcado: 10000, realizado: 0, agregado: 0 })).toEqual({ desvio: 0, acimaPct: null, idc: null, projetadoNoTermino: null });
  });
});

describe('físico-financeiro mensal', () => {
  it('distribui pelos dias de cada mês e fecha os centavos', () => {
    const r = fisicoFinanceiro([
      // 10 dias em outubro (22–31) e 20 em novembro (1–20): 1/3 e 2/3
      { id: 'a', custo: 1000, inicio: '2026-10-22', fim: '2026-11-20' },
      { id: 'b', custo: 600, inicio: '2026-12-01', fim: '2026-12-31' },
      { id: 'c', custo: 50, inicio: null, fim: null },
      { id: 'd', custo: null, inicio: '2026-10-01', fim: '2026-10-05' },
    ]);
    expect(r.meses).toEqual(['2026-10', '2026-11', '2026-12']);
    expect(r.porTarefa.get('a')).toEqual([333.33, 666.67, 0]);
    expect(r.porMes).toEqual([333.33, 666.67, 600]);
    expect(r.acumulado).toEqual([333.33, 1000, 1600]);
    expect(r.total).toBe(1600);
    expect(r.semDatas).toBe(50);
    expect(rotuloMes('2026-12')).toBe('dez/2026');
  });

  it('tabela na ordem da EAP com as etapas somando', () => {
    const itens = [
      { id: 'E', pai_id: null, codigo: '1', nome: 'Estrutura', tipo: 'etapa' as const, nivel: 1 },
      { id: 'a', pai_id: 'E', codigo: '1.1', nome: 'Fundação', tipo: 'tarefa' as const, nivel: 2 },
      { id: 'b', pai_id: 'E', codigo: '1.2', nome: 'Pilares', tipo: 'tarefa' as const, nivel: 2 },
      { id: 'X', pai_id: null, codigo: '2', nome: 'Vazia', tipo: 'etapa' as const, nivel: 1 },
    ];
    const ff = fisicoFinanceiro([
      { id: 'a', custo: 1000, inicio: '2026-10-22', fim: '2026-11-20' },
      { id: 'b', custo: 600, inicio: '2026-11-01', fim: '2026-11-30' },
    ]);
    expect(tabelaFisicoFinanceiro(itens, ff).map((l) => [l.codigo, l.valores, l.total])).toEqual([
      ['1', [333.33, 1266.67], 1600],
      ['1.1', [333.33, 666.67], 1000],
      ['1.2', [0, 600], 600],
    ]);
  });

  it('virada de ano e obra sem datas', () => {
    expect(fisicoFinanceiro([{ id: 'x', custo: 310, inicio: '2026-12-31', fim: '2027-01-30' }]).porTarefa.get('x')).toEqual([10, 300]);
    expect(fisicoFinanceiro([{ id: 'y', custo: 10, inicio: null, fim: null }])).toMatchObject({ meses: [], total: 0, semDatas: 10 });
  });
});

describe('curva S financeira', () => {
  const plano = [
    { id: 't1', custo: 1000, inicio: '2026-10-01', fim: '2026-10-10' },
    { id: 't2', custo: 1000, inicio: '2026-10-11', fim: '2026-10-20' },
  ];
  const orcado = new Map([['t1', 1000], ['t2', 1000]]);
  const pontos = curvaSFinanceira(
    plano,
    orcado,
    [
      { data: '2026-10-03', total: 200 },
      { data: '2026-10-08', total: 700 },
    ],
    [
      { tarefa_id: 't1', data: '2026-10-05', percentual: 50, registrado_em: '2026-10-05T18:00:00Z' },
      { tarefa_id: 't1', data: '2026-10-09', percentual: 100, registrado_em: '2026-10-09T18:00:00Z' },
    ],
    '2026-10-10',
    100,
  );
  const em = (d: string) => pontos.find((p) => p.data === d)!;

  it('planejado linear até o fim do plano; real e agregado só até hoje', () => {
    expect(em('2026-10-05')).toEqual({ data: '2026-10-05', planejado: 500, real: 200, agregado: 500 });
    expect(em('2026-10-10')).toEqual({ data: '2026-10-10', planejado: 1000, real: 900, agregado: 1000 });
    expect(em('2026-10-20')).toEqual({ data: '2026-10-20', planejado: 2000, real: null, agregado: null });
  });

  it('sem nada lançado, não há curva', () => {
    expect(curvaSFinanceira([], new Map(), [], [], '2026-10-10')).toEqual([]);
  });
});

describe('semáforo do portfólio', () => {
  const r = REGRA_SEMAFORO_PADRAO; // amarelo 7 dias / 5%, vermelho 30 dias / 10%
  it('a pior cor entre prazo e custo', () => {
    expect(semaforo({ atrasoDias: 2, custoAcimaPct: 1 }, r)).toEqual({ cor: 'verde', motivos: ['2 dias de atraso', 'custo 1% acima do que foi feito'] });
    expect(semaforo({ atrasoDias: 8, custoAcimaPct: -3 }, r).cor).toBe('amarelo');
    expect(semaforo({ atrasoDias: 1, custoAcimaPct: 12.5 }, r)).toEqual({ cor: 'vermelho', motivos: ['1 dia de atraso', 'custo 12,5% acima do que foi feito'] });
    expect(semaforo({ atrasoDias: -5, custoAcimaPct: null }, r)).toEqual({ cor: 'verde', motivos: ['No prazo e no custo'] });
    expect(semaforo({ atrasoDias: null, custoAcimaPct: null }, r).cor).toBe('sem_dados');
  });
});

describe('esquemas do orçamento', () => {
  it('composição aceita reais brasileiros e vazio', () => {
    expect(composicaoSchema.parse({ material: '6.000,00', mao_obra: 'R$ 3000', equipamento: '', outros: null })).toEqual({
      material: 6000,
      mao_obra: 3000,
      equipamento: null,
      outros: null,
    });
    expect(errosPorCampo(composicaoSchema.safeParse({ material: '-1' }).error!)).toEqual({ material: 'Não pode ser negativo' });
  });

  it('despesa exige tarefa e valor maior que zero', () => {
    const r = despesaSchema.safeParse({ data: '2026-10-31', categoria: 'frete', descricao: 'Frete do aço', valor: '0' });
    expect(errosPorCampo(r.error!)).toEqual({ tarefa_id: 'Escolha a tarefa da despesa', valor: 'O valor precisa ser maior que zero' });
    expect(despesaSchema.parse({ tarefa_id: U(1), data: '2026-10-31', categoria: 'frete', descricao: 'Frete', valor: '1.250,50', compromisso_id: '' })).toMatchObject({
      valor: 1250.5,
      compromisso_id: null,
      fornecedor: null,
    });
  });

  it('contrato confere o CNPJ', () => {
    const r = compromissoSchema.safeParse({ tarefa_id: U(1), tipo: 'contrato', descricao: 'Armação', valor: '3000', data: '2026-10-01', cnpj: '11.222.333/0001-80' });
    expect(errosPorCampo(r.error!)).toEqual({ cnpj: 'CNPJ inválido: confira os números' });
  });

  it('regras: vermelho depois do amarelo', () => {
    const r = regraSemaforoSchema.safeParse({ atraso_amarelo_dias: '10', atraso_vermelho_dias: '5', custo_amarelo_pct: '5', custo_vermelho_pct: '3' });
    expect(errosPorCampo(r.error!)).toEqual({
      atraso_vermelho_dias: 'O vermelho precisa de mais dias que o amarelo',
      custo_vermelho_pct: 'O vermelho precisa de um percentual maior que o amarelo',
    });
    expect(regraSemaforoSchema.parse({ atraso_amarelo_dias: '7', atraso_vermelho_dias: '30', custo_amarelo_pct: '5', custo_vermelho_pct: '10,5' })).toEqual({
      atraso_amarelo_dias: 7,
      atraso_vermelho_dias: 30,
      custo_amarelo_pct: 5,
      custo_vermelho_pct: 10.5,
    });
  });
});
