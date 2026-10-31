import { describe, expect, it } from 'vitest';
import xmlDeposito from './integracoes/__fixtures__/nfe-deposito.xml?raw';
import {
  converterLinhaNfe,
  formatarQuantidade,
  itensComSaldo,
  lerCodigoFerramenta,
  linkQrFerramenta,
  nomeDoProdutoNfe,
  normalizarUnidade,
  resumoMaterial,
  situacaoEmprestimo,
  sugerirItensNfe,
} from './almoxarifado';
import { chaveNfeValida, formatarChaveNfe } from './documentos';
import type { ItemEstoque, MovimentoEstoque } from './dominio';
import { ajusteSchema, emprestimoSchema, entradaSchema, errosPorCampo, itemEstoqueSchema, saidaSchema } from './esquemas';
import { ehXmlNfe, lerNfeXml } from './integracoes/nfe';

const U = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
const CHAVE = '35261011222333000181550010000012341000001234';

const item = (n: number, nome: string, extra: Partial<ItemEstoque> = {}): ItemEstoque => ({
  id: U(n),
  codigo: `MAT-${String(n).padStart(4, '0')}`,
  nome,
  tipo: 'material',
  unidade: 'un',
  categoria: null,
  estoque_minimo: 0,
  patrimonio: null,
  ncm: null,
  ativo: true,
  ...extra,
});

describe('chave da NF-e', () => {
  it('confere o dígito verificador (módulo 11)', () => {
    expect(chaveNfeValida(CHAVE)).toBe(true);
    expect(chaveNfeValida(CHAVE.slice(0, 43) + '5')).toBe(false);
    expect(chaveNfeValida('3526')).toBe(false);
    expect(chaveNfeValida(formatarChaveNfe(CHAVE))).toBe(true);
    expect(formatarChaveNfe(CHAVE)).toBe('3526 1011 2223 3300 0181 5500 1000 0012 3410 0000 1234');
  });
});

describe('leitura do XML da NF-e', () => {
  const { nota, problemas } = lerNfeXml(xmlDeposito);

  it('lê cabeçalho, emitente e protocolo', () => {
    expect(ehXmlNfe(xmlDeposito)).toBe(true);
    expect(problemas.filter((p) => p.gravidade === 'erro')).toEqual([]);
    expect(nota).toMatchObject({
      chave: CHAVE,
      modelo: '55',
      serie: '1',
      numero: '1234',
      emissao: '2026-10-28',
      emitente: { cnpj: '11222333000181', nome: 'DEPOSITO BOM PRECO & CIA LTDA', fantasia: 'Bom Preço' },
      destinatario: { documento: '00000000000191', nome: 'CONSTRUTORA EXEMPLO LTDA' },
      valorTotal: 4507.24,
      situacao: { codigo: '100', motivo: 'Autorizado o uso da NF-e' },
      homologacao: false,
    });
  });

  it('custo da linha soma frete, IPI e ST e tira o desconto', () => {
    expect(nota!.linhas.map((l) => [l.codigo, l.unidade, l.quantidade, l.custoTotal, l.custoUnitario])).toEqual([
      ['CIM001', 'SC', 100, 3040, 30.4], // 3000 − 10 + 50
      ['AR-M', 'M3', 10, 1229.1, 122.91], // 1205 + 24,10 de ST
      ['5501', 'BR', 12, 238.14, 19.845], // 226,80 + 11,34 de IPI
    ]);
    expect(nota!.linhas[0]!.ean).toBe('7891234567895');
    expect(nota!.linhas[1]!.ean).toBeNull(); // "SEM GTIN"
  });

  it('item fora do total (brinde) fica de fora com aviso; a soma bate com o total', () => {
    expect(nota!.linhas).toHaveLength(3);
    expect(problemas).toEqual([{ gravidade: 'aviso', mensagem: 'Item 4 (CANETA PROMOCIONAL) não entra no total da nota e ficou de fora.' }]);
  });

  it('aceita prefixo de namespace (nfe:det)', () => {
    const comPrefixo = xmlDeposito.replace(/<(\/?)(?!\?)([A-Za-z])/g, '<$1nfe:$2');
    const r = lerNfeXml(comPrefixo);
    expect(r.nota?.linhas).toHaveLength(3);
    expect(r.nota?.chave).toBe(CHAVE);
  });

  it('nota cancelada ou denegada não entra', () => {
    const r = lerNfeXml(xmlDeposito.replace('<cStat>100</cStat><xMotivo>Autorizado o uso da NF-e</xMotivo>', '<cStat>101</cStat><xMotivo>Cancelamento de NF-e homologado</xMotivo>'));
    expect(r.problemas.some((p) => p.gravidade === 'erro' && p.mensagem.includes('101: Cancelamento'))).toBe(true);
  });

  it('XML sem protocolo, de homologação ou com chave errada vira aviso', () => {
    const semProt = lerNfeXml(xmlDeposito.replace(/<protNFe[\s\S]*<\/protNFe>/, ''));
    expect(semProt.nota?.situacao).toBeNull();
    expect(semProt.problemas.map((p) => p.mensagem)).toContain(
      'O XML veio sem o protocolo de autorização da SEFAZ. Confira se a nota foi mesmo autorizada.',
    );

    const teste = lerNfeXml(xmlDeposito.replace(/<tpAmb>1<\/tpAmb>/g, '<tpAmb>2</tpAmb>'));
    expect(teste.nota?.homologacao).toBe(true);

    const chaveErrada = CHAVE.slice(0, 43) + '9';
    const errada = lerNfeXml(xmlDeposito.replaceAll(CHAVE, chaveErrada));
    expect(errada.nota?.chave).toBeNull();
    expect(errada.problemas.filter((p) => p.gravidade === 'aviso')).toHaveLength(3);
  });

  it('total que não bate vira aviso', () => {
    const r = lerNfeXml(xmlDeposito.replace('<vNF>4507.24</vNF>', '<vNF>5507.24</vNF>'));
    expect(r.problemas.some((p) => p.mensagem.startsWith('A soma dos itens (4507,24) não bate com o total da nota (5507,24)'))).toBe(true);
  });

  it('outros arquivos recebem uma explicação', () => {
    expect(lerNfeXml('<cteProc xmlns="http://www.portalfiscal.inf.br/cte"><CTe><infCte/></CTe></cteProc>').problemas[0]!.mensagem).toMatch(/CT-e/);
    expect(lerNfeXml('<CompNfse><Nfse><InfNfse/></Nfse></CompNfse>').problemas[0]!.mensagem).toMatch(/NFS-e/);
    expect(lerNfeXml('<resNFe xmlns="http://www.portalfiscal.inf.br/nfe"><chNFe>1</chNFe></resNFe>').problemas[0]!.mensagem).toMatch(/resumo/);
    expect(lerNfeXml('<Project><Tasks/></Project>')).toEqual({
      nota: null,
      problemas: [{ gravidade: 'erro', mensagem: expect.stringMatching(/não parece ser o XML de uma NF-e/) }],
    });
  });
});

describe('NF-e → catálogo', () => {
  const { nota } = lerNfeXml(xmlDeposito);
  const catalogo = [
    item(1, 'Cimento CP-II 50 kg', { unidade: 'sc' }),
    item(2, 'Areia média lavada', { unidade: 'm³' }),
    item(3, 'Tubo PVC soldável 25 mm', { unidade: 'm' }),
    item(4, 'Cimento antigo', { ativo: false }),
    item(5, 'TUBO PVC SOLDAVEL 25MM BARRA 6M', { tipo: 'ferramenta' }),
  ];

  it('sugere pelo vínculo do fornecedor, depois pelo nome (sem acento e caixa)', () => {
    const vinculos = [
      { cnpj_fornecedor: '11222333000181', codigo_fornecedor: 'CIM001', item_id: U(1) },
      { cnpj_fornecedor: '99999999000191', codigo_fornecedor: 'AR-M', item_id: U(3) }, // outro fornecedor
    ];
    expect(sugerirItensNfe(nota!.linhas, catalogo, vinculos, '11222333000181')).toEqual([
      { item_id: U(1), origem: 'vinculo' },
      { item_id: U(2), origem: 'nome' },
      { item_id: null, origem: null }, // a ferramenta de mesmo nome não serve
    ]);
  });

  it('vínculo para item inativo não vale', () => {
    const vinculos = [{ cnpj_fornecedor: '11222333000181', codigo_fornecedor: 'CIM001', item_id: U(4) }];
    expect(sugerirItensNfe(nota!.linhas, catalogo, vinculos, '11222333000181')[0]).toEqual({ item_id: null, origem: null });
  });

  it('converte para a unidade do catálogo sem mudar o custo da linha', () => {
    // 12 barras de 6 m = 72 m; R$ 238,14 ÷ 72
    expect(converterLinhaNfe(nota!.linhas[2]!, 6)).toEqual({ quantidade: 72, valor_unitario: 3.3075 });
    expect(converterLinhaNfe(nota!.linhas[0]!, 1)).toEqual({ quantidade: 100, valor_unitario: 30.4 });
    expect(converterLinhaNfe(nota!.linhas[0]!, 0)).toEqual({ quantidade: 100, valor_unitario: 30.4 }); // fator inválido = 1
  });

  it('nome do produto legível para o catálogo', () => {
    expect(nota!.linhas.map((l) => nomeDoProdutoNfe(l.descricao))).toEqual([
      'Cimento CP II-E-32 50KG',
      'Areia media lavada',
      'Tubo PVC soldavel 25MM barra 6M',
    ]);
    expect(nomeDoProdutoNfe('BLOCO DE CONCRETO 14X19X39')).toBe('Bloco de concreto 14X19X39');
    expect(nomeDoProdutoNfe('Argamassa AC-II Quartzolit')).toBe('Argamassa AC-II Quartzolit');
  });

  it('unidades da nota na grafia do catálogo', () => {
    expect(['SC', 'M3', 'UND', 'Pç', 'KG', 'BR', 'LT', 'M2', 'Galão', 'XYZ'].map(normalizarUnidade)).toEqual([
      'sc', 'm³', 'un', 'pç', 'kg', 'br', 'L', 'm²', 'gl', 'XYZ',
    ]);
  });
});

describe('saldo e gasto', () => {
  it('saldo da obra e alerta de estoque mínimo', () => {
    const itens = [
      item(1, 'Cimento', { estoque_minimo: 20 }),
      item(2, 'Areia', { estoque_minimo: 2 }),
      item(3, 'Brita', { estoque_minimo: 5 }), // sem saldo: zero
      item(4, 'Betoneira', { tipo: 'ferramenta' }),
    ];
    const r = itensComSaldo(itens, [
      { item_id: U(1), quantidade: 15, custo_medio: 32 },
      { item_id: U(2), quantidade: 7.5, custo_medio: 120.5 },
    ]);
    expect(r.map((i) => [i.nome, i.quantidade, i.valor, i.abaixoDoMinimo])).toEqual([
      ['Cimento', 15, 480, true],
      ['Areia', 7.5, 903.75, false],
      ['Brita', 0, 0, true],
      ['Betoneira', 0, 0, false],
    ]);
  });

  it('comprado, aplicado por tarefa, perdas e sobras', () => {
    const m = (tipo: MovimentoEstoque['tipo'], quantidade: number, valor_total: number, tarefa_id: string | null = null) => ({
      tipo,
      quantidade,
      valor_total,
      tarefa_id,
    });
    const r = resumoMaterial([
      m('entrada', 100, 3000),
      m('entrada', 50, 1800),
      m('saida', 40, 1280, U(10)),
      m('saida', 2.5, 301.25, U(11)),
      m('saida', 1, 32, U(10)),
      m('ajuste', -5, 160),
      m('ajuste', 1, 32),
    ]);
    expect({ ...r, porTarefa: Object.fromEntries(r.porTarefa) }).toEqual({
      comprado: 4800,
      aplicado: 1613.25,
      perdas: 160,
      sobras: 32,
      porTarefa: { [U(10)]: 1312, [U(11)]: 301.25 },
    });
  });

  it('quantidade no padrão brasileiro', () => {
    expect(formatarQuantidade(2.5, 'm³')).toBe('2,5 m³');
    expect(formatarQuantidade(1000)).toBe('1.000');
    expect(formatarQuantidade(0.125, 'kg')).toBe('0,125 kg');
    expect(formatarQuantidade(null)).toBe('—');
  });
});

describe('ferramentas', () => {
  it('QR da etiqueta é um link para a ferramenta; o leitor aceita link, id ou código', () => {
    expect(linkQrFerramenta('https://obras.exemplo.com.br/', U(7))).toBe(`https://obras.exemplo.com.br/f/${U(7)}`);
    expect(lerCodigoFerramenta(`https://obras.exemplo.com.br/f/${U(7)}`)).toEqual({ itemId: U(7) });
    expect(lerCodigoFerramenta(U(7).toUpperCase())).toEqual({ itemId: U(7) });
    expect(lerCodigoFerramenta(' fer-0001 ')).toEqual({ codigo: 'FER-0001' });
    expect(lerCodigoFerramenta('   ')).toBeNull();
  });

  it('dias fora e atraso pela data de Brasília', () => {
    // 01h UTC do dia 29 ainda é dia 28 em Brasília
    expect(situacaoEmprestimo({ retirada_em: '2026-10-29T01:00:00Z', devolver_ate: '2026-10-30' }, '2026-10-31')).toEqual({
      diasFora: 3,
      atrasado: true,
    });
    expect(situacaoEmprestimo({ retirada_em: '2026-10-31T12:00:00Z', devolver_ate: null }, '2026-10-31')).toEqual({
      diasFora: 0,
      atrasado: false,
    });
  });
});

describe('esquemas do almoxarifado', () => {
  it('item: ferramenta é sempre 1 un sem mínimo; NCM com 8 dígitos', () => {
    expect(itemEstoqueSchema.parse({ nome: 'Furadeira', tipo: 'ferramenta', unidade: 'cx', estoque_minimo: '5', patrimonio: 'PAT-1' })).toMatchObject({
      unidade: 'un',
      estoque_minimo: 0,
      patrimonio: 'PAT-1',
    });
    expect(itemEstoqueSchema.parse({ nome: 'Cimento', tipo: 'material', unidade: 'sc', estoque_minimo: '20,5', ncm: '2523.29.10', patrimonio: 'x' })).toMatchObject({
      estoque_minimo: 20.5,
      ncm: '25232910',
      patrimonio: null,
      codigo: null,
    });
    const r = itemEstoqueSchema.safeParse({ nome: 'C', tipo: 'material', unidade: '', ncm: '123' });
    expect(r.success).toBe(false);
    expect(errosPorCampo(r.error!)).toMatchObject({ nome: 'Informe o nome do item', ncm: 'O NCM tem 8 dígitos' });
  });

  it('entrada: chave e CNPJ conferidos, quantidade brasileira', () => {
    const ok = entradaSchema.parse({
      data: '2026-10-28',
      cnpj_fornecedor: '11.222.333/0001-81',
      chave_nfe: formatarChaveNfe(CHAVE),
      itens: [{ item_id: U(1), quantidade: '1.000', valor_unitario: '30,4' }],
    });
    expect(ok).toMatchObject({ cnpj_fornecedor: '11222333000181', chave_nfe: CHAVE, itens: [{ quantidade: 1000, valor_unitario: 30.4, codigo_fornecedor: null }] });
    const ruim = entradaSchema.safeParse({ data: '2026-10-28', chave_nfe: CHAVE.slice(0, 43) + '9', cnpj_fornecedor: '11222333000180', itens: [] });
    expect(errosPorCampo(ruim.error!)).toMatchObject({
      chave_nfe: 'Chave da NF-e inválida: confira os 44 dígitos',
      cnpj_fornecedor: 'CNPJ do fornecedor inválido',
      itens: 'Inclua pelo menos um item',
    });
  });

  it('saída exige tarefa e quantidade maior que zero', () => {
    const r = saidaSchema.safeParse({ item_id: U(1), data: '2026-10-31', quantidade: '0' });
    expect(errosPorCampo(r.error!)).toEqual({
      quantidade: 'Quantidade maior que zero',
      tarefa_id: 'Escolha a tarefa que vai usar o material',
    });
    expect(saidaSchema.parse({ item_id: U(1), data: '2026-10-31', quantidade: '2,5', tarefa_id: U(2), trabalhador_id: '' })).toMatchObject({
      quantidade: 2.5,
      trabalhador_id: null,
    });
  });

  it('ajuste aceita contagem zero e exige motivo; empréstimo exige com quem fica', () => {
    expect(ajusteSchema.parse({ item_id: U(1), data: '2026-10-31', quantidade_contada: '0', motivo: 'Inventário' }).quantidade_contada).toBe(0);
    expect(ajusteSchema.safeParse({ item_id: U(1), data: '2026-10-31', quantidade_contada: '3', motivo: ' ' }).success).toBe(false);
    expect(errosPorCampo(emprestimoSchema.safeParse({ item_id: U(1) }).error!)).toEqual({
      responsavel: 'Escolha a pessoa ou escreva com quem a ferramenta vai ficar',
    });
    expect(emprestimoSchema.parse({ item_id: U(1), trabalhador_id: U(2), devolver_ate: '' })).toMatchObject({ devolver_ate: null, responsavel: null });
  });
});
