import type { EmprestimoFerramenta, ItemEstoque, MovimentoEstoque, SaldoEstoque, VinculoFornecedor } from './dominio';
import { dataDoInstante, diasEntre } from './formato';
import { normalizarTexto } from './importacao/valores';
import type { LinhaNfe } from './integracoes/nfe';

// Regras do almoxarifado que a tela usa. Saldo e custo médio são do banco
// (regra 3); aqui só se soma e se compara o que o banco já calculou.

const UNIDADES: Record<string, string> = {
  un: 'un', und: 'un', unid: 'un', unidade: 'un', u: 'un', pc: 'pç', pç: 'pç', pca: 'pç', peca: 'pç', pcs: 'pç',
  sc: 'sc', saco: 'sc', sac: 'sc', kg: 'kg', kgs: 'kg', quilo: 'kg', t: 't', ton: 't', tonelada: 't',
  m: 'm', mt: 'm', mts: 'm', metro: 'm', ml: 'm', m2: 'm²', 'm²': 'm²', mq: 'm²', m3: 'm³', 'm³': 'm³', mc: 'm³',
  l: 'L', lt: 'L', lts: 'L', litro: 'L', cx: 'cx', caixa: 'cx', rl: 'rl', rolo: 'rl', br: 'br', barra: 'br',
  gl: 'gl', galao: 'gl', lata: 'lata', mil: 'milheiro', milheiro: 'milheiro', ml1000: 'milheiro',
  pct: 'pct', pacote: 'pct', pt: 'pct', jg: 'jg', jogo: 'jg', cj: 'jg', conj: 'jg',
};

/** Unidade da nota ("M3", "UND", "Pc") na grafia do catálogo ("m³", "un", "pç"). */
export function normalizarUnidade(unidade: string): string {
  const u = unidade
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[\s.]+/g, '');
  return UNIDADES[u] ?? unidade.trim();
}

/** Quantidade no padrão brasileiro, sem casas sobrando: 2,5 · 1.000 · 0,125. */
export function formatarQuantidade(n: number | null | undefined, unidade?: string): string {
  if (n === null || n === undefined || !Number.isFinite(n)) return '—';
  const texto = n.toLocaleString('pt-BR', { maximumFractionDigits: 4 });
  return unidade ? `${texto} ${unidade}` : texto;
}

// ---------------------------------------------------------------- NF-e → catálogo

export interface SugestaoNfe {
  item_id: string | null;
  /** Por que o item foi sugerido: vínculo da última nota, mesmo nome, ou nenhum. */
  origem: 'vinculo' | 'nome' | null;
}

/**
 * Para cada linha da nota, o item do catálogo mais provável: primeiro o vínculo
 * gravado na última nota do mesmo fornecedor (CNPJ + código do produto), depois o
 * mesmo nome. Item inativo ou ferramenta não é sugerido.
 */
export function sugerirItensNfe(
  linhas: LinhaNfe[],
  catalogo: ItemEstoque[],
  vinculos: VinculoFornecedor[],
  cnpjFornecedor: string | null,
): SugestaoNfe[] {
  const materiais = new Map(catalogo.filter((i) => i.tipo === 'material' && i.ativo).map((i) => [i.id, i]));
  const porNome = new Map<string, string>();
  for (const i of materiais.values()) porNome.set(normalizarTexto(i.nome), i.id);
  const porCodigo = new Map(
    vinculos.filter((v) => v.cnpj_fornecedor === cnpjFornecedor).map((v) => [v.codigo_fornecedor, v.item_id]),
  );

  return linhas.map((l) => {
    const vinculado = porCodigo.get(l.codigo);
    if (vinculado && materiais.has(vinculado)) return { item_id: vinculado, origem: 'vinculo' };
    const mesmoNome = porNome.get(normalizarTexto(l.descricao));
    if (mesmoNome) return { item_id: mesmoNome, origem: 'nome' };
    return { item_id: null, origem: null };
  });
}

/**
 * Linha da nota convertida para a unidade do catálogo. `fator` = quantas unidades do
 * catálogo cabem em uma unidade da nota (nota em "CX" com 12 un → fator 12).
 * O custo total da linha não muda; só se redistribui pela nova quantidade.
 */
export function converterLinhaNfe(linha: LinhaNfe, fator: number): { quantidade: number; valor_unitario: number } {
  const f = Number.isFinite(fator) && fator > 0 ? fator : 1;
  const quantidade = Math.round(linha.quantidade * f * 10000) / 10000;
  return { quantidade, valor_unitario: quantidade > 0 ? Math.round((linha.custoTotal / quantidade) * 10000) / 10000 : 0 };
}

// ---------------------------------------------------------------- saldo e gasto

export interface ItemComSaldo extends ItemEstoque {
  quantidade: number;
  custo_medio: number;
  valor: number;
  abaixoDoMinimo: boolean;
}

/** Catálogo com o saldo da obra; item sem saldo conta como zero. */
export function itensComSaldo(itens: ItemEstoque[], saldos: SaldoEstoque[]): ItemComSaldo[] {
  const porItem = new Map(saldos.map((s) => [s.item_id, s]));
  return itens.map((i) => {
    const s = porItem.get(i.id);
    const quantidade = s?.quantidade ?? 0;
    const custo_medio = s?.custo_medio ?? 0;
    return {
      ...i,
      quantidade,
      custo_medio,
      valor: Math.round(quantidade * custo_medio * 100) / 100,
      abaixoDoMinimo: i.tipo === 'material' && i.ativo && i.estoque_minimo > 0 && quantidade < i.estoque_minimo,
    };
  });
}

export interface ResumoMaterial {
  /** Soma das entradas (o que foi comprado para a obra). */
  comprado: number;
  /** Soma das saídas (o que foi aplicado nas tarefas, pelo custo médio). */
  aplicado: number;
  /** Ajustes negativos de inventário (perda, quebra, furto). */
  perdas: number;
  /** Ajustes positivos (sobra encontrada na contagem). */
  sobras: number;
  /** Aplicado por tarefa. */
  porTarefa: Map<string, number>;
}

const cent = (n: number) => Math.round(n * 100) / 100;

export function resumoMaterial(movimentos: Pick<MovimentoEstoque, 'tipo' | 'quantidade' | 'valor_total' | 'tarefa_id'>[]): ResumoMaterial {
  const r: ResumoMaterial = { comprado: 0, aplicado: 0, perdas: 0, sobras: 0, porTarefa: new Map() };
  for (const m of movimentos) {
    if (m.tipo === 'entrada') r.comprado += m.valor_total;
    else if (m.tipo === 'saida') {
      r.aplicado += m.valor_total;
      if (m.tarefa_id) r.porTarefa.set(m.tarefa_id, cent((r.porTarefa.get(m.tarefa_id) ?? 0) + m.valor_total));
    } else if (m.quantidade < 0) r.perdas += m.valor_total;
    else r.sobras += m.valor_total;
  }
  r.comprado = cent(r.comprado);
  r.aplicado = cent(r.aplicado);
  r.perdas = cent(r.perdas);
  r.sobras = cent(r.sobras);
  return r;
}

// ---------------------------------------------------------------- ferramentas e QR

/** O QR da etiqueta é um link: a câmera do celular já abre a ferramenta no app. */
export function linkQrFerramenta(origem: string, itemId: string): string {
  return `${origem.replace(/\/+$/, '')}/f/${itemId}`;
}

const UUID = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;

/** O que o leitor leu: o link da etiqueta (id) ou um código digitado (FER-0001). */
export function lerCodigoFerramenta(texto: string): { itemId: string } | { codigo: string } | null {
  const t = texto.trim();
  if (t === '') return null;
  const link = t.match(new RegExp(`/f/(${UUID.source})`, 'i'));
  if (link) return { itemId: link[1]!.toLowerCase() };
  if (new RegExp(`^${UUID.source}$`, 'i').test(t)) return { itemId: t.toLowerCase() };
  return { codigo: t.toUpperCase().replace(/\s+/g, '') };
}

export interface SituacaoEmprestimo {
  diasFora: number;
  atrasado: boolean;
}

/** Dias fora (pela data de Brasília) e se passou da data combinada. */
export function situacaoEmprestimo(e: Pick<EmprestimoFerramenta, 'retirada_em' | 'devolver_ate'>, hoje: string): SituacaoEmprestimo {
  const retirada = dataDoInstante(e.retirada_em);
  return { diasFora: Math.max(0, diasEntre(retirada, hoje)), atrasado: e.devolver_ate !== null && e.devolver_ate < hoje };
}

const MINUSCULAS = new Set(['de', 'da', 'do', 'das', 'dos', 'e', 'com', 'para', 'em', 'p/', 'c/', 's/']);

/**
 * Nome do produto da nota (quase sempre em CAIXA ALTA) num formato legível para o
 * catálogo: "TUBO PVC SOLDAVEL 25MM BARRA 6M" → "Tubo PVC soldavel 25MM barra 6M".
 * Siglas curtas e medidas ficam como vieram.
 */
export function nomeDoProdutoNfe(descricao: string): string {
  const texto = descricao.replace(/\s+/g, ' ').trim();
  if (texto !== texto.toUpperCase()) return texto; // já veio com caixa mista
  return texto
    .split(' ')
    .map((p, i) => {
      const min = p.toLowerCase();
      if (MINUSCULAS.has(min)) return i === 0 ? min[0]!.toUpperCase() + min.slice(1) : min;
      if (/\d/.test(p) || (p.length <= 3 && /^\p{L}+$/u.test(p))) return p;
      return i === 0 ? min[0]!.toUpperCase() + min.slice(1) : min;
    })
    .join(' ');
}
