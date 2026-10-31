// Somas do custo de mão de obra. O custo de cada linha vem calculado do banco
// (custo_mao_obra_projeto); aqui só agrupamos para a tela.
import type { LinhaCustoMaoObra } from './dominio';

export interface SomaMaoObra {
  chave: string;
  horas: number;
  custo: number;
  /** Linhas sem custo vigente (pessoa sem custo lançado na data). */
  semCusto: number;
}

function somar(linhas: LinhaCustoMaoObra[], chave: (l: LinhaCustoMaoObra) => string): SomaMaoObra[] {
  const m = new Map<string, SomaMaoObra>();
  for (const l of linhas) {
    const k = chave(l);
    const s = m.get(k) ?? { chave: k, horas: 0, custo: 0, semCusto: 0 };
    s.horas += Number(l.horas);
    if (l.custo === null) s.semCusto += 1;
    else s.custo += Number(l.custo);
    m.set(k, s);
  }
  return [...m.values()].map((s) => ({ ...s, horas: Math.round(s.horas * 100) / 100, custo: Math.round(s.custo * 100) / 100 }));
}

export function custoPorTarefa(linhas: LinhaCustoMaoObra[]): SomaMaoObra[] {
  return somar(linhas, (l) => l.tarefa_id ?? 'sem-tarefa').sort((a, b) => b.custo - a.custo);
}

export function custoPorDia(linhas: LinhaCustoMaoObra[]): SomaMaoObra[] {
  return somar(linhas, (l) => l.data).sort((a, b) => b.chave.localeCompare(a.chave));
}

export function totalMaoObra(linhas: LinhaCustoMaoObra[]): { custo: number; horas: number; semCusto: number } {
  const [t] = somar(linhas, () => 'total');
  return t ? { custo: t.custo, horas: t.horas, semCusto: t.semCusto } : { custo: 0, horas: 0, semCusto: 0 };
}

/** Equipe do diário a partir da chamada: presentes por função e empreiteira. */
export function efetivoDaChamada(
  presentes: { funcao: string; empreiteira: string | null }[],
): { funcao: string; empresa_terceira: string | null; quantidade: number }[] {
  const m = new Map<string, { funcao: string; empresa_terceira: string | null; quantidade: number }>();
  for (const p of presentes) {
    const k = `${p.funcao}|${p.empreiteira ?? ''}`;
    const e = m.get(k) ?? { funcao: p.funcao, empresa_terceira: p.empreiteira, quantidade: 0 };
    e.quantidade += 1;
    m.set(k, e);
  }
  return [...m.values()].sort((a, b) => b.quantidade - a.quantidade || a.funcao.localeCompare(b.funcao));
}
