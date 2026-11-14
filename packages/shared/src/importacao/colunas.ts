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
  | 'fim'
  | 'grupo'
  | 'detalhe'
  | 'percentual';

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
  {
    campo: 'grupo',
    rotulo: 'Lote ou local',
    dica: 'Torre, pavimento, bloco ou setor de cada linha. Sem código nem nível, vira as etapas: as tarefas ficam dentro do lote delas.',
  },
  { campo: 'detalhe', rotulo: 'Serviço (complemento)', dica: 'Segunda coluna de nome: entra depois da descrição ("Azulejo: Rejunte").' },
  { campo: 'percentual', rotulo: 'Avanço realizado (%)', dica: 'Para obra em andamento: o que já foi feito de cada tarefa, de 0 a 100.' },
];

// Sinônimos já normalizados (sem acento, minúsculos). Ordem = prioridade.
const SINONIMOS: Record<Campo, string[]> = {
  codigo: ['item', 'codigo', 'cod', 'edt', 'eap', 'wbs', 'numero da estrutura de topicos', 'estrutura de topicos', 'outline number', 'n', 'no', 'numero', 'ref', 'id', 'id da atividade', 'id da tarefa'],
  nivel: ['nivel', 'nivel da estrutura de topicos', 'nivel de estrutura de topicos', 'outline level'],
  nome: ['pacote de trabalho tarefas', 'pacote de trabalho', 'pacote', 'descricao', 'descricao do servico', 'descricao dos servicos', 'discriminacao', 'discriminacao dos servicos', 'especificacao', 'servico', 'servicos', 'nome da tarefa', 'nome', 'tarefa', 'atividade', 'etapa', 'task name', 'name'],
  unidade: ['unidade', 'unid', 'und', 'un', 'unit'],
  quantidade: ['quantidade', 'quant', 'qtd', 'qtde', 'qde', 'quantity'],
  // Versões "com BDI" primeiro: são o preço de venda que entra no orçamento.
  precoUnitario: ['preco unitario com bdi', 'preco unit com bdi', 'valor unitario com bdi', 'preco unitario', 'preco unit', 'valor unitario', 'valor unit', 'custo unitario', 'p unit', 'vl unit', 'unitario', 'pu', 'unit price'],
  total: ['total com bdi', 'preco total com bdi', 'valor total com bdi', 'total', 'preco total', 'valor total', 'custo total', 'custo', 'valor', 'subtotal', 'cost'],
  inicio: ['inicio', 'data de inicio', 'data inicio', 'inicio previsto', 'comeco', 'start'],
  fim: ['termino', 'fim', 'data de termino', 'data termino', 'data fim', 'termino previsto', 'fim previsto', 'conclusao', 'finish'],
  grupo: ['lote', 'local', 'locais', 'pavimento', 'torre', 'bloco', 'setor', 'frente de servico', 'frente', 'location'],
  // Só pega a coluna "Serviço" quando outra coluna já é a descrição (o bônus de prioridade de `nome` é maior).
  detalhe: ['servico', 'servicos', 'subtarefa', 'complemento'],
  percentual: ['realizado', 'avanco realizado', 'percentual realizado', 'realizado %', '% realizado', 'avanco fisico realizado', 'concluido', '% concluido', 'percentual concluido', 'percent complete', '% complete', 'avanco fisico', 'avanco'],
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
): { linhas: LinhaOrigem[]; problemas: Problema[]; porLote: boolean } {
  const saida: LinhaOrigem[] = [];
  const grupos: (string | null)[] = [];
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
    const detalhe = textoCelula(celula(linha, 'detalhe'));
    const grupo = textoCelula(celula(linha, 'grupo')).replace(/\s+/g, ' ');
    if (mapeamento.grupo !== undefined) grupos.push(SEM_VALOR.test(grupo) ? null : grupo);
    const pct = mapeamento.percentual === undefined ? null : lerNumero(celula(linha, 'percentual'), decimal);
    saida.push({
      linha: numeroLinha,
      codigo: codigo === '' ? null : codigo,
      codigoEraNumero: typeof codigoBruto === 'number',
      nivel: nivel === null ? null : Math.round(nivel),
      nome: SEM_VALOR.test(detalhe) ? nome : `${nome}: ${detalhe}`,
      unidade: textoCelula(celula(linha, 'unidade')) || null,
      quantidade: numero('quantidade'),
      precoUnitario: numero('precoUnitario'),
      total: numero('total'),
      inicio: data('inicio'),
      fim: data('fim'),
      percentual: pct === null || Number.isNaN(pct) ? null : pct,
    });
  }

  ajustarPercentuais(saida, problemas);
  if (mapeamento.grupo !== undefined) {
    const agrupadas = agruparPorLote(saida, grupos, mapeamento.nivel !== undefined, problemas);
    return { linhas: agrupadas, problemas, porLote: agrupadas !== saida };
  }
  return { linhas: saida, problemas, porLote: false };
}

/** Célula vazia ou só com traço ("-", "—"): sem valor. */
const SEM_VALOR = /^[-–—]*$/;

/**
 * Avanço de 0 a 100. Coluna formatada como porcentagem no Excel chega como fração (0,85): se nenhum valor
 * passa de 1, tudo é multiplicado por 100. Fora da faixa, a coluna não é de avanço: ignora e avisa.
 */
function ajustarPercentuais(linhas: LinhaOrigem[], problemas: Problema[]) {
  const valores = linhas.map((l) => l.percentual).filter((p): p is number => p !== null && p !== undefined);
  if (valores.length === 0) return;
  if (valores.some((p) => p < 0 || p > 100)) {
    for (const l of linhas) l.percentual = null;
    problemas.push({
      linha: null,
      gravidade: 'aviso',
      mensagem: 'A coluna de avanço realizado tem valores fora de 0 a 100; o avanço não foi trazido. Confira a coluna escolhida.',
    });
    return;
  }
  const maior = Math.max(...valores);
  if (maior > 0 && maior <= 1) {
    for (const l of linhas) if (l.percentual !== null && l.percentual !== undefined) l.percentual = l.percentual * 100;
    problemas.push({ linha: null, gravidade: 'aviso', mensagem: 'O avanço veio como fração (0 a 1) e foi lido como porcentagem (1 = 100%).' });
  }
}

/** "Torre A 2º Pavimento" → "torre a": as duas primeiras palavras, para juntar os lotes de uma mesma torre ou bloco. */
function prefixoDoLote(lote: string): { chave: string; rotulo: string } | null {
  const palavras = lote.split(' ');
  if (palavras.length < 3) return null;
  const rotulo = palavras.slice(0, 2).join(' ');
  return { chave: normalizarTexto(rotulo), rotulo };
}

/**
 * Planilha "por lote" (linha de balanço: a mesma tarefa repetida em cada torre e pavimento, com uma coluna
 * dizendo onde). Sem código nem nível, o lote vira a etapa e as tarefas entram dentro dele, na ordem do
 * arquivo. Lotes que começam igual ("Torre A Térreo", "Torre A 2º Pavimento") ficam dentro de uma etapa
 * maior ("Torre A"). Devolve as linhas já com o nível preenchido, para `montarEap`.
 */
function agruparPorLote(linhas: LinhaOrigem[], grupos: (string | null)[], temNivel: boolean, problemas: Problema[]): LinhaOrigem[] {
  const temCodigoEmArvore = linhas.some((l) => l.codigo !== null && /^\d+(\.\d+)+\.?$/.test(l.codigo));
  if (temNivel || temCodigoEmArvore) {
    problemas.push({
      linha: null,
      gravidade: 'aviso',
      mensagem: 'A coluna de lote foi ignorada: a planilha já tem código ou nível para montar as etapas.',
    });
    return linhas;
  }
  if (grupos.every((g) => g === null)) return linhas;

  // Lotes na ordem em que aparecem; maiúsculas e acentos diferentes contam como o mesmo lote.
  const lotes = new Map<string, { nome: string; linhas: LinhaOrigem[] }>();
  const soltas: LinhaOrigem[] = [];
  linhas.forEach((l, i) => {
    const g = grupos[i];
    if (!g) return void soltas.push(l);
    const chave = normalizarTexto(g);
    const lote = lotes.get(chave) ?? { nome: g, linhas: [] };
    lote.linhas.push(l);
    lotes.set(chave, lote);
  });

  // Etapa maior: prefixo de duas palavras que aparece em dois lotes ou mais.
  const contagem = new Map<string, number>();
  for (const lote of lotes.values()) {
    const p = prefixoDoLote(lote.nome);
    if (p) contagem.set(p.chave, (contagem.get(p.chave) ?? 0) + 1);
  }
  const maiores = new Map<string, { nome: string; lotes: { nome: string; linhas: LinhaOrigem[] }[] }>();
  const ordem: ({ maior: string } | { lote: { nome: string; linhas: LinhaOrigem[] } })[] = [];
  for (const lote of lotes.values()) {
    const p = prefixoDoLote(lote.nome);
    if (p && (contagem.get(p.chave) ?? 0) >= 2) {
      if (!maiores.has(p.chave)) {
        maiores.set(p.chave, { nome: p.rotulo, lotes: [] });
        ordem.push({ maior: p.chave });
      }
      maiores.get(p.chave)!.lotes.push(lote);
    } else ordem.push({ lote });
  }

  const etapa = (nome: string, nivel: number, linha: number): LinhaOrigem => ({
    linha, codigo: null, nivel, nome, unidade: null, quantidade: null, precoUnitario: null, total: null, inicio: null, fim: null,
  });
  const saida: LinhaOrigem[] = [];
  const emitir = (lote: { nome: string; linhas: LinhaOrigem[] }, nivel: number) => {
    saida.push(etapa(lote.nome, nivel, lote.linhas[0]!.linha));
    for (const l of lote.linhas) saida.push({ ...l, nivel: nivel + 1 });
  };
  for (const o of ordem) {
    if ('lote' in o) emitir(o.lote, 1);
    else {
      const m = maiores.get(o.maior)!;
      saida.push(etapa(m.nome, 1, m.lotes[0]!.linhas[0]!.linha));
      for (const lote of m.lotes) emitir(lote, 2);
    }
  }
  for (const l of soltas) saida.push({ ...l, nivel: 1 });

  problemas.push({
    linha: null,
    gravidade: 'aviso',
    mensagem:
      `Etapas montadas pela coluna de lote: ${lotes.size} ${lotes.size === 1 ? 'lote' : 'lotes'}` +
      (maiores.size > 0 ? `, reunidos em ${ordem.length} etapas (${[...maiores.values()].map((m) => m.nome).join(', ')}${ordem.length > maiores.size ? ' e os demais' : ''}).` : '.') +
      (soltas.length > 0 ? ` ${soltas.length} ${soltas.length === 1 ? 'linha sem lote ficou' : 'linhas sem lote ficaram'} no primeiro nível.` : ''),
  });
  return saida;
}
