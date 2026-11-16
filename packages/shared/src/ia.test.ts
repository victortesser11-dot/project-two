import { describe, expect, it } from 'vitest';
import {
  conferirSugestoes,
  extrairJson,
  leituraArquivosSchema,
  leituraFotosSchema,
  mimeParaIa,
  pedidoLeituraArquivos,
  pedidoLeituraFotos,
  resumoDaEap,
  tarefasDaLeitura,
} from './ia';

describe('IA: o que vai para o modelo', () => {
  it('só PDF e imagem vão para a IA', () => {
    expect(mimeParaIa('Napoles - ARQ 01-24.PDF')).toBe('application/pdf');
    expect(mimeParaIa('foto.jpeg')).toBe('image/jpeg');
    expect(mimeParaIa('Projeto Arquitetônico.dwg')).toBeNull();
    expect(mimeParaIa('orcamento.xlsx')).toBeNull();
  });

  it('o cronograma vai sem repetir os serviços de cada pavimento', () => {
    const r = resumoDaEap([
      { tipo: 'etapa', nome: 'Torre A', nivel: 1 },
      { tipo: 'etapa', nome: 'Torre A Térreo', nivel: 2 },
      { tipo: 'tarefa', nome: 'Alv - Alvenaria lado 1', nivel: 3 },
      { tipo: 'etapa', nome: 'Torre A 2º Pavimento', nivel: 2 },
      { tipo: 'tarefa', nome: 'Alv - Alvenaria lado 1', nivel: 3 },
      { tipo: 'tarefa', nome: 'ALV - alvenaria  lado 1', nivel: 3 },
      { tipo: 'tarefa', nome: 'Est - Laje lado 1', nivel: 3 },
    ]);
    expect(r).toEqual({ etapas: ['Torre A', 'Torre A Térreo', 'Torre A 2º Pavimento'], tarefas: ['Alv - Alvenaria lado 1', 'Est - Laje lado 1'], cortadas: 0 });
  });

  it('o pedido dos arquivos lista anexos, documentos e cronograma', () => {
    const p = pedidoLeituraArquivos({
      obra: { nome: 'Napoles', endereco: 'Av. Santos Ferreira, 4200 - Canoas/RS' },
      arquivos: [{ nome: 'ARQ 01-24.pdf', pasta: 'Projeto arquitetônico' }],
      documentos: [{ nome: 'ARQ 01-24.pdf', pasta: 'Projeto arquitetônico' }, { nome: 'ESG 01.pdf', pasta: 'Projeto hidrossanitário' }],
      eap: { etapas: ['Torre A'], tarefas: ['Alv - Alvenaria lado 1'], cortadas: 3 },
    });
    expect(p).toContain('"Napoles" (Av. Santos Ferreira, 4200 - Canoas/RS)');
    expect(p).toContain('1. ARQ 01-24.pdf (Projeto arquitetônico)');
    expect(p).toContain('- ESG 01.pdf (Projeto hidrossanitário)');
    expect(p).toContain('mais 3 não listadas');
    expect(p).toContain('NÃO aparecem no cronograma atual');
  });

  it('o pedido das fotos troca o id da tarefa por T1, T2', () => {
    const p = pedidoLeituraFotos({
      obra: 'Napoles',
      data: '2026-11-16',
      tarefas: [
        { id: 'u1', codigo: '1.4.4', nome: 'Alv - Alvenaria lado 2', etapa: 'Torre A 4º Pavimento', percentual: 60 },
        { id: 'u2', codigo: '1.4.6', nome: 'Est - Laje lado 2', etapa: 'Torre A 4º Pavimento', percentual: 0 },
      ],
      fotos: [{ legenda: 'Alvenaria do 4º', tarefaId: 'u1' }, { legenda: null, tarefaId: null }],
    });
    expect(p).toContain('16/11/2026');
    expect(p).toContain('T1 — 1.4.4 Alv - Alvenaria lado 2 (Torre A 4º Pavimento) — 60% feito');
    expect(p).toContain('Foto 1: legenda "Alvenaria do 4º", marcada na tarefa T1');
    expect(p).toContain('Foto 2\n');
    expect(p).not.toContain('u1');
  });
});

describe('IA: o que volta do modelo', () => {
  it('acha o JSON mesmo embrulhado em bloco de código ou com frase antes', () => {
    expect(extrairJson('```json\n{"a": 1}\n```')).toEqual({ a: 1 });
    expect(extrairJson('Aqui está: {"a": 2} pronto')).toEqual({ a: 2 });
    expect(extrairJson('sem json')).toBeNull();
  });

  it('leitura dos arquivos aguenta campo faltando, tipo trocado e lixo na lista', () => {
    const r = leituraArquivosSchema.parse({
      resumo: 'Residencial MCMV com 3 torres',
      dados_obra: { area_construida_m2: '17.923,63', pavimentos: 'Térreo + 6', unidades: 252 },
      tarefas: [
        { etapa: 'Infraestrutura externa', nome: 'Piscina', unidade: 'un', quantidade: '1', motivo: 'ARQ 01 mostra piscina', arquivo: 'ARQ 01-24.pdf' },
        { etapa: 'X', nome: '' },
        'lixo',
      ],
      faltando: [
        { tipo: 'documento', descricao: 'Projeto estrutural', importancia: 'alta' },
        { tipo: 'outro', descricao: 'CEP da obra', importancia: 'urgente' },
      ],
    });
    expect(r.dados_obra).toEqual({ tipo: null, endereco: null, area_construida_m2: 17923.63, area_terreno_m2: null, pavimentos: 'Térreo + 6', unidades: '252' });
    expect(r.tarefas).toEqual([
      { etapa: 'Infraestrutura externa', nome: 'Piscina', unidade: 'un', quantidade: 1, motivo: 'ARQ 01 mostra piscina', arquivo: 'ARQ 01-24.pdf' },
    ]);
    expect(r.faltando).toEqual([
      { tipo: 'documento', descricao: 'Projeto estrutural', importancia: 'alta' },
      { tipo: 'informacao', descricao: 'CEP da obra', importancia: 'media' },
    ]);
    expect(r.sugestoes).toEqual([]);
    expect(leituraArquivosSchema.parse({}).tarefas).toEqual([]);
  });

  it('sugestão que já está no cronograma vem marcada; etapa existente é achada pelo nome', () => {
    const eap = [
      { id: 'e1', tipo: 'etapa' as const, nome: 'Infraestrutura externa', nivel: 1 },
      { id: 't1', tipo: 'tarefa' as const, nome: 'Muro de alvenaria', nivel: 2 },
    ];
    const s = (etapa: string, nome: string) => ({ etapa, nome, unidade: null, quantidade: null, motivo: '', arquivo: null });
    const r = conferirSugestoes([s('INFRAESTRUTURA EXTERNA', 'Muro de Alvenaria'), s('Infraestrutura externa', 'Piscina'), s('Lazer', 'Quiosques'), s('Lazer', 'Quiosques'), s('', 'Bicicletário')], eap);
    expect(r.map((x) => [x.nome, x.jaExiste, x.etapaExistente?.id ?? null, x.etapa])).toEqual([
      ['Muro de Alvenaria', true, 'e1', 'INFRAESTRUTURA EXTERNA'],
      ['Piscina', false, 'e1', 'Infraestrutura externa'],
      ['Quiosques', false, null, 'Lazer'],
      ['Quiosques', true, null, 'Lazer'],
      ['Bicicletário', false, null, 'Sugeridas pela IA'],
    ]);
  });

  it('leitura das fotos: referência inventada some, tarefa esquecida vira "não aparece", avanço não volta', () => {
    const leitura = leituraFotosSchema.parse({
      resumo: 'Alvenaria do 4º pavimento em andamento',
      tarefas: [
        { ref: 't1', situacao: 'avancou', percentual_sugerido: 80.4, evidencia: 'Foto 1: fiadas novas' },
        { ref: 'T2', situacao: 'avancou', percentual_sugerido: 10, evidencia: 'Foto 2' },
        { ref: 'T9', situacao: 'concluida', percentual_sugerido: 100 },
      ],
      pessoas: '7',
      maquinas: ['Betoneira'],
      riscos: ['Operário sem capacete na Foto 2'],
    });
    expect(leitura.pessoas).toBe(7);
    const tarefas = [
      { id: 'u1', codigo: '1.4.4', nome: 'Alvenaria', etapa: null, percentual: 60 },
      { id: 'u2', codigo: '1.4.5', nome: 'Graute', etapa: null, percentual: 30 },
      { id: 'u3', codigo: '1.4.6', nome: 'Laje', etapa: null, percentual: 0 },
    ];
    expect(tarefasDaLeitura(leitura, tarefas).map((t) => [t.tarefa.id, t.situacao, t.percentual_sugerido])).toEqual([
      ['u1', 'avancou', 80],
      ['u2', 'avancou', 30],
      ['u3', 'nao_visivel', null],
    ]);
  });
});
