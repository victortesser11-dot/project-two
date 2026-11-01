// Orçamento, físico-financeiro, curva S financeira e semáforo. Os custos realizados
// vêm calculados do banco (orcado_realizado, custo_realizado_por_dia); aqui só se
// soma na árvore, distribui o planejado no tempo e compara.
import type { ApontamentoRegistrado } from './avanco';
import type { LinhaOrcadoRealizado, RegraSemaforo } from './dominio';
import { diasEntre } from './formato';

const cent = (n: number) => Math.round(n * 100) / 100;

function somarDias(iso: string, dias: number): string {
  const d = new Date(`${iso.slice(0, 10)}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + dias);
  return d.toISOString().slice(0, 10);
}

// ---------------------------------------------------------------- árvore

export interface NoArvore {
  id: string;
  pai_id: string | null;
}

/**
 * Soma valores das tarefas em todos os ancestrais (etapas). Devolve um mapa com o total
 * de cada item que recebeu algo (as tarefas incluídas).
 */
export function somarNaArvore<T extends { [K in keyof T]: number }>(itens: NoArvore[], valores: Map<string, T>): Map<string, T> {
  const pai = new Map(itens.map((i) => [i.id, i.pai_id]));
  const saida = new Map<string, T>();
  const somar = (alvo: string, v: T) => {
    const atual = saida.get(alvo);
    if (!atual) {
      saida.set(alvo, { ...v });
      return;
    }
    for (const k of Object.keys(v) as (keyof T)[]) (atual[k] as number) = cent((atual[k] as number) + (v[k] as number));
  };
  for (const [id, v] of valores) {
    let no: string | null | undefined = id;
    const vistos = new Set<string>();
    while (no && !vistos.has(no)) {
      vistos.add(no);
      somar(no, v);
      no = pai.get(no) ?? null;
    }
  }
  return saida;
}

export interface TotaisCusto {
  orcado: number;
  comprometido: number;
  realizado: number;
  material: number;
  mao_obra: number;
  despesas: number;
  /** Orçado × % físico: quanto valia o que já foi feito. */
  agregado: number;
}

/** Linhas do banco + % físico de cada tarefa → totais por item (tarefas e etapas). */
export function custosNaArvore(
  itens: (NoArvore & { tipo: 'etapa' | 'tarefa'; percentual_fisico: number })[],
  linhas: LinhaOrcadoRealizado[],
): { porItem: Map<string, TotaisCusto>; semTarefa: TotaisCusto | null; obra: TotaisCusto } {
  const pct = new Map(itens.map((i) => [i.id, Number(i.percentual_fisico)]));
  const valores = new Map<string, TotaisCusto>();
  let semTarefa: TotaisCusto | null = null;
  const obra: TotaisCusto = { orcado: 0, comprometido: 0, realizado: 0, material: 0, mao_obra: 0, despesas: 0, agregado: 0 };
  for (const l of linhas) {
    const realizado = cent(l.material + l.mao_obra + l.despesas);
    const t: TotaisCusto = {
      orcado: cent(l.orcado),
      comprometido: cent(l.comprometido),
      realizado,
      material: cent(l.material),
      mao_obra: cent(l.mao_obra),
      despesas: cent(l.despesas),
      agregado: l.tarefa_id ? cent((l.orcado * (pct.get(l.tarefa_id) ?? 0)) / 100) : 0,
    };
    if (l.tarefa_id && pct.has(l.tarefa_id)) valores.set(l.tarefa_id, t);
    else semTarefa = t;
    for (const k of Object.keys(obra) as (keyof TotaisCusto)[]) obra[k] = cent(obra[k] + t[k]);
  }
  return { porItem: somarNaArvore(itens, valores), semTarefa, obra };
}

export interface IndicadoresCusto {
  /** Realizado − agregado (positivo = gastou mais do que valia o que foi feito). */
  desvio: number;
  /** Quanto o realizado passou do agregado, em % (positivo = acima). null sem avanço. */
  acimaPct: number | null;
  /** Índice de desempenho de custo: agregado ÷ realizado (1 = no orçamento). */
  idc: number | null;
  /** Custo projetado no término, mantendo o desempenho: orçado ÷ IDC. */
  projetadoNoTermino: number | null;
}

export function indicadoresCusto({ orcado, realizado, agregado }: Pick<TotaisCusto, 'orcado' | 'realizado' | 'agregado'>): IndicadoresCusto {
  const idc = realizado > 0 && agregado > 0 ? agregado / realizado : null;
  return {
    desvio: cent(realizado - agregado),
    acimaPct: agregado > 0 ? Math.round((realizado / agregado - 1) * 1000) / 10 : null,
    idc: idc === null ? null : Math.round(idc * 100) / 100,
    projetadoNoTermino: idc === null || orcado <= 0 ? null : cent(orcado / idc),
  };
}

// ---------------------------------------------------------------- físico-financeiro (RF-502)

export interface TarefaFinanceira {
  id: string;
  custo: number | null;
  inicio: string | null;
  fim: string | null;
}

export interface FisicoFinanceiro {
  /** "2026-11", em ordem. */
  meses: string[];
  /** Valor de cada tarefa em cada mês (mesma ordem de `meses`). */
  porTarefa: Map<string, number[]>;
  porMes: number[];
  acumulado: number[];
  total: number;
  /** Custo de tarefas sem datas (não entra nos meses). */
  semDatas: number;
}

const mesDe = (iso: string) => iso.slice(0, 7);

function proximoMes(mes: string): string {
  const [a, m] = mes.split('-').map(Number) as [number, number];
  return m === 12 ? `${a + 1}-01` : `${a}-${String(m + 1).padStart(2, '0')}`;
}

/** Último dia do mês "AAAA-MM". */
function fimDoMes(mes: string): string {
  const [a, m] = mes.split('-').map(Number) as [number, number];
  return new Date(Date.UTC(a, m, 0)).toISOString().slice(0, 10);
}

/**
 * Distribui o custo de cada tarefa pelos meses em que ela acontece, proporcional aos dias
 * corridos em cada mês (avanço linear, o mesmo critério da curva S). Centavos da sobra vão
 * para o último mês da tarefa, para a soma bater com o custo.
 */
export function fisicoFinanceiro(tarefas: TarefaFinanceira[]): FisicoFinanceiro {
  const comDatas = tarefas.filter((t) => t.inicio && t.fim && (t.custo ?? 0) > 0);
  const semDatas = cent(tarefas.filter((t) => (!t.inicio || !t.fim) && (t.custo ?? 0) > 0).reduce((s, t) => s + (t.custo ?? 0), 0));
  if (comDatas.length === 0) return { meses: [], porTarefa: new Map(), porMes: [], acumulado: [], total: 0, semDatas };

  const primeiro = mesDe(comDatas.map((t) => t.inicio!).sort()[0]!);
  const ultimo = mesDe(comDatas.map((t) => t.fim!).sort().at(-1)!);
  const meses: string[] = [];
  for (let m = primeiro; m <= ultimo; m = proximoMes(m)) meses.push(m);
  const indice = new Map(meses.map((m, i) => [m, i]));

  const porTarefa = new Map<string, number[]>();
  for (const t of comDatas) {
    const linha = meses.map(() => 0);
    const dur = diasEntre(t.inicio!, t.fim!) + 1;
    let distribuido = 0;
    let ultimoIndice = 0;
    for (let m = mesDe(t.inicio!); m <= mesDe(t.fim!); m = proximoMes(m)) {
      const ini = m === mesDe(t.inicio!) ? t.inicio! : `${m}-01`;
      const fim = m === mesDe(t.fim!) ? t.fim! : fimDoMes(m);
      const valor = cent((t.custo! * (diasEntre(ini, fim) + 1)) / dur);
      const i = indice.get(m)!;
      linha[i] = valor;
      distribuido = cent(distribuido + valor);
      ultimoIndice = i;
    }
    linha[ultimoIndice] = cent(linha[ultimoIndice]! + (t.custo! - distribuido));
    porTarefa.set(t.id, linha);
  }
  const porMes = meses.map((_, i) => cent([...porTarefa.values()].reduce((s, l) => s + l[i]!, 0)));
  const acumulado: number[] = [];
  porMes.reduce((s, v, i) => (acumulado[i] = cent(s + v)), 0);
  return { meses, porTarefa, porMes, acumulado, total: acumulado.at(-1) ?? 0, semDatas };
}

/** "2026-11" → "nov/2026". */
export function rotuloMes(mes: string): string {
  const nomes = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
  const [a, m] = mes.split('-').map(Number) as [number, number];
  return `${nomes[m - 1]}/${a}`;
}

// ---------------------------------------------------------------- curva S financeira (RF-504)

export interface PontoFinanceiro {
  data: string;
  /** Custo planejado acumulado até o dia (linha de base, ou previsto). */
  planejado: number | null;
  /** Custo realizado acumulado (até hoje). */
  real: number | null;
  /** Valor agregado acumulado: orçado × % físico apontado até o dia (até hoje). */
  agregado: number | null;
}

/**
 * Curva S financeira: planejado × realizado × agregado no mesmo eixo de datas.
 * `planejadas` usa a linha de base quando houver (custo e datas de base).
 */
export function curvaSFinanceira(
  planejadas: TarefaFinanceira[],
  orcadoPorTarefa: Map<string, number>,
  realizadoPorDia: { data: string; total: number }[],
  apontamentos: ApontamentoRegistrado[],
  hoje: string,
  maxPontos = 60,
): PontoFinanceiro[] {
  const validas = planejadas.filter((t) => t.inicio && t.fim && (t.custo ?? 0) > 0);
  const inicios = [
    ...validas.map((t) => t.inicio!),
    ...realizadoPorDia.map((r) => r.data),
    ...apontamentos.map((a) => a.data),
  ].sort();
  if (inicios.length === 0) return [];
  const inicio = inicios[0]!;
  const fimPlano = validas.map((t) => t.fim!).sort().at(-1) ?? hoje;
  const fim = [fimPlano, hoje].sort().at(-1)!;
  const total = diasEntre(inicio, fim);
  const passo = Math.max(1, Math.ceil(total / maxPontos));
  const datas: string[] = [];
  for (let d = 0; d < total; d += passo) datas.push(somarDias(inicio, d));
  datas.push(fim);
  if (hoje > inicio && hoje < fim && !datas.includes(hoje)) datas.push(hoje);
  datas.sort();

  const planejadoAte = (data: string) =>
    validas.reduce((s, t) => {
      const dur = diasEntre(t.inicio!, t.fim!) + 1;
      const feitos = Math.min(dur, Math.max(0, diasEntre(t.inicio!, data) + 1));
      return s + (t.custo! * feitos) / dur;
    }, 0);

  const reais = [...realizadoPorDia].sort((a, b) => a.data.localeCompare(b.data));
  const aps = [...apontamentos].sort((a, b) => (a.data === b.data ? a.registrado_em.localeCompare(b.registrado_em) : a.data.localeCompare(b.data)));
  const pct = new Map<string, number>();
  let ir = 0;
  let ia = 0;
  let acumuladoReal = 0;

  return datas.map((data) => {
    while (ir < reais.length && reais[ir]!.data <= data) acumuladoReal += reais[ir++]!.total;
    while (ia < aps.length && aps[ia]!.data <= data) {
      pct.set(aps[ia]!.tarefa_id, Number(aps[ia]!.percentual));
      ia += 1;
    }
    let agregado = 0;
    for (const [id, p] of pct) agregado += ((orcadoPorTarefa.get(id) ?? 0) * p) / 100;
    return {
      data,
      // Depois do fim do plano o planejado fica no total (a obra devia ter acabado).
      planejado: validas.length > 0 ? cent(planejadoAte(data)) : null,
      real: data <= hoje ? cent(acumuladoReal) : null,
      agregado: data <= hoje ? cent(agregado) : null,
    };
  });
}

// ---------------------------------------------------------------- semáforo (RF-602)

export type CorSemaforo = 'verde' | 'amarelo' | 'vermelho' | 'sem_dados';

export interface Semaforo {
  cor: CorSemaforo;
  motivos: string[];
}

/** Cor da obra pelas regras da empresa: a pior entre prazo e custo. */
export function semaforo(
  { atrasoDias, custoAcimaPct }: { atrasoDias: number | null; custoAcimaPct: number | null },
  regra: RegraSemaforo,
): Semaforo {
  if (atrasoDias === null && custoAcimaPct === null) return { cor: 'sem_dados', motivos: ['Sem avanço ou custo apontado ainda'] };
  const ordem: CorSemaforo[] = ['verde', 'amarelo', 'vermelho'];
  let cor: CorSemaforo = 'verde';
  const motivos: string[] = [];
  const piorar = (c: CorSemaforo) => {
    if (ordem.indexOf(c) > ordem.indexOf(cor)) cor = c;
  };
  if (atrasoDias !== null) {
    if (atrasoDias >= regra.atraso_vermelho_dias) piorar('vermelho');
    else if (atrasoDias >= regra.atraso_amarelo_dias) piorar('amarelo');
    if (atrasoDias > 0) motivos.push(`${atrasoDias} ${atrasoDias === 1 ? 'dia' : 'dias'} de atraso`);
  }
  if (custoAcimaPct !== null) {
    if (custoAcimaPct >= regra.custo_vermelho_pct) piorar('vermelho');
    else if (custoAcimaPct >= regra.custo_amarelo_pct) piorar('amarelo');
    if (custoAcimaPct > 0) motivos.push(`custo ${String(custoAcimaPct).replace('.', ',')}% acima do que foi feito`);
  }
  if (motivos.length === 0) motivos.push('No prazo e no custo');
  return { cor, motivos };
}

export interface LinhaTabelaFF {
  id: string;
  codigo: string;
  nome: string;
  tipo: 'etapa' | 'tarefa';
  nivel: number;
  valores: number[];
  total: number;
}

/** Linhas do físico-financeiro na ordem da EAP: tarefas com seus meses e etapas somando as de dentro. */
export function tabelaFisicoFinanceiro(
  itens: (NoArvore & { codigo: string; nome: string; tipo: 'etapa' | 'tarefa'; nivel: number })[],
  ff: FisicoFinanceiro,
): LinhaTabelaFF[] {
  const zeros = () => ff.meses.map(() => 0);
  const porItem = new Map<string, number[]>();
  const pai = new Map(itens.map((i) => [i.id, i.pai_id]));
  for (const [id, valores] of ff.porTarefa) {
    let no: string | null | undefined = id;
    while (no) {
      const atual = porItem.get(no) ?? zeros();
      porItem.set(no, atual.map((v, i) => cent(v + valores[i]!)));
      no = pai.get(no) ?? null;
    }
  }
  return itens
    .filter((i) => porItem.has(i.id))
    .map((i) => {
      const valores = porItem.get(i.id)!;
      return { id: i.id, codigo: i.codigo, nome: i.nome, tipo: i.tipo, nivel: i.nivel, valores, total: cent(valores.reduce((s, v) => s + v, 0)) };
    });
}
