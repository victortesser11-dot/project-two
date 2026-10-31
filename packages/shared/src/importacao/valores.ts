// Leitura tolerante de números, datas e textos vindos de planilhas brasileiras.

export type SeparadorDecimal = ',' | '.' | 'auto';

const VAZIOS = new Set(['', '-', '—', '–', 'n/a', 'na', 'nd', '#n/d', '#n/a']);

/** Texto limpo de uma célula qualquer (número vira texto sem notação científica). */
export function textoCelula(valor: unknown): string {
  if (valor === null || valor === undefined) return '';
  if (typeof valor === 'string') return valor.replace(/ /g, ' ').trim();
  if (typeof valor === 'number') return Number.isFinite(valor) ? String(valor) : '';
  if (typeof valor === 'boolean') return valor ? 'sim' : 'não';
  if (valor instanceof Date) return Number.isNaN(valor.getTime()) ? '' : valor.toISOString().slice(0, 10);
  return String(valor).trim();
}

/**
 * Número de uma célula. Devolve null para vazio e NaN para algo que não é número.
 * Aceita "R$ 1.234,56", "1234.56", "(1.234,56)" (negativo) e "12,5%".
 *
 * `decimal` diz qual é o separador decimal do arquivo; em "auto" o formato é
 * deduzido do próprio texto (o último separador que aparece é o decimal).
 */
export function lerNumero(valor: unknown, decimal: SeparadorDecimal = 'auto'): number | null {
  if (valor === null || valor === undefined) return null;
  if (typeof valor === 'number') return Number.isFinite(valor) ? valor : Number.NaN;
  if (typeof valor === 'boolean' || valor instanceof Date) return Number.NaN;

  let texto = String(valor).replace(/ /g, ' ').trim();
  if (VAZIOS.has(texto.toLowerCase())) return null;

  let negativo = false;
  if (/^\(.*\)$/.test(texto)) {
    negativo = true;
    texto = texto.slice(1, -1);
  }
  texto = texto.replace(/R\$|%|\s/gi, '');
  if (texto.startsWith('-')) {
    negativo = !negativo;
    texto = texto.slice(1);
  }
  if (texto === '') return null;
  if (!/^[\d.,]+$/.test(texto)) return Number.NaN;

  const virgulas = (texto.match(/,/g) ?? []).length;
  const pontos = (texto.match(/\./g) ?? []).length;

  let sep: ',' | '.' | null;
  if (virgulas > 0 && pontos > 0) {
    sep = texto.lastIndexOf(',') > texto.lastIndexOf('.') ? ',' : '.';
  } else if (virgulas > 0) {
    // "1,234,567" só tem vírgulas de milhar; "12,5" tem vírgula decimal
    sep = virgulas > 1 || (decimal === '.' && /^\d{1,3}(,\d{3})+$/.test(texto)) ? null : ',';
  } else if (pontos > 0) {
    // "1.234.567" é milhar; "1.234" em arquivo de vírgula decimal também é milhar
    sep = pontos > 1 || (decimal === ',' && /^\d{1,3}(\.\d{3})+$/.test(texto)) ? null : '.';
  } else {
    sep = null;
  }

  let normalizado: string;
  if (sep === ',') normalizado = texto.replace(/\./g, '').replace(',', '.');
  else if (sep === '.') normalizado = texto.replace(/,/g, '');
  else normalizado = texto.replace(/[.,]/g, '');

  if (!/^\d+(\.\d+)?$/.test(normalizado)) return Number.NaN;
  const n = Number(normalizado);
  return negativo ? -n : n;
}

function dataValida(ano: number, mes: number, dia: number): string | null {
  if (ano < 1900 || ano > 2200 || mes < 1 || mes > 12 || dia < 1 || dia > 31) return null;
  const d = new Date(Date.UTC(ano, mes - 1, dia));
  if (d.getUTCFullYear() !== ano || d.getUTCMonth() !== mes - 1 || d.getUTCDate() !== dia) return null;
  return `${ano}-${String(mes).padStart(2, '0')}-${String(dia).padStart(2, '0')}`;
}

/** Número de série do Excel (dias desde 30/12/1899) para AAAA-MM-DD. */
export function dataDoExcel(serie: number): string | null {
  if (!Number.isFinite(serie) || serie < 1 || serie > 150000) return null;
  const ms = Date.UTC(1899, 11, 30) + Math.floor(serie) * 86_400_000;
  return new Date(ms).toISOString().slice(0, 10);
}

/**
 * Data de uma célula em AAAA-MM-DD. Devolve null para vazio e 'invalida' para
 * algo que parece data mas não é.
 * Aceita Date, série do Excel, "03/11/2026", "03/11/26", "seg 03/11/26",
 * "03-11-2026 08:00" e "2026-11-03T08:00:00".
 */
export function lerData(valor: unknown): string | null | 'invalida' {
  if (valor === null || valor === undefined) return null;
  if (valor instanceof Date) {
    if (Number.isNaN(valor.getTime())) return 'invalida';
    return dataValida(valor.getUTCFullYear(), valor.getUTCMonth() + 1, valor.getUTCDate()) ?? 'invalida';
  }
  if (typeof valor === 'number') return dataDoExcel(valor) ?? 'invalida';

  const texto = String(valor).replace(/ /g, ' ').trim();
  if (VAZIOS.has(texto.toLowerCase())) return null;

  const iso = texto.match(/^(\d{4})-(\d{2})-(\d{2})(?:[T\s].*)?$/);
  if (iso) return dataValida(Number(iso[1]), Number(iso[2]), Number(iso[3])) ?? 'invalida';

  const br = texto.match(/(?:^|[^\d])(\d{1,2})[/.-](\d{1,2})[/.-](\d{2}|\d{4})(?!\d)/);
  if (br) {
    let ano = Number(br[3]);
    if (br[3]!.length === 2) ano += ano < 70 ? 2000 : 1900;
    return dataValida(ano, Number(br[2]), Number(br[1])) ?? 'invalida';
  }

  // Série do Excel que chegou como texto (CSV exportado sem formatação)
  if (/^\d{5}$/.test(texto)) return dataDoExcel(Number(texto)) ?? 'invalida';

  return 'invalida';
}

/** Minúsculas, sem acento e sem pontuação: base para comparar cabeçalhos. */
export function normalizarTexto(texto: string): string {
  return texto
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[º°ª]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}
