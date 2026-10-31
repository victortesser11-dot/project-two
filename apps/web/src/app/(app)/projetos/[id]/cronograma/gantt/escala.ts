// Escala do Gantt: datas viram posições em pixels. Sem React, para testar.
import { diasEntre, type ItemEap } from '@obras/shared';

export type Zoom = 'tudo' | 'dia' | 'semana' | 'mes';
/** Pixels por dia em cada zoom. "tudo" é calculado pela largura disponível (pxParaCaber). */
export const PX_POR_DIA: Record<Exclude<Zoom, 'tudo'>, number> = { dia: 28, semana: 10, mes: 3.5 };
export const ZOOMS: Zoom[] = ['tudo', 'dia', 'semana', 'mes'];
export const ROTULO_ZOOM: Record<Zoom, string> = { tudo: 'Obra toda', dia: 'Dias', semana: 'Semanas', mes: 'Meses' };

/** Escala que faz a obra inteira caber na largura (nunca menos de 1,5 px por dia). */
export function pxParaCaber(larguraDisponivel: number, totalDias: number): number {
  if (totalDias <= 0 || larguraDisponivel <= 0) return PX_POR_DIA.mes;
  return Math.max(1.5, Math.min(PX_POR_DIA.dia, larguraDisponivel / totalDias));
}

const MESES = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];

/** "2026-11-30" + 2 → "2026-12-02" (calendário corrido, sem fuso). */
export function somarDias(iso: string, dias: number): string {
  const d = new Date(`${iso.slice(0, 10)}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + dias);
  return d.toISOString().slice(0, 10);
}

/** Primeira e última data que o gráfico precisa mostrar, com uma margem. */
export function janelaDoGantt(itens: ItemEap[], hoje: string): { inicio: string; fim: string } | null {
  const datas: string[] = [];
  for (const i of itens) {
    if (i.tipo !== 'tarefa') continue;
    for (const d of [i.inicio_previsto, i.fim_previsto, i.inicio_base, i.fim_base]) if (d) datas.push(d);
  }
  if (datas.length === 0) return null;
  datas.sort();
  let inicio = datas[0]!;
  let fim = datas[datas.length - 1]!;
  // Hoje entra na janela quando está perto (até 30 dias fora), para a linha aparecer.
  if (hoje < inicio && diasEntre(hoje, inicio) <= 30) inicio = hoje;
  if (hoje > fim && diasEntre(fim, hoje) <= 30) fim = hoje;
  return { inicio: somarDias(inicio, -3), fim: somarDias(fim, 7) };
}

/** Zoom fixo mais próximo de uma escala, para mostrar os dias quando cabem. */
export function zoomPadrao(totalDias: number): Exclude<Zoom, 'tudo'> {
  if (totalDias <= 45) return 'dia';
  if (totalDias <= 150) return 'semana';
  return 'mes';
}

/** Posição (px) da borda esquerda de um dia e largura de um intervalo inclusivo. */
export function posicao(inicioJanela: string, data: string, px: number): number {
  return diasEntre(inicioJanela, data) * px;
}
export function largura(inicio: string, fim: string, px: number): number {
  return (diasEntre(inicio, fim) + 1) * px;
}

export interface MarcaMes {
  x: number;
  rotulo: string;
}

/** Viradas de mês dentro da janela, para o cabeçalho e as linhas de grade. */
export function marcasDeMes(inicio: string, fim: string, px: number): MarcaMes[] {
  const marcas: MarcaMes[] = [];
  let [ano, mes] = inicio.split('-').map(Number) as [number, number];
  // o próprio mês do início entra se a janela começa no dia 1
  if (!inicio.endsWith('-01')) mes += 1;
  for (let i = 0; i < 240; i++) {
    if (mes > 12) {
      mes = 1;
      ano += 1;
    }
    const iso = `${ano}-${String(mes).padStart(2, '0')}-01`;
    if (iso > fim) break;
    marcas.push({ x: posicao(inicio, iso, px), rotulo: mes === 1 ? `${MESES[0]} ${ano}` : (MESES[mes - 1] ?? '') });
    mes += 1;
  }
  return marcas;
}

/** Segundas-feiras na janela (grade fina no zoom de dias e semanas). */
export function segundasFeiras(inicio: string, fim: string, px: number): number[] {
  const dia = new Date(`${inicio}T00:00:00Z`).getUTCDay(); // 0 = domingo
  const ate = (8 - dia) % 7;
  const xs: number[] = [];
  for (let d = somarDias(inicio, ate); d <= fim; d = somarDias(d, 7)) xs.push(posicao(inicio, d, px));
  return xs;
}

/** Dias de atraso do término previsto em relação à linha de base (negativo = adiantado). */
export function desvioDaBase(item: Pick<ItemEap, 'fim_previsto' | 'fim_base'>): number | null {
  if (!item.fim_previsto || !item.fim_base) return null;
  return diasEntre(item.fim_base, item.fim_previsto);
}
