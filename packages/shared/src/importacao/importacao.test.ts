import { describe, expect, it } from 'vitest';
import {
  converterLinhas,
  decodificarTexto,
  detectarColunas,
  detectarSeparador,
  lerCsv,
  lerData,
  lerMsProjectXml,
  lerNumero,
  letraColuna,
  montarEap,
  paraBanco,
  planilhaModeloCsv,
  type LinhaOrigem,
} from './index';

const linha = (dados: Partial<LinhaOrigem> & { nome: string }, n = 1): LinhaOrigem => ({
  linha: n,
  codigo: null,
  nivel: null,
  unidade: null,
  quantidade: null,
  precoUnitario: null,
  total: null,
  inicio: null,
  fim: null,
  ...dados,
});

describe('lerNumero', () => {
  it.each([
    ['1.234,56', ',', 1234.56],
    ['R$ 1.234,56', 'auto', 1234.56],
    ['1,234.56', 'auto', 1234.56],
    ['1234.56', '.', 1234.56],
    ['12,5', 'auto', 12.5],
    ['1.234', ',', 1234],
    ['1.234', '.', 1.234],
    ['1.234.567', 'auto', 1234567],
    ['(1.234,56)', ',', -1234.56],
    ['-10', 'auto', -10],
    ['', 'auto', null],
    ['-', 'auto', null],
  ] as const)('%s (decimal %s) → %s', (entrada, decimal, esperado) => {
    expect(lerNumero(entrada, decimal)).toBe(esperado);
  });

  it('aceita número de verdade e recusa texto', () => {
    expect(lerNumero(42.5)).toBe(42.5);
    expect(lerNumero('doze')).toBeNaN();
    expect(lerNumero(null)).toBeNull();
  });
});

describe('lerData', () => {
  it.each([
    ['03/11/2026', '2026-11-03'],
    ['3/11/26', '2026-11-03'],
    ['seg 03/11/26', '2026-11-03'],
    ['Seg, 03/11/2026 08:00', '2026-11-03'],
    ['03-11-2026', '2026-11-03'],
    ['2026-11-03T08:00:00', '2026-11-03'],
    ['', null],
  ] as const)('%s → %s', (entrada, esperado) => {
    expect(lerData(entrada)).toBe(esperado);
  });

  it('lê Date em UTC e série do Excel', () => {
    expect(lerData(new Date(Date.UTC(2026, 10, 3)))).toBe('2026-11-03');
    expect(lerData(46329)).toBe('2026-11-03');
  });

  it('recusa data impossível', () => {
    expect(lerData('31/02/2026')).toBe('invalida');
    expect(lerData('amanhã')).toBe('invalida');
  });
});

describe('CSV', () => {
  it('detecta ponto e vírgula mesmo com vírgulas decimais nos números', () => {
    const texto = 'Item;Descrição;Total\n1.1;Escavação;1.234,50\n1.2;Aterro;980,00\n';
    expect(detectarSeparador(texto)).toBe(';');
    const csv = lerCsv(texto);
    expect(csv.decimal).toBe(',');
    expect(csv.linhas).toEqual([
      ['Item', 'Descrição', 'Total'],
      ['1.1', 'Escavação', '1.234,50'],
      ['1.2', 'Aterro', '980,00'],
    ]);
  });

  it('respeita aspas, aspas duplicadas e quebra de linha dentro do campo', () => {
    const csv = lerCsv('a,b\r\n"x, y","diz ""oi""\nem duas linhas"\r\n');
    expect(csv.separador).toBe(',');
    expect(csv.linhas).toEqual([
      ['a', 'b'],
      ['x, y', 'diz "oi"\nem duas linhas'],
    ]);
  });

  it('decodifica Windows-1252 quando não é UTF-8', () => {
    // "Descrição" em Windows-1252: ç = 0xE7, ã = 0xE3
    const bytes = new Uint8Array([0x44, 0x65, 0x73, 0x63, 0x72, 0x69, 0xe7, 0xe3, 0x6f]);
    expect(decodificarTexto(bytes)).toBe('Descrição');
    expect(decodificarTexto(new TextEncoder().encode('Descrição'))).toBe('Descrição');
  });

  it('modelo para download volta pelo próprio importador', () => {
    const csv = lerCsv(planilhaModeloCsv());
    const { linhaCabecalho, mapeamento } = detectarColunas(csv.linhas);
    const { linhas, problemas } = converterLinhas(csv.linhas, linhaCabecalho, mapeamento, csv.decimal);
    const r = montarEap(linhas, problemas);
    expect(r.problemas.filter((p) => p.gravidade === 'erro')).toEqual([]);
    expect(r.resumo).toMatchObject({ etapas: 3, tarefas: 4, niveis: 3, custoTotal: 123804.5 });
  });
});

describe('detectarColunas', () => {
  it('acha o cabeçalho depois do título da planilha', () => {
    const linhas = [
      ['ORÇAMENTO SINTÉTICO', null, null],
      ['Obra: Residencial Aurora', null, null],
      [],
      ['Item', 'Descrição dos serviços', 'Unid.', 'Quant.', 'Preço unitário (R$)', 'Preço total (R$)'],
      ['1', 'Serviços preliminares', null, null, null, 14304],
    ];
    const r = detectarColunas(linhas);
    expect(r.linhaCabecalho).toBe(3);
    expect(r.mapeamento).toEqual({ codigo: 0, nome: 1, unidade: 2, quantidade: 3, precoUnitario: 4, total: 5 });
  });

  it('reconhece a exportação do MS Project para Excel', () => {
    const r = detectarColunas([
      ['Id', 'Modo da Tarefa', 'Nome da Tarefa', 'Duração', 'Início', 'Término', 'Nível da estrutura de tópicos'],
    ]);
    expect(r.mapeamento).toEqual({ nome: 2, inicio: 4, fim: 5, nivel: 6 });
  });

  it('com duas colunas de total, fica com a da direita (com BDI)', () => {
    const r = detectarColunas([['Item', 'Descrição', 'Total', 'Total com BDI']]);
    expect(r.mapeamento.total).toBe(3);
  });

  it('sem cabeçalho reconhecível devolve vazio', () => {
    expect(detectarColunas([['a', 'b'], ['1', '2']])).toEqual({ linhaCabecalho: null, mapeamento: {} });
  });

  it('nomeia colunas como o Excel', () => {
    expect([0, 25, 26, 27, 701].map(letraColuna)).toEqual(['A', 'Z', 'AA', 'AB', 'ZZ']);
  });
});

describe('converterLinhas', () => {
  it('ignora linhas vazias, sem descrição e de total, avisando', () => {
    const linhas = [
      ['Item', 'Descrição', 'Total'],
      ['1', 'Fundações', ''],
      ['', '', ''],
      ['1.1', '', '500'],
      ['', 'TOTAL GERAL', '500'],
      ['1.2', 'Estacas', 'abc'],
    ];
    const r = converterLinhas(linhas, 0, { codigo: 0, nome: 1, total: 2 }, ',');
    expect(r.linhas.map((l) => l.nome)).toEqual(['Fundações', 'Estacas']);
    expect(r.linhas[1]).toMatchObject({ linha: 6, codigo: '1.2', total: null });
    expect(r.problemas.map((p) => p.linha)).toEqual([4, 5, 6]);
  });

  it('marca código que veio como número do Excel', () => {
    const r = converterLinhas([[1.1, 'Tapume']], null, { codigo: 0, nome: 1 });
    expect(r.linhas[0]).toMatchObject({ codigo: '1.1', codigoEraNumero: true });
  });
});

describe('montarEap', () => {
  it('monta a árvore pelo código e transforma em etapa quem tem itens dentro', () => {
    const r = montarEap([
      linha({ codigo: '1', nome: 'Fundações', total: 100 }, 2),
      linha({ codigo: '1.1', nome: 'Estacas', quantidade: 10, precoUnitario: 4 }, 3),
      linha({ codigo: '1.2', nome: 'Blocos', total: 60, inicio: '2026-11-01', fim: '2026-11-10' }, 4),
      linha({ codigo: '2', nome: 'Limpeza' }, 5),
    ]);
    expect(r.criterio).toBe('codigo');
    expect(r.itens.map((i) => `${i.nivel}:${i.tipo}:${i.nome}:${i.pai ?? '-'}`)).toEqual([
      '1:etapa:Fundações:-',
      '2:tarefa:Estacas:i1',
      '2:tarefa:Blocos:i1',
      '1:tarefa:Limpeza:-',
    ]);
    expect(r.itens[1]!.custo_previsto).toBe(40);
    expect(r.itens[0]!.custo_previsto).toBeNull();
    expect(r.resumo).toEqual({ etapas: 1, tarefas: 3, niveis: 2, custoTotal: 100, inicio: '2026-11-01', fim: '2026-11-10' });
    expect(r.problemas).toEqual([]);
  });

  it('avisa quando o total da etapa não bate com a soma das tarefas', () => {
    const r = montarEap([
      linha({ codigo: '1', nome: 'Fundações', total: 999 }),
      linha({ codigo: '1.1', nome: 'Estacas', total: 100 }),
    ]);
    expect(r.problemas).toHaveLength(1);
    expect(r.problemas[0]!.mensagem).toMatch(/soma/);
  });

  it('códigos fora de ordem vão para a etapa certa e a prévia sai em ordem de árvore', () => {
    const r = montarEap([
      linha({ codigo: '1', nome: 'A' }),
      linha({ codigo: '1.1', nome: 'A1' }),
      linha({ codigo: '2', nome: 'B' }),
      linha({ codigo: '1.2', nome: 'A2' }),
    ]);
    expect(r.itens.map((i) => i.nome)).toEqual(['A', 'A1', 'A2', 'B']);
    expect(r.itens.find((i) => i.nome === 'A2')!.pai).toBe('i1');
  });

  it('1.10 lido como 1.1 pelo Excel: avisa e ainda acerta os filhos pela posição', () => {
    const r = montarEap([
      linha({ codigo: '1', nome: 'Estrutura' }),
      linha({ codigo: '1.1', nome: 'Pilares' }),
      linha({ codigo: '1.1', codigoEraNumero: true, nome: 'Lajes (1.10)' }),
      linha({ codigo: '1.10.1', nome: 'Laje do térreo' }),
    ]);
    const laje = r.itens.find((i) => i.nome === 'Laje do térreo')!;
    expect(r.itens.find((i) => i.chave === laje.pai)!.nome).toBe('Lajes (1.10)');
    expect(r.problemas.some((p) => /formate a coluna/.test(p.mensagem))).toBe(true);
  });

  it('pelo nível, corrige saltos e começa no nível 1', () => {
    const r = montarEap([
      linha({ nivel: 2, nome: 'A' }),
      linha({ nivel: 4, nome: 'A1' }),
      linha({ nivel: 2, nome: 'B' }),
    ]);
    expect(r.criterio).toBe('nivel');
    expect(r.itens.map((i) => `${i.nivel}:${i.nome}`)).toEqual(['1:A', '2:A1', '1:B']);
    expect(r.problemas.length).toBe(2); // deslocamento + salto
  });

  it('sem código nem nível, tudo fica no mesmo nível', () => {
    const r = montarEap([linha({ nome: 'A' }), linha({ nome: 'B' })]);
    expect(r.criterio).toBe('plano');
    expect(r.itens.every((i) => i.nivel === 1 && i.tipo === 'tarefa')).toBe(true);
  });

  it('erros bloqueiam: datas invertidas, negativos e mais de 6 níveis', () => {
    const fundo = Array.from({ length: 7 }, (_, n) =>
      linha({ codigo: Array.from({ length: n + 1 }, () => '1').join('.'), nome: `N${n + 1}` }),
    );
    const r = montarEap([
      linha({ codigo: '9', nome: 'Datas', inicio: '2026-12-10', fim: '2026-12-01' }),
      linha({ codigo: '8', nome: 'Negativo', total: -5 }),
      ...fundo,
    ]);
    const erros = r.problemas.filter((p) => p.gravidade === 'erro').map((p) => p.mensagem);
    expect(erros).toHaveLength(3);
    expect(erros.join(' ')).toMatch(/termina antes/);
    expect(erros.join(' ')).toMatch(/negativo/);
    expect(erros.join(' ')).toMatch(/6 níveis/);
  });

  it('sem linhas é erro', () => {
    expect(montarEap([]).problemas[0]!.gravidade).toBe('erro');
  });

  it('formato do banco não leva campos da prévia', () => {
    const [item] = paraBanco(montarEap([linha({ nome: 'A' })]).itens);
    expect(Object.keys(item!).sort()).toEqual([
      'chave', 'codigo_externo', 'custo_previsto', 'fim_previsto', 'inicio_previsto', 'nome', 'pai', 'quantidade', 'tipo', 'unidade',
    ]);
  });
});

describe('MS Project XML', () => {
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<Project xmlns="http://schemas.microsoft.com/project">
  <Name>Aurora.xml</Name>
  <Title>Residencial Aurora</Title>
  <Tasks>
    <Task><UID>0</UID><ID>0</ID><Name>Residencial Aurora</Name><OutlineLevel>0</OutlineLevel><Cost>12345600</Cost></Task>
    <Task><UID>1</UID><ID>1</ID><Name>Fundações &amp; contenções</Name><OutlineNumber>1</OutlineNumber><OutlineLevel>1</OutlineLevel><Summary>1</Summary>
      <Start>2026-11-03T08:00:00</Start><Finish>2026-12-10T17:00:00</Finish><Cost>10950050</Cost></Task>
    <Task><UID>2</UID><ID>2</ID><Name>Estacas</Name><OutlineNumber>1.1</OutlineNumber><OutlineLevel>2</OutlineLevel>
      <Start>2026-11-03T08:00:00</Start><Finish>2026-11-20T17:00:00</Finish><Cost>4800000</Cost>
      <Baseline><Number>0</Number><Start>2026-10-01T08:00:00</Start><Cost>1</Cost></Baseline>
      <PredecessorLink><PredecessorUID>9</PredecessorUID><Type>1</Type></PredecessorLink></Task>
    <Task><UID>3</UID><ID>3</ID><IsNull>1</IsNull></Task>
    <Task><UID>4</UID><ID>4</ID><Name>Blocos</Name><OutlineNumber>1.2</OutlineNumber><OutlineLevel>2</OutlineLevel>
      <Start>2026-11-18T08:00:00</Start><Finish>2026-12-10T17:00:00</Finish><Cost>6150050</Cost></Task>
  </Tasks>
</Project>`;

  it('lê tarefas, níveis, datas e custo (em centavos no XML)', () => {
    const r = lerMsProjectXml(xml);
    expect(r.nomeProjeto).toBe('Residencial Aurora');
    expect(r.itens.map((i) => `${i.codigo_externo} ${i.tipo} ${i.nome}`)).toEqual([
      '1 etapa Fundações & contenções',
      '1.1 tarefa Estacas',
      '1.2 tarefa Blocos',
    ]);
    const estacas = r.itens[1]!;
    expect(estacas).toMatchObject({ inicio_previsto: '2026-11-03', fim_previsto: '2026-11-20', custo_previsto: 48000 });
    expect(r.resumo.custoTotal).toBe(109500.5);
    expect(r.problemas).toEqual([]);
  });

  it('recusa XML que não é do MS Project', () => {
    const r = lerMsProjectXml('<?xml version="1.0"?><nota>oi</nota>');
    expect(r.problemas[0]!.gravidade).toBe('erro');
  });
});
