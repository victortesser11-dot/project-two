const moeda = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });
const moedaCompacta = new Intl.NumberFormat('pt-BR', {
  style: 'currency',
  currency: 'BRL',
  notation: 'compact',
  maximumFractionDigits: 1,
});

export function formatarMoeda(valor: number | null | undefined, opcoes?: { compacta?: boolean }): string {
  if (valor === null || valor === undefined) return '—';
  return (opcoes?.compacta ? moedaCompacta : moeda).format(valor);
}

/** "2026-11-03" → "03/11/2026", sem conversão de fuso. */
export function formatarData(iso: string | null | undefined): string {
  if (!iso) return '—';
  const [ano, mes, dia] = iso.slice(0, 10).split('-');
  if (!ano || !mes || !dia) return '—';
  return `${dia}/${mes}/${ano}`;
}

/** Data de hoje (AAAA-MM-DD) no fuso da obra. Padrão: horário de Brasília. */
export function hojeIso(fuso = 'America/Sao_Paulo', agora = new Date()): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: fuso }).format(agora);
}

/** Dia (AAAA-MM-DD) de um instante (timestamptz) no fuso da obra. */
export function dataDoInstante(instante: string, fuso = 'America/Sao_Paulo'): string {
  return hojeIso(fuso, new Date(instante));
}

/** Dias corridos entre duas datas ISO (fim − início). */
export function diasEntre(inicioIso: string, fimIso: string): number {
  const ms = Date.parse(`${fimIso.slice(0, 10)}T00:00:00Z`) - Date.parse(`${inicioIso.slice(0, 10)}T00:00:00Z`);
  return Math.round(ms / 86_400_000);
}

/**
 * Prazo decorrido, de 0 a 1, em relação a "hoje" (ISO).
 * null quando faltam datas.
 */
export function prazoDecorrido(
  inicioIso: string | null,
  fimIso: string | null,
  hojeIso: string,
): number | null {
  if (!inicioIso || !fimIso) return null;
  const total = diasEntre(inicioIso, fimIso);
  if (total <= 0) return hojeIso >= fimIso.slice(0, 10) ? 1 : 0;
  const passados = diasEntre(inicioIso, hojeIso);
  return Math.min(1, Math.max(0, passados / total));
}

/** "2026-11-30" + 2 → "2026-12-02" (calendário corrido, sem fuso). */
export function somarDias(iso: string, dias: number): string {
  const d = new Date(`${iso.slice(0, 10)}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + dias);
  return d.toISOString().slice(0, 10);
}

const diaLongo = new Intl.DateTimeFormat('pt-BR', { weekday: 'long', day: '2-digit', month: '2-digit', year: 'numeric', timeZone: 'UTC' });
const diaSemana = new Intl.DateTimeFormat('pt-BR', { weekday: 'short', timeZone: 'UTC' });

/** "2026-10-31" → "sábado, 31/10/2026". */
export function formatarDataLonga(iso: string | null | undefined): string {
  if (!iso) return '—';
  return diaLongo.format(new Date(`${iso.slice(0, 10)}T00:00:00Z`));
}

/** "2026-10-31" → "sáb." */
export function diaDaSemana(iso: string): string {
  return diaSemana.format(new Date(`${iso.slice(0, 10)}T00:00:00Z`));
}

/** Data ISO (AAAA-MM-DD) válida no calendário. */
export function dataIsoValida(texto: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(texto)) return false;
  const d = new Date(`${texto}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === texto;
}
