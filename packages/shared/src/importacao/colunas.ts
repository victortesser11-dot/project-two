import { lerData, lerNumero, normalizarTexto, textoCelula, type SeparadorDecimal } from './valores';
import type { LinhaOrigem, Problema } from './tipos';

export type Campo =
  | 'codigo'
  | 'nivel'
  | 'nome'
  | 'unidade'
  | 'quantidade'
  | 'precoUnitario'
  | 'total'
  | 'inicio'
  | 'fim';

/** Índice da coluna (0 = A) para cada campo reconhecido. */
export type Mapeamento = Partial<Record<Campo, number>>;

export const CAMPOS: { campo: Campo; rotulo: string; dica: string }[] = [
  { campo: 'codigo', rotulo: 'Código do item', dica: 'Ex.: 1, 1.1, 1.1.2. Define as etapas e o que fica dentro de cada uma.' },
  { campo: 'nivel', rotulo: 'Nível', dica: 'Use se a planilha tem uma coluna de nível (1, 2, 3) em vez de código.' },
  { campo: 'nome', rotulo: 'Descrição', dica: 'Nome da etapa ou do serviço. Obrigatório.' },
  { campo: 'unidade', rotulo: 'Unidade', dica: 'm, m², m³, kg, un, vb…' },
  { campo: 'quantidade', rotulo: 'Quantidade', dica: '' },
  { campo: 'precoUnitario', rotulo: 'Preço unitário', dica: 'Usado com a quantidade quando não há total.' },
  { campo: 'total', rotulo: 'Total (custo previsto)', dica: '' },
  { campo: 'inicio', rotulo: 'Início', dica: '' },
  { campo: 'fim', rotulo: 'Término', dica: '' },
];

// Sinônimos já normalizados (sem acento, minúsculos). Ordem = prioridade.
const SINONIMOS: Record<Campo, string[]> = {
  codigo: ['item', 'codigo', 'cod', 'edt', 'eap', 'wbs', 'numero da estrutura de topicos', 'estrutura de topicos', 'outline number', 'n', 'no', 'numero', 'ref'],
  nivel: ['nivel', 'nivel da estrutura de topicos', 'nivel de estrutura de topicos', 'outline level'],
  nome: ['descricao', 'descricao do servico', 'descricao dos servicos', 'discriminacao', 'discriminacao dos servicos', 'especificacao', 'servico', 'servicos', 'nome da tarefa', 'nome', 'tarefa', 'atividade', 'etapa', 'task name', 'name'],
  unidade: ['unidade', 'unid', 'und', 'un', 'unit'],
  quantidade: ['quantidade', 'quant', 'qtd', 'qtde', 'qde', 'quantity'],
  // Versões "com BDI" primeiro: são o preço de venda que entra no orçamento.
  precoUnitario: ['preco unitario com bdi', 'preco unit com bdi', 'valor unitario com bdi', 'preco unitario', 'preco unit', 'valor unitario', 'valor unit', 'custo unitario', 'p unit', 'vl unit', 'unitario', 'pu', 'unit price'],
  total: ['total com bdi', 'preco total com bdi', 'valor total com bdi', 'total', 'preco total', 'valor total', 'custo total', 'custo', 'valor', 'subtotal', 'cost'],
  inicio: ['inicio', 'data de inicio', 'data inicio', 'inicio previsto', 'comeco', 'start'],
  fim: ['termino', 'fim', 'data de termino', 'data termino', 'data fim', 'termino previsto', 'fim previsto', 'conclusao', 'finish'],
};

/**
 * Nota para "este cabeçalho é deste campo": 3 para igual a um sinônimo, 2 para
 * contê-lo como palavra inteira, mais um pequeno bônus pela prioridade do sinônimo.
 */
function nota(cabecalho: string, campo: Campo): number {
  const h = normalizarTexto(cabecalho);
  if (h === '') return 0;
  let melhor = 0;
  const lista = SINONIMOS[campo];
  for (const [i, s] of lista.entries()) {
    const bonus = (lista.length - i) / 100;
    if (h === s) melhor = Math.max(melhor, 3 + bonus);
    else if (s.length >= 3 && (h.startsWith(`${s} `) || h.endsWith(` ${s}`) || h.includes(` ${s} `))) {
      melhor = Math.max(melhor, 2 + bonus);
    }
  }
  return melhor;
}

function mapearCabecalho(cabecalho: unknown[]): { mapeamento: Mapeamento; acertos: number } {
  const textos = cabecalho.map((c) => textoCelula(c));
  const candidatos: { campo: Campo; coluna: number; nota: number }[] = [];
  for (const { campo } of CAMPOS) {
    textos.forEach((t, coluna) => {
      const n = nota(t, campo);
      if (n >= 2) candidatos.push({ campo, coluna, nota: n });
    });
  }
  // Maior nota primeiro; em empate, valores monetários preferem a coluna mais à
  // direita (costuma ser a "com BDI"); o resto prefere a mais à esquerda.
  candidatos.sort((a, b) => {
    if (b.nota !== a.nota) return b.nota - a.nota;
    const direita = a.campo === 'total' || a.campo === 'precoUnitario';
    return direita ? b.coluna - a.coluna : a.coluna - b.coluna;
  });

  const mapeamento: Mapeamento = {};
  const usadas = new Set<number>();
  for (const c of candidatos) {
    if (mapeamento[c.campo] !== undefined || usadas.has(c.coluna)) continue;
    mapeamento[c.campo] = c.coluna;
    usadas.add(c.coluna);
  }
  return { mapeamento, acertos: Object.keys(mapeamento).length };
}

/**
 * Procura a linha de cabeçalho nas primeiras linhas (planilhas costumam ter
 * título, obra e data antes da tabela) e sugere o mapeamento das colunas.
 */
export function detectarColunas(linhas: unknown[][], maxBusca = 30): { linhaCabecalho: number | null; mapeamento: Mapeamento } {
  let melhor: { linha: number; mapeamento: Mapeamento; acertos: number } | null = null;
  for (let i = 0; i < Math.min(linhas.length, maxBusca); i++) {
    const r = mapearCabecalho(linhas[i] ?? []);
    if (r.mapeamento.nome === undefined || r.acertos < 2) continue;
    if (!melhor || r.acertos > melhor.acertos) melhor = { linha: i, ...r };
  }
  return melhor ? { linhaCabecalho: melhor.linha, mapeamento: melhor.mapeamento } : { linhaCabecalho: null, mapeamento: {} };
}

/** Letra da coluna como no Excel: 0 → A, 26 → AA. */
export function letraColuna(indice: number): string {
  let n = indice + 1;
  let s = '';
  while (n > 0) {
    const r = (n - 1) % 26;
    s = String.fromCharCode(65 + r) + s;
    n = Math.floor((n - 1) / 26);
  }
  return s;
}

const LINHA_DE_TOTAL = /^(total|total geral|subtotal|sub total|valor total|total da obra|total do orcamento|bdi|total com bdi|total sem bdi)\b/;

/**
 * Converte as linhas da planilha (a partir da linha seguinte ao cabeçalho) em
 * linhas de EAP, avisando o que foi ignorado ou corrigido.
 */
export function converterLinhas(
  linhas: unknown[][],
  linhaCabecalho: number | null,
  mapeamento: Mapeamento,
  decimal: SeparadorDecimal = 'auto',
): { linhas: LinhaOrigem[]; problemas: Problema[] } {
  const saida: LinhaOrigem[] = [];
  const problemas: Problema[] = [];
  const inicio = linhaCabecalho === null ? 0 : linhaCabecalho + 1;

  const celula = (linha: unknown[], campo: Campo): unknown => {
    const col = mapeamento[campo];
    return col === undefined ? undefined : linha[col];
  };

  for (let i = inicio; i < linhas.length; i++) {
    const linha = linhas[i] ?? [];
    const numeroLinha = i + 1; // como o usuário vê na planilha
    if (linha.every((c) => textoCelula(c) === '')) continue;

    const nome = textoCelula(celula(linha, 'nome'));
    const codigoBruto = celula(linha, 'codigo');
    const codigo = textoCelula(codigoBruto);

    if (nome === '') {
      const temDados = Object.keys(mapeamento).some((campo) => textoCelula(celula(linha, campo as Campo)) !== '');
      if (temDados) problemas.push({ linha: numeroLinha, gravidade: 'aviso', mensagem: 'Linha sem descrição; ignorada.' });
      continue;
    }
    if (codigo === '' && LINHA_DE_TOTAL.test(normalizarTexto(nome))) {
      problemas.push({ linha: numeroLinha, gravidade: 'aviso', mensagem: `Linha de total ("${nome}") ignorada; os totais são recalculados.` });
      continue;
    }

    const numero = (campo: 'quantidade' | 'precoUnitario' | 'total' | 'nivel'): number | null => {
      const bruto = celula(linha, campo);
      const n = lerNumero(bruto, decimal);
      if (n !== null && Number.isNaN(n)) {
        problemas.push({ linha: numeroLinha, gravidade: 'aviso', mensagem: `"${textoCelula(bruto)}" não é um número válido; campo ignorado.` });
        return null;
      }
      return n;
    };
    const data = (campo: 'inicio' | 'fim'): string | null => {
      const bruto = celula(linha, campo);
      const d = lerData(bruto);
      if (d === 'invalida') {
        problemas.push({ linha: numeroLinha, gravidade: 'aviso', mensagem: `"${textoCelula(bruto)}" não é uma data válida; campo ignorado.` });
        return null;
      }
      return d;
    };

    const nivel = numero('nivel');
    saida.push({
      linha: numeroLinha,
      codigo: codigo === '' ? null : codigo,
      codigoEraNumero: typeof codigoBruto === 'number',
      nivel: nivel === null ? null : Math.round(nivel),
      nome,
      unidade: textoCelula(celula(linha, 'unidade')) || null,
      quantidade: numero('quantidade'),
      precoUnitario: numero('precoUnitario'),
      total: numero('total'),
      inicio: data('inicio'),
      fim: data('fim'),
    });
  }

  return { linhas: saida, problemas };
}
