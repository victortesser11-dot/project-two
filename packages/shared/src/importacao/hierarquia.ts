import {
  LIMITE_ITENS_IMPORTACAO,
  LIMITE_NIVEIS_EAP,
  type ItemImportado,
  type LinhaOrigem,
  type Problema,
  type ResultadoImportacao,
  type ResumoImportacao,
} from './tipos';

const CODIGO_HIERARQUICO = /^\d+(\.\d+)*\.?$/;

/** "01.02." → ["1", "2"] */
function segmentos(codigo: string): string[] {
  return codigo
    .split('.')
    .filter((s) => s !== '')
    .map((s) => String(Number(s)));
}

function arredondar(n: number, casas = 2): number {
  const f = 10 ** casas;
  return Math.round(n * f) / f;
}

const reais = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });

interface Temp {
  chave: string;
  paiChave: string | null;
  nivel: number;
  origem: LinhaOrigem;
}

const RESUMO_VAZIO: ResumoImportacao = { etapas: 0, tarefas: 0, niveis: 0, custoTotal: null, inicio: null, fim: null };

/**
 * Monta a EAP a partir das linhas lidas. A hierarquia vem, nesta ordem, da
 * coluna de nível, do código do item (1.2.3) ou, sem nenhum dos dois, fica
 * tudo no mesmo nível. Itens com algo dentro viram etapas; o resto, tarefas.
 */
export function montarEap(linhas: LinhaOrigem[], problemasAnteriores: Problema[] = []): ResultadoImportacao {
  const problemas: Problema[] = [...problemasAnteriores];
  const aviso = (linha: number | null, mensagem: string) => problemas.push({ linha, gravidade: 'aviso', mensagem });
  const erro = (linha: number | null, mensagem: string) => problemas.push({ linha, gravidade: 'erro', mensagem });

  if (linhas.length === 0) {
    erro(null, 'Nenhuma linha com descrição foi encontrada. Confira se a coluna "Descrição" está certa.');
    return { itens: [], problemas, resumo: RESUMO_VAZIO, criterio: 'plano' };
  }
  if (linhas.length > LIMITE_ITENS_IMPORTACAO) {
    erro(null, `O arquivo tem ${linhas.length} itens; o limite por importação é ${LIMITE_ITENS_IMPORTACAO}.`);
  }

  // 1) Critério de hierarquia
  const comNivel = linhas.filter((l) => l.nivel !== null && l.nivel >= 1).length;
  const comCodigo = linhas.filter((l) => l.codigo !== null && CODIGO_HIERARQUICO.test(l.codigo)).length;
  const criterio: ResultadoImportacao['criterio'] =
    comNivel >= linhas.length * 0.6 ? 'nivel' : comCodigo >= linhas.length * 0.6 ? 'codigo' : 'plano';
  if (criterio === 'plano' && linhas.length > 1) {
    aviso(null, 'Sem coluna de nível nem código hierárquico (1, 1.1, 1.1.1): todos os itens ficam no mesmo nível.');
  }

  // 2) Nível bruto de cada linha
  const brutos = linhas.map((l) => {
    if (criterio === 'nivel') return l.nivel !== null && l.nivel >= 1 ? l.nivel : null;
    if (criterio === 'codigo') return l.codigo !== null && CODIGO_HIERARQUICO.test(l.codigo) ? segmentos(l.codigo).length : null;
    return 1;
  });
  const conhecidos = brutos.filter((n): n is number => n !== null);
  const deslocamento = conhecidos.length > 0 ? Math.min(...conhecidos) - 1 : 0;
  if (deslocamento > 0) {
    aviso(null, `A planilha começa no nível ${deslocamento + 1}; os itens foram trazidos para começar no nível 1.`);
  }

  // 3) Pai de cada linha
  const temps: Temp[] = [];
  const pilha: Temp[] = []; // pilha[n-1] = último item visto no nível n
  const porCodigo = new Map<string, Temp>();

  linhas.forEach((origem, i) => {
    let nivelDesejado = brutos[i] === null ? null : brutos[i]! - deslocamento;
    if (nivelDesejado === null) {
      nivelDesejado = pilha.length > 0 ? pilha[pilha.length - 1]!.nivel : 1;
      if (criterio !== 'plano') aviso(origem.linha, `"${origem.nome}" não tem ${criterio === 'nivel' ? 'nível' : 'código'}; ficou no mesmo nível do item anterior.`);
    }

    let pai: Temp | null = null;
    const codigoValido = origem.codigo !== null && CODIGO_HIERARQUICO.test(origem.codigo);
    const segs = codigoValido ? segmentos(origem.codigo!) : [];

    if (criterio === 'codigo' && codigoValido && segs.length > 1) {
      pai = porCodigo.get(segs.slice(0, -1).join('.')) ?? null;
    }
    if (!pai && nivelDesejado > 1) {
      pai = pilha[Math.min(nivelDesejado, pilha.length + 1) - 2] ?? null;
      if (!pai) {
        aviso(origem.linha, `"${origem.nome}" não tem etapa acima dele; ficou no primeiro nível.`);
      } else if (pilha.length < nivelDesejado - 1) {
        aviso(origem.linha, `"${origem.nome}" pulou de nível; ficou dentro de "${pai.origem.nome}".`);
      } else if (criterio === 'codigo' && codigoValido && segs.length > 1) {
        aviso(origem.linha, `Etapa ${segs.slice(0, -1).join('.')} não aparece antes de "${origem.nome}"; o item ficou dentro de "${pai.origem.nome}".`);
      }
    }

    const nivel = pai ? pai.nivel + 1 : 1;
    if (nivel > LIMITE_NIVEIS_EAP) {
      erro(origem.linha, `"${origem.nome}" fica no nível ${nivel}; a EAP aceita no máximo ${LIMITE_NIVEIS_EAP} níveis.`);
    }

    const temp: Temp = { chave: `i${i + 1}`, paiChave: pai?.chave ?? null, nivel, origem };
    temps.push(temp);
    pilha.length = nivel - 1;
    pilha.push(temp);

    if (codigoValido) {
      const chaveCodigo = segs.join('.');
      if (porCodigo.has(chaveCodigo)) {
        aviso(
          origem.linha,
          `O código ${origem.codigo} aparece mais de uma vez` +
            (origem.codigoEraNumero ? ' (o Excel pode ter transformado 1.10 em 1.1; formate a coluna de código como texto).' : '.'),
        );
      } else {
        porCodigo.set(chaveCodigo, temp);
      }
    }
  });

  // 4) Tipo e valores
  const comFilhos = new Set(temps.map((t) => t.paiChave).filter((c): c is string => c !== null));
  const itens: ItemImportado[] = temps.map((t) => {
    const o = t.origem;
    const etapa = comFilhos.has(t.chave);

    let nome = o.nome.replace(/\s+/g, ' ').trim();
    if (nome.length > 300) {
      aviso(o.linha, 'Descrição com mais de 300 caracteres; foi cortada.');
      nome = nome.slice(0, 300);
    }
    const codigoExterno = o.codigo ? o.codigo.slice(0, 40) : null;

    if (etapa) {
      return {
        chave: t.chave,
        pai: t.paiChave,
        tipo: 'etapa',
        nome,
        unidade: null,
        quantidade: null,
        custo_previsto: null,
        inicio_previsto: null,
        fim_previsto: null,
        codigo_externo: codigoExterno,
        nivel: t.nivel,
        linha: o.linha,
      };
    }

    let unidade = o.unidade;
    if (unidade && unidade.length > 20) {
      aviso(o.linha, `Unidade "${unidade}" tem mais de 20 caracteres; foi cortada.`);
      unidade = unidade.slice(0, 20);
    }

    let custo = o.total;
    if (custo === null && o.quantidade !== null && o.precoUnitario !== null) custo = o.quantidade * o.precoUnitario;
    if (custo !== null) custo = arredondar(custo);

    if ((o.quantidade ?? 0) < 0) erro(o.linha, `Quantidade negativa em "${nome}".`);
    if ((custo ?? 0) < 0) erro(o.linha, `Custo negativo em "${nome}".`);
    if (o.inicio && o.fim && o.fim < o.inicio) erro(o.linha, `"${nome}" termina antes de começar.`);

    return {
      chave: t.chave,
      pai: t.paiChave,
      tipo: 'tarefa',
      nome,
      unidade,
      quantidade: o.quantidade === null ? null : arredondar(o.quantidade, 4),
      custo_previsto: custo,
      inicio_previsto: o.inicio,
      fim_previsto: o.fim,
      codigo_externo: codigoExterno,
      nivel: t.nivel,
      linha: o.linha,
    };
  });

  // 5) Confere totais das etapas com a soma das tarefas de dentro
  const soma = new Map<string, number>();
  for (let i = itens.length - 1; i >= 0; i--) {
    const item = itens[i]!;
    const proprio = item.tipo === 'tarefa' ? item.custo_previsto : soma.get(item.chave);
    if (proprio !== null && proprio !== undefined && item.pai) {
      soma.set(item.pai, (soma.get(item.pai) ?? 0) + proprio);
    }
  }
  const totalDeclarado = new Map(temps.map((t) => [t.chave, t.origem.total]));
  itens.forEach((item) => {
    const declarado = totalDeclarado.get(item.chave) ?? null;
    if (item.tipo !== 'etapa' || declarado === null) return;
    const calculado = arredondar(soma.get(item.chave) ?? 0);
    if (Math.abs(calculado - declarado) > Math.max(1, Math.abs(declarado) * 0.005)) {
      aviso(
        item.linha,
        `No arquivo, "${item.nome}" soma ${reais.format(declarado)}, mas as tarefas de dentro somam ${reais.format(calculado)}. Vale a soma das tarefas.`,
      );
    }
  });

  // 6) Resumo
  const tarefas = itens.filter((i) => i.tipo === 'tarefa');
  const custos = tarefas.map((t) => t.custo_previsto).filter((c): c is number => c !== null);
  const inicios = tarefas.map((t) => t.inicio_previsto).filter((d): d is string => d !== null).sort();
  const fins = tarefas.map((t) => t.fim_previsto).filter((d): d is string => d !== null).sort();

  return {
    itens: ordenarEmArvore(itens),
    problemas,
    criterio,
    resumo: {
      etapas: itens.length - tarefas.length,
      tarefas: tarefas.length,
      niveis: itens.reduce((m, i) => Math.max(m, i.nivel), 0),
      custoTotal: custos.length > 0 ? arredondar(custos.reduce((s, c) => s + c, 0)) : null,
      inicio: inicios[0] ?? null,
      fim: fins[fins.length - 1] ?? null,
    },
  };
}

/**
 * Ordem de árvore (pai, filhos, netos…), mantendo a ordem do arquivo entre
 * irmãos. Com códigos fora de ordem (1, 1.1, 2, 1.2) o 1.2 volta para perto do 1.
 */
function ordenarEmArvore(itens: ItemImportado[]): ItemImportado[] {
  const filhos = new Map<string | null, ItemImportado[]>();
  for (const item of itens) {
    const lista = filhos.get(item.pai) ?? [];
    lista.push(item);
    filhos.set(item.pai, lista);
  }
  const saida: ItemImportado[] = [];
  const visitar = (pai: string | null) => {
    for (const item of filhos.get(pai) ?? []) {
      saida.push(item);
      visitar(item.chave);
    }
  };
  visitar(null);
  return saida;
}

/** Itens no formato da função importar_eap (sem os campos só de prévia). */
export function paraBanco(itens: ItemImportado[]) {
  return itens.map(({ nivel: _nivel, linha: _linha, ...resto }) => resto);
}
