import { montarEap } from './hierarquia';
import type { LinhaOrigem, Problema, ResultadoImportacao } from './tipos';

// Leitura do XML do MS Project (MSPDI: "Salvar como → XML"). O ProjectLibre
// exporta no mesmo formato. Só os campos simples de cada <Task> interessam;
// blocos aninhados (linha de base, vínculos, campos extras) são descartados
// antes, porque repetem nomes como <Start> e <Cost>.

const BLOCOS_ANINHADOS = /<(PredecessorLink|ExtendedAttribute|Baseline|TimephasedData|OutlineCode)\b[\s\S]*?<\/\1>/g;

function decodificar(texto: string): string {
  return texto
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, '$1')
    .replace(/&#x([0-9a-f]+);/gi, (_, h: string) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d: string) => String.fromCodePoint(parseInt(d, 10)))
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, '&');
}

function campo(bloco: string, nome: string): string | null {
  const m = bloco.match(new RegExp(`<${nome}>([\\s\\S]*?)</${nome}>`));
  return m ? decodificar(m[1]!).trim() : null;
}

/** Parece um XML do MS Project? */
export function ehXmlMsProject(texto: string): boolean {
  const inicio = texto.slice(0, 4000);
  return /<Project[\s>]/.test(inicio) && (/schemas\.microsoft\.com\/project/.test(inicio) || /<Tasks>/.test(texto));
}

export interface ResultadoMsProject extends ResultadoImportacao {
  nomeProjeto: string | null;
}

export function lerMsProjectXml(texto: string): ResultadoMsProject {
  const problemas: Problema[] = [];
  if (!ehXmlMsProject(texto)) {
    return {
      ...montarEap([], [{ linha: null, gravidade: 'erro', mensagem: 'Este XML não parece ser do MS Project. No MS Project, use Arquivo → Salvar como → XML.' }]),
      nomeProjeto: null,
    };
  }

  const cabecalho = texto.split(/<Tasks>/)[0] ?? '';
  const nomeProjeto = campo(cabecalho, 'Title') || campo(cabecalho, 'Name');

  const tarefasXml = texto.match(/<Task>[\s\S]*?<\/Task>/g) ?? [];
  const linhas: LinhaOrigem[] = [];
  let posicao = 0;

  for (const bruto of tarefasXml) {
    const bloco = bruto.replace(BLOCOS_ANINHADOS, '');
    posicao++;

    if (campo(bloco, 'IsNull') === '1') continue; // linha em branco no MS Project
    const nivel = Number(campo(bloco, 'OutlineLevel') ?? '1');
    if (campo(bloco, 'UID') === '0' || nivel === 0) continue; // tarefa-resumo do projeto
    const nome = campo(bloco, 'Name') ?? '';
    if (nome === '') continue;

    // MSPDI guarda moeda multiplicada por 100 (mesma convenção do MPXJ).
    const custoBruto = campo(bloco, 'Cost');
    const custo = custoBruto === null || custoBruto === '' ? null : Number(custoBruto) / 100;

    const inicio = campo(bloco, 'Start');
    const fim = campo(bloco, 'Finish');
    const id = campo(bloco, 'ID');

    linhas.push({
      linha: id ? Number(id) : posicao,
      codigo: campo(bloco, 'OutlineNumber') || campo(bloco, 'WBS'),
      nivel: Number.isFinite(nivel) ? nivel : null,
      nome,
      unidade: null,
      quantidade: null,
      precoUnitario: null,
      total: custo !== null && Number.isFinite(custo) && custo > 0 ? custo : null,
      inicio: inicio && /^\d{4}-\d{2}-\d{2}/.test(inicio) ? inicio.slice(0, 10) : null,
      fim: fim && /^\d{4}-\d{2}-\d{2}/.test(fim) ? fim.slice(0, 10) : null,
    });
  }

  if (tarefasXml.length > 0 && linhas.length === 0) {
    problemas.push({ linha: null, gravidade: 'erro', mensagem: 'O arquivo não tem tarefas com nome.' });
  }

  return { ...montarEap(linhas, problemas), nomeProjeto };
}
