import { describe, expect, it } from 'vitest';
import { alertasFiscal } from './alertas';
import { achadosDaLeitura, leituraFiscalSchema, pedidoFiscalDia, taxaDeAcerto, type TarefaParaFoto } from './ia';
import { normalizarNorma, textoChecklistNormas } from './normas';

const tarefas: TarefaParaFoto[] = [
  { id: 't1', codigo: '1.4.4', nome: 'Alvenaria lado 2', etapa: 'Torre A 4º', percentual: 30 },
  { id: 't2', codigo: '1.4.6', nome: 'Laje lado 2', etapa: 'Torre A 4º', percentual: 60 },
  { id: 't3', codigo: '1.4.5', nome: 'Graute', etapa: 'Torre A 4º', percentual: 0 },
  { id: 't4', codigo: '1.5.1', nome: 'Reboco', etapa: 'Torre B', percentual: 10 },
  { id: 't5', codigo: '1.5.2', nome: 'Contrapiso', etapa: 'Torre B', percentual: 50 },
];

describe('normas da obra', () => {
  it('reconhece o jeito que a IA escreve a norma e recusa o que não é da obra', () => {
    expect(normalizarNorma('NR 35')).toBe('NR-35');
    expect(normalizarNorma('nr-06')).toBe('NR-6');
    expect(normalizarNorma('NR18')).toBe('NR-18');
    expect(normalizarNorma('NR-33')).toBeNull();
    expect(normalizarNorma('ABNT NBR 6118')).toBeNull();
  });
  it('o checklist cobre altura, periferia, EPI e máquinas', () => {
    const t = textoChecklistNormas();
    for (const n of ['NR-35', 'NR-18', 'NR-6', 'NR-12', 'NR-10']) expect(t).toContain(n);
  });
});

describe('achados do fiscal', () => {
  const leitura = leituraFiscalSchema.parse({
    resumo: 'Alvenaria do 4º avançou; laje parada.',
    tarefas: [
      { ref: 'T1', situacao: 'avancou', percentual_sugerido: 45, evidencia: 'imagem 1: fiadas novas' },
      { ref: 'T2', situacao: 'sem_evidencia', percentual_sugerido: 15, evidencia: 'imagem 2: só fôrma' },
      { ref: 'T3', situacao: 'sem_evidencia' },
      { ref: 'T4', situacao: 'nao_visivel' },
      { ref: 'T5', situacao: 'avancou', percentual_sugerido: 55 },
    ],
    seguranca: [
      { norma: 'NR 35', tema: 'Trabalho em altura', descricao: 'Operário na borda da laje sem cinto', evidencia: 'imagem 1', gravidade: 'alta' },
      { norma: 'NR-99', tema: 'Organização', descricao: 'Entulho na passagem' },
      { norma: 'NR-18', descricao: 'x' },
    ],
  });
  // No dia, apontaram a laje (60%) e o contrapiso (80%).
  const apontados = new Map([['t2', 60], ['t5', 80]]);
  const achados = achadosDaLeitura(leitura, tarefas, apontados);
  const porTarefa = (id: string) => achados.find((a) => a.tarefa_id === id);

  it('avanço visto sem apontamento vira achado de avanço, com o visto e o apontado', () => {
    expect(porTarefa('t1')).toMatchObject({ tipo: 'avanco', percentual_visto: 45, percentual_apontado: 30, evidencia: 'imagem 1: fiadas novas' });
  });
  it('apontado no dia sem sinal nas imagens é divergência alta', () => {
    expect(porTarefa('t2')).toMatchObject({ tipo: 'divergencia', gravidade: 'alta', percentual_apontado: 60, percentual_visto: 15 });
  });
  it('prevista sem sinal (e sem apontamento) fica como baixa; fora do quadro não vira achado', () => {
    expect(porTarefa('t3')).toMatchObject({ tipo: 'sem_evidencia', gravidade: 'baixa' });
    expect(porTarefa('t4')).toBeUndefined();
  });
  it('apontado 25 pontos acima do que aparece é divergência média', () => {
    expect(porTarefa('t5')).toMatchObject({ tipo: 'divergencia', gravidade: 'media', percentual_apontado: 80, percentual_visto: 55 });
  });
  it('segurança cita a norma; norma fora da lista vira NR-18; item sem descrição cai', () => {
    const seg = achados.filter((a) => a.tipo === 'seguranca');
    expect(seg.map((a) => a.norma)).toEqual(['NR-35', 'NR-18']);
    expect(seg[0]).toMatchObject({ gravidade: 'alta', titulo: 'NR-35 · Trabalho em altura: Operário na borda da laje sem cinto' });
  });
  it('vira alerta só a divergência e a segurança ainda a conferir', () => {
    const gravados = achados.map((a, i) => ({ ...a, id: `a${i}`, situacao: i === 0 ? 'confirmado' : 'pendente', data: '2026-11-17' }));
    const alertas = alertasFiscal(gravados);
    expect(alertas.map((a) => a.secao)).toEqual(['fiscal', 'fiscal', 'fiscal', 'fiscal']);
    expect(alertas.every((a) => a.caminho === 'fiscal')).toBe(true);
    expect(alertas.some((a) => a.titulo.startsWith('Avanço visto'))).toBe(false);
  });
});

describe('pedido e acerto', () => {
  it('o pedido diz o que foi apontado no dia e lista as imagens na ordem', () => {
    const t = pedidoFiscalDia({
      obra: 'Nápoles', data: '2026-11-17', tarefas: tarefas.slice(0, 2),
      imagens: ['Câmera Torre A, hoje 12:03', 'Câmera Torre A, ontem 12:01'], apontadosNoDia: new Map([['t2', 60]]),
    });
    expect(t).toContain('1. Câmera Torre A, hoje 12:03');
    expect(t).toContain('T2 — 1.4.6 Laje lado 2 (Torre A 4º) — 60% feito; apontado no dia: 60%');
    expect(t).toContain('sem subitem');
  });
  it('taxa de acerto = confirmados sobre conferidos; sem conferência, sem taxa', () => {
    expect(taxaDeAcerto([{ situacao: 'confirmado' }, { situacao: 'confirmado' }, { situacao: 'corrigido' }, { situacao: 'descartado' }, { situacao: 'pendente' }]))
      .toEqual({ conferidos: 4, confirmados: 2, corrigidos: 1, descartados: 1, pendentes: 1, taxa: 0.5 });
    expect(taxaDeAcerto([{ situacao: 'pendente' }]).taxa).toBeNull();
  });
});
