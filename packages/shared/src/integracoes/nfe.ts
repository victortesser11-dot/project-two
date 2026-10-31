import { chaveNfeValida, somenteDigitos } from '../documentos';
import { atributoXml, blocoXml, blocosXml, campoXml, semPrefixos } from '../xml';

// Leitura do XML da NF-e (modelo 55, layout 4.00; o 3.10 também passa) no navegador.
// O almoxarife sobe o arquivo que o fornecedor manda por e-mail; nada sai do aparelho
// até ele conferir a prévia e confirmar (aí o app chama registrar_entradas).
//
// Custo de cada linha = produtos − desconto + frete + seguro + outras despesas + IPI + ICMS-ST:
// é o que a obra paga de fato. Construtora em geral não aproveita crédito de ICMS,
// então o ICMS próprio já está no preço e não entra de novo.

export interface LinhaNfe {
  /** nItem da nota (1, 2, 3…). */
  numero: number;
  /** Código do produto no fornecedor (cProd): é ele que liga a próxima nota ao catálogo. */
  codigo: string;
  ean: string | null;
  descricao: string;
  ncm: string | null;
  cfop: string | null;
  /** Unidade como veio na nota (uCom), ex.: "SC", "M3". */
  unidade: string;
  quantidade: number;
  /** Preço unitário da nota (vUnCom), sem rateios. */
  valorUnitario: number;
  valorProdutos: number;
  desconto: number;
  frete: number;
  seguro: number;
  outras: number;
  ipi: number;
  icmsSt: number;
  /** O que a linha custou de fato (ver o cabeçalho do arquivo). */
  custoTotal: number;
  /** custoTotal ÷ quantidade, com 4 casas (como no banco). */
  custoUnitario: number;
}

export interface NotaFiscal {
  chave: string | null;
  modelo: string | null;
  serie: string | null;
  numero: string | null;
  /** Data de emissão (AAAA-MM-DD). */
  emissao: string | null;
  naturezaOperacao: string | null;
  emitente: { cnpj: string | null; cpf: string | null; nome: string | null; fantasia: string | null };
  destinatario: { documento: string | null; nome: string | null };
  valorTotal: number | null;
  linhas: LinhaNfe[];
  /** cStat do protocolo (100 = autorizada); null quando o XML veio sem protocolo. */
  situacao: { codigo: string; motivo: string | null } | null;
  homologacao: boolean;
}

export interface ProblemaNfe {
  gravidade: 'erro' | 'aviso';
  mensagem: string;
}

export interface ResultadoNfe {
  nota: NotaFiscal | null;
  problemas: ProblemaNfe[];
}

const AUTORIZADA = new Set(['100', '150']); // 150 = autorizada fora de prazo

/** Parece um XML de NF-e? */
export function ehXmlNfe(texto: string): boolean {
  return /<(?:\w+:)?infNFe[\s>]/.test(texto) && /portalfiscal\.inf\.br\/nfe/.test(texto);
}

function numero(bloco: string, nome: string): number {
  const v = campoXml(bloco, nome);
  if (v === null || v === '') return 0;
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

const arred = (n: number, casas: number) => Math.round(n * 10 ** casas) / 10 ** casas;

function mensagemFormatoErrado(texto: string): string {
  if (/portalfiscal\.inf\.br\/cte/.test(texto) || /<infCte[\s>]/.test(texto)) {
    return 'Este XML é de um CT-e (conhecimento de transporte), não de uma NF-e de produtos.';
  }
  if (/<(?:\w+:)?(CompNfse|Nfse|InfNfse)[\s>]/i.test(texto)) {
    return 'Este XML é de uma nota de serviço (NFS-e). O almoxarifado lê NF-e de produtos.';
  }
  if (/<(?:\w+:)?resNFe[\s>]/.test(texto)) {
    return 'Este XML é só o resumo da NF-e. Peça ao fornecedor o XML completo (o arquivo da nota autorizada).';
  }
  return 'Este arquivo não parece ser o XML de uma NF-e. Use o arquivo .xml que o fornecedor envia junto com o DANFE.';
}

export function lerNfeXml(entrada: string): ResultadoNfe {
  const problemas: ProblemaNfe[] = [];
  const texto = semPrefixos(entrada.replace(/^﻿/, ''));
  if (!ehXmlNfe(texto)) {
    return { nota: null, problemas: [{ gravidade: 'erro', mensagem: mensagemFormatoErrado(texto) }] };
  }

  // A assinatura repete blocos e não interessa aqui.
  const semAssinatura = texto.replace(/<Signature\b[\s\S]*?<\/Signature>/g, '');
  const inf = blocosXml(semAssinatura, 'infNFe')[0];
  if (!inf) {
    return { nota: null, problemas: [{ gravidade: 'erro', mensagem: 'O XML da NF-e está incompleto (sem o bloco infNFe).' }] };
  }
  const conteudo = inf.conteudo;

  const ide = blocoXml(conteudo, 'ide') ?? '';
  const emit = blocoXml(conteudo, 'emit') ?? '';
  const dest = blocoXml(conteudo, 'dest') ?? '';
  const icmsTot = blocoXml(blocoXml(conteudo, 'total') ?? '', 'ICMSTot') ?? '';
  const infProt = blocoXml(semAssinatura, 'infProt');

  // Chave: atributo Id="NFe<44 dígitos>" ou, se faltar, a do protocolo.
  const idAtributo = somenteDigitos(atributoXml(inf.atributos, 'Id') ?? '');
  const chaveProt = infProt ? somenteDigitos(campoXml(infProt, 'chNFe') ?? '') : '';
  let chave: string | null = idAtributo.length === 44 ? idAtributo : chaveProt.length === 44 ? chaveProt : null;
  if (chave && !chaveNfeValida(chave)) {
    problemas.push({ gravidade: 'aviso', mensagem: 'A chave de acesso desta nota não confere (dígito verificador). Ela não será guardada.' });
    chave = null;
  }
  if (!chave) {
    problemas.push({ gravidade: 'aviso', mensagem: 'Nota sem chave de acesso válida: o sistema não vai conseguir barrar um lançamento repetido dela.' });
  }

  const emissaoBruta = campoXml(ide, 'dhEmi') ?? campoXml(ide, 'dEmi');
  const emissao = emissaoBruta && /^\d{4}-\d{2}-\d{2}/.test(emissaoBruta) ? emissaoBruta.slice(0, 10) : null;

  const situacao = infProt ? { codigo: campoXml(infProt, 'cStat') ?? '', motivo: campoXml(infProt, 'xMotivo') } : null;
  if (!situacao) {
    problemas.push({ gravidade: 'aviso', mensagem: 'O XML veio sem o protocolo de autorização da SEFAZ. Confira se a nota foi mesmo autorizada.' });
  } else if (!AUTORIZADA.has(situacao.codigo)) {
    problemas.push({
      gravidade: 'erro',
      mensagem: `A SEFAZ não autorizou esta nota (${situacao.codigo}${situacao.motivo ? `: ${situacao.motivo}` : ''}). Não dá para dar entrada.`,
    });
  }
  const homologacao = (campoXml(ide, 'tpAmb') ?? (infProt ? campoXml(infProt, 'tpAmb') : null)) === '2';
  if (homologacao) {
    problemas.push({ gravidade: 'aviso', mensagem: 'Nota emitida em homologação (teste), sem valor fiscal.' });
  }

  const linhas: LinhaNfe[] = [];
  for (const det of blocosXml(conteudo, 'det')) {
    const prod = blocoXml(det.conteudo, 'prod') ?? '';
    const imposto = blocoXml(det.conteudo, 'imposto') ?? '';
    const nItem = Number(atributoXml(det.atributos, 'nItem') ?? linhas.length + 1);
    const quantidade = numero(prod, 'qCom');
    const descricao = campoXml(prod, 'xProd') ?? '';
    // indTot = 0: linha que não compõe o total da nota (ex.: brinde informativo).
    if (campoXml(prod, 'indTot') === '0') {
      problemas.push({ gravidade: 'aviso', mensagem: `Item ${nItem} (${descricao}) não entra no total da nota e ficou de fora.` });
      continue;
    }
    if (quantidade <= 0) {
      problemas.push({ gravidade: 'aviso', mensagem: `Item ${nItem} (${descricao}) sem quantidade e ficou de fora.` });
      continue;
    }

    const valorProdutos = numero(prod, 'vProd');
    const desconto = numero(prod, 'vDesc');
    const frete = numero(prod, 'vFrete');
    const seguro = numero(prod, 'vSeg');
    const outras = numero(prod, 'vOutro');
    const ipiTrib = blocoXml(blocoXml(imposto, 'IPI') ?? '', 'IPITrib') ?? '';
    const ipi = numero(ipiTrib, 'vIPI');
    const icms = blocoXml(imposto, 'ICMS') ?? '';
    const icmsSt = numero(icms, 'vICMSST') + numero(icms, 'vFCPST');
    const custoTotal = arred(valorProdutos - desconto + frete + seguro + outras + ipi + icmsSt, 2);
    const ean = campoXml(prod, 'cEAN');

    linhas.push({
      numero: Number.isFinite(nItem) ? nItem : linhas.length + 1,
      codigo: campoXml(prod, 'cProd') ?? '',
      ean: ean && /^\d{8,14}$/.test(ean) ? ean : null,
      descricao,
      ncm: campoXml(prod, 'NCM'),
      cfop: campoXml(prod, 'CFOP'),
      unidade: campoXml(prod, 'uCom') ?? '',
      quantidade,
      valorUnitario: numero(prod, 'vUnCom'),
      valorProdutos,
      desconto,
      frete,
      seguro,
      outras,
      ipi,
      icmsSt,
      custoTotal,
      custoUnitario: arred(custoTotal / quantidade, 4),
    });
  }
  if (linhas.length === 0) {
    problemas.push({ gravidade: 'erro', mensagem: 'A nota não tem itens para dar entrada.' });
  }

  const valorTotal = campoXml(icmsTot, 'vNF') !== null ? numero(icmsTot, 'vNF') : null;
  if (valorTotal !== null && linhas.length > 0) {
    const soma = arred(linhas.reduce((s, l) => s + l.custoTotal, 0), 2);
    // Diferença pequena é arredondamento; grande costuma ser imposto de importação ou serviço na nota.
    if (Math.abs(soma - valorTotal) > 0.05 * Math.max(1, linhas.length)) {
      problemas.push({
        gravidade: 'aviso',
        mensagem: `A soma dos itens (${soma.toFixed(2).replace('.', ',')}) não bate com o total da nota (${valorTotal.toFixed(2).replace('.', ',')}). Confira os valores antes de confirmar.`,
      });
    }
  }

  const docDest = campoXml(dest, 'CNPJ') ?? campoXml(dest, 'CPF');
  return {
    nota: {
      chave,
      modelo: campoXml(ide, 'mod'),
      serie: campoXml(ide, 'serie'),
      numero: campoXml(ide, 'nNF'),
      emissao,
      naturezaOperacao: campoXml(ide, 'natOp'),
      emitente: {
        cnpj: campoXml(emit, 'CNPJ'),
        cpf: campoXml(emit, 'CPF'),
        nome: campoXml(emit, 'xNome'),
        fantasia: campoXml(emit, 'xFant'),
      },
      destinatario: { documento: docDest, nome: campoXml(dest, 'xNome') },
      valorTotal,
      linhas,
      situacao,
      homologacao,
    },
    problemas,
  };
}
