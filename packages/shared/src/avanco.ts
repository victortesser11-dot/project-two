// Avanço físico: % real, % planejado, curva S e projeção de término.
// Mesma ponderação do banco (eap_do_projeto): pelo custo previsto quando
// todas as tarefas têm custo; senão, pela duração em dias.
import { diasEntre } from './formato';

export interface TarefaAvanco {
  id: string;
  custo_previsto: number | null;
  inicio_previsto: string | null;
  fim_previsto: string | null;
  inicio_base: string | null;
  fim_base: string | null;
  percentual_fisico: number;
}

export interface ApontamentoRegistrado {
  tarefa_id: string;
  data: string;
  percentual: number;
  registrado_em: string;
}

export interface PontoCurva {
  data: string;
  planejado: number | null;
  real: number | null;
}

function somarDias(iso: string, dias: number): string {
  const d = new Date(`${iso.slice(0, 10)}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + dias);
  return d.toISOString().slice(0, 10);
}

/** Peso de cada tarefa no avanço da obra (somam 1). */
export function pesosDasTarefas(tarefas: TarefaAvanco[]): Map<string, number> {
  const porCusto = tarefas.length > 0 && tarefas.every((t) => (t.custo_previsto ?? 0) > 0);
  const brutos = tarefas.map((t) => {
    if (porCusto) return Number(t.custo_previsto);
    if (t.inicio_previsto && t.fim_previsto) return diasEntre(t.inicio_previsto, t.fim_previsto) + 1;
    return 1;
  });
  const total = brutos.reduce((s, p) => s + p, 0);
  return new Map(tarefas.map((t, i) => [t.id, total > 0 ? brutos[i]! / total : 0]));
}

/** % físico real da obra (0–100), média ponderada das tarefas. */
export function fisicoReal(tarefas: TarefaAvanco[]): number {
  const pesos = pesosDasTarefas(tarefas);
  return arred(tarefas.reduce((s, t) => s + (pesos.get(t.id) ?? 0) * Number(t.percentual_fisico), 0));
}

/** Janela planejada de cada tarefa: linha de base quando existe; senão, o previsto. */
function janela(t: TarefaAvanco, usarBase: boolean): [string, string] | null {
  if (usarBase && t.inicio_base && t.fim_base) return [t.inicio_base, t.fim_base];
  if (t.inicio_previsto && t.fim_previsto) return [t.inicio_previsto, t.fim_previsto];
  return null;
}

/**
 * % que deveria estar pronto ao fim do dia `data`, supondo avanço linear
 * dentro de cada tarefa.
 */
export function fisicoPlanejadoEm(tarefas: TarefaAvanco[], data: string, usarBase = true): number {
  const pesos = pesosDasTarefas(tarefas);
  let soma = 0;
  for (const t of tarefas) {
    const j = janela(t, usarBase);
    if (!j) continue;
    const dur = diasEntre(j[0], j[1]) + 1;
    const feitos = Math.min(dur, Math.max(0, diasEntre(j[0], data) + 1));
    soma += (pesos.get(t.id) ?? 0) * (feitos / dur) * 100;
  }
  return arred(soma);
}

/** Primeiro e último dia planejados da obra. */
export function prazoPlanejado(tarefas: TarefaAvanco[], usarBase = true): { inicio: string; fim: string } | null {
  const js = tarefas.map((t) => janela(t, usarBase)).filter((j): j is [string, string] => j !== null);
  if (js.length === 0) return null;
  return { inicio: js.map((j) => j[0]).sort()[0]!, fim: js.map((j) => j[1]).sort().at(-1)! };
}

/**
 * Curva S física: planejado (linha de base) e real (apontamentos) no mesmo
 * eixo de datas. O real vai até hoje; o planejado, até o fim do prazo.
 */
export function curvaS(
  tarefas: TarefaAvanco[],
  apontamentos: ApontamentoRegistrado[],
  hoje: string,
  usarBase = true,
  maxPontos = 60,
): PontoCurva[] {
  const prazo = prazoPlanejado(tarefas, usarBase);
  if (!prazo) return [];
  const primeiroApontamento = apontamentos.map((a) => a.data).sort()[0];
  const inicio = [prazo.inicio, primeiroApontamento].filter(Boolean).sort()[0]!;
  const fim = [prazo.fim, hoje].sort().at(-1)!;
  const total = diasEntre(inicio, fim);
  const passo = Math.max(1, Math.ceil(total / maxPontos));

  const datas: string[] = [];
  for (let d = 0; d < total; d += passo) datas.push(somarDias(inicio, d));
  datas.push(fim);
  if (hoje > inicio && hoje < fim && !datas.includes(hoje)) datas.push(hoje);
  datas.sort();

  const pesos = pesosDasTarefas(tarefas);
  const ordenados = [...apontamentos].sort((a, b) =>
    a.data === b.data ? a.registrado_em.localeCompare(b.registrado_em) : a.data.localeCompare(b.data),
  );
  const ultimo = new Map<string, number>();
  let i = 0;

  return datas.map((data) => {
    while (i < ordenados.length && ordenados[i]!.data <= data) {
      ultimo.set(ordenados[i]!.tarefa_id, Number(ordenados[i]!.percentual));
      i += 1;
    }
    let real: number | null = null;
    if (data <= hoje) {
      real = 0;
      for (const [id, pct] of ultimo) real += (pesos.get(id) ?? 0) * pct;
      real = arred(real);
    }
    return { data, planejado: data <= prazo.fim || data <= hoje ? fisicoPlanejadoEm(tarefas, data, usarBase) : null, real };
  });
}

export type SituacaoPrazo = 'sem_dados' | 'nao_comecou' | 'sem_avanco' | 'no_prazo' | 'adiantada' | 'atrasada' | 'concluida';

export interface Projecao {
  situacao: SituacaoPrazo;
  real: number;
  planejado: number;
  /** Dias de atraso hoje (negativo = adiantada), pelo prazo agregado. */
  atrasoDias: number | null;
  inicioPlanejado: string | null;
  fimPlanejado: string | null;
  /** Mantendo o ritmo atual. */
  fimProjetado: string | null;
  referencia: 'linha_de_base' | 'previsto';
}

/**
 * Projeção pelo prazo agregado (earned schedule): acha em que dia o plano
 * previa o avanço que a obra tem hoje. A diferença até hoje é o atraso; a
 * razão entre os dois é o ritmo, usado para projetar o término.
 */
export function projetarTermino(tarefas: TarefaAvanco[], hoje: string, temLinhaBase: boolean): Projecao {
  const usarBase = temLinhaBase;
  const referencia = temLinhaBase ? 'linha_de_base' : 'previsto';
  const prazo = prazoPlanejado(tarefas, usarBase);
  const real = fisicoReal(tarefas);
  const base = { real, referencia, inicioPlanejado: prazo?.inicio ?? null, fimPlanejado: prazo?.fim ?? null } as const;

  if (!prazo || tarefas.length === 0) {
    return { ...base, situacao: 'sem_dados', planejado: 0, atrasoDias: null, fimProjetado: null };
  }
  const planejado = fisicoPlanejadoEm(tarefas, hoje, usarBase);
  if (real >= 100) return { ...base, situacao: 'concluida', planejado, atrasoDias: null, fimProjetado: null };
  if (hoje < prazo.inicio) {
    return { ...base, situacao: 'nao_comecou', planejado, atrasoDias: null, fimProjetado: prazo.fim };
  }
  if (real <= 0) {
    return { ...base, situacao: 'sem_avanco', planejado, atrasoDias: diasEntre(prazo.inicio, hoje) + 1, fimProjetado: null };
  }

  // Prazo agregado: dias desde o início até o plano atingir o avanço real.
  const duracao = diasEntre(prazo.inicio, prazo.fim) + 1;
  let ganho = duracao;
  let anterior = 0;
  for (let d = 0; d < duracao; d++) {
    const p = fisicoPlanejadoEm(tarefas, somarDias(prazo.inicio, d), usarBase);
    if (p >= real) {
      // interpola dentro do dia
      ganho = d + (p > anterior ? (real - anterior) / (p - anterior) : 1);
      break;
    }
    anterior = p;
  }
  const decorrido = diasEntre(prazo.inicio, hoje) + 1;
  const atrasoDias = Math.round(decorrido - ganho);
  const ritmo = ganho / decorrido;
  const fimProjetado = somarDias(prazo.inicio, Math.ceil(duracao / ritmo) - 1);

  const situacao: SituacaoPrazo = atrasoDias > 2 ? 'atrasada' : atrasoDias < -2 ? 'adiantada' : 'no_prazo';
  return { ...base, situacao, planejado, atrasoDias, fimProjetado: fimProjetado < prazo.fim && situacao !== 'adiantada' ? prazo.fim : fimProjetado };
}

function arred(n: number) {
  return Math.round(n * 100) / 100;
}
