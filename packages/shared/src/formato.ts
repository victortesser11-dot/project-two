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
