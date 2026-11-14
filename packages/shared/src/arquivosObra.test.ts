import { describe, expect, it } from 'vitest';
import {
  abreNoNavegador,
  agruparVersoes,
  arquivoAuxiliar,
  arquivoEditadoSchema,
  categoriaPeloNome,
  compararNomesArquivo,
  extensaoDoArquivo,
  extensaoPermitida,
  formatarTamanho,
  LIMITE_ARQUIVO_BYTES,
  nomeSeguroArquivo,
  problemaDoArquivo,
  tipoDoArquivo,
} from './arquivosObra';

describe('arquivos da obra', () => {
  it('reconhece projeto, PDF, planilha e recusa executável', () => {
    expect(tipoDoArquivo('Planta Baixa.DWG')).toBe('cad');
    expect(tipoDoArquivo('modelo.ifc')).toBe('cad');
    expect(tipoDoArquivo('alvara.pdf')).toBe('pdf');
    expect(tipoDoArquivo('orcamento.xlsx')).toBe('planilha');
    expect(extensaoDoArquivo('sem-extensao')).toBeNull();
    expect(extensaoPermitida('virus.exe')).toBe(false);
    expect(extensaoPermitida('pagina.html')).toBe(false);
    expect(extensaoPermitida('arquivos.7z')).toBe(true);
  });

  it('só PDF e imagem abrem no navegador', () => {
    expect(abreNoNavegador('a.pdf')).toBe(true);
    expect(abreNoNavegador('a.dwg')).toBe(false);
  });

  it('gera nome seguro para o Storage, mantendo a extensão', () => {
    expect(nomeSeguroArquivo('Planta Baixa – Térreo (rev. 02).DWG')).toBe('planta-baixa-terreo-rev.-02.dwg');
    expect(nomeSeguroArquivo('../../segredo.pdf')).toBe('segredo.pdf');
    expect(nomeSeguroArquivo('Obra - ARQ 01-24 - Carimbado.pdf')).toBe('obra-arq-01-24-carimbado.pdf');
    expect(nomeSeguroArquivo('ção.pdf')).toBe('cao.pdf');
    expect(nomeSeguroArquivo('###.pdf')).toBe('arquivo.pdf');
  });

  it('formata tamanho em B, KB e MB', () => {
    expect(formatarTamanho(512)).toBe('512 B');
    expect(formatarTamanho(2048)).toBe('2 KB');
    expect(formatarTamanho(3.5 * 1024 * 1024)).toBe('3,5 MB');
    expect(formatarTamanho(25 * 1024 * 1024)).toBe('25 MB');
  });

  it('aponta o problema antes de enviar', () => {
    expect(problemaDoArquivo({ name: 'a.dwg', size: 1000 })).toBeNull();
    expect(problemaDoArquivo({ name: 'a.exe', size: 1000 })).toContain('tipo não aceito');
    expect(problemaDoArquivo({ name: 'a.pdf', size: 0 })).toContain('vazio');
    expect(problemaDoArquivo({ name: 'a.pdf', size: LIMITE_ARQUIVO_BYTES + 1 })).toContain('50 MB');
  });

  it('pasta inteira do projeto aprovado: sobras do AutoCAD ficam de fora, o resto entra na pasta certa', () => {
    // Os nomes de uma pasta real: 24 pranchas, a carimbada, o esgoto, dois DWG, a cópia .bak e o plot.log.
    const pranchas = Array.from({ length: 24 }, (_, i) => `Obra - ARQ ${String(i + 1).padStart(2, '0')}-24.pdf`);
    const pasta = [
      ...pranchas,
      'Obra - ARQ 01-24 - Carimbado.pdf',
      'Obra - ESG 01.pdf',
      'Obra - Projeto Arquitetônico.dwg',
      'Obra - Projeto Arquitetônico Aprovado.dwg',
      'Obra - Projeto Arquitetônico Aprovado.bak',
      'plot.log',
    ].map((name) => ({ name, size: 1000 }));
    const entram = pasta.filter((a) => problemaDoArquivo(a) === null);
    expect(entram).toHaveLength(28);
    expect(pasta.filter((a) => arquivoAuxiliar(a.name)).map((a) => a.name)).toEqual(['Obra - Projeto Arquitetônico Aprovado.bak', 'plot.log']);
    expect(problemaDoArquivo({ name: 'plot.log', size: 513 })).toContain('Não precisa ir para a obra');
    expect(entram.filter((a) => categoriaPeloNome(a.name) === 'arquitetonico')).toHaveLength(27);
    expect(categoriaPeloNome('Obra - ESG 01.pdf')).toBe('hidrossanitario');
  });

  it('sugere a pasta pela sigla ou pela palavra do nome', () => {
    expect(categoriaPeloNome('EST 02 - Formas do térreo.dwg')).toBe('estrutural');
    expect(categoriaPeloNome('ele-03_quadros.pdf')).toBe('eletrico');
    expect(categoriaPeloNome('Projeto Hidrossanitário rev02.pdf')).toBe('hidrossanitario');
    expect(categoriaPeloNome('PPCI aprovado.pdf')).toBe('outros_projetos');
    expect(categoriaPeloNome('Alvará de construção.pdf')).toBe('legalizacao');
    expect(categoriaPeloNome('Contrato empreiteira.docx')).toBe('contrato');
    expect(categoriaPeloNome('Orçamento esquadrias.xlsx')).toBe('orcamento');
    // Sigla dentro de outra palavra não conta; sem pista, quem decide é a pasta escolhida na tela.
    expect(categoriaPeloNome('Restaurante.pdf')).toBeNull();
    expect(categoriaPeloNome('foto 12.jpg')).toBeNull();
  });

  it('ordena as pranchas pelo nome, com número valendo como número', () => {
    const nomes = ['Obra - ARQ 10-24.pdf', 'Obra - ARQ 2-24.pdf', 'obra - arq 1-24.pdf'];
    expect([...nomes].sort(compararNomesArquivo)).toEqual(['obra - arq 1-24.pdf', 'Obra - ARQ 2-24.pdf', 'Obra - ARQ 10-24.pdf']);
  });

  it('valida a edição', () => {
    expect(arquivoEditadoSchema.safeParse({ nome: 'Planta.dwg', categoria: 'arquitetonico', descricao: '' }).data?.descricao).toBeNull();
    expect(arquivoEditadoSchema.safeParse({ nome: ' ', categoria: 'arquitetonico' }).success).toBe(false);
    expect(arquivoEditadoSchema.safeParse({ nome: 'a.pdf', categoria: 'qualquer' }).success).toBe(false);
  });

  it('agrupa as versões: a maior é a vigente, as outras ficam no histórico', () => {
    const v = (id: string, doc: string, versao: number, criado: string) => ({
      id, projeto_id: 'p', documento_id: doc, versao, categoria: 'arquitetonico' as const, nome: `${id}.dwg`, descricao: null,
      caminho: id, tamanho: 1, tipo_mime: null, enviado_nome: null, criado_em: criado,
    });
    const docs = agruparVersoes([v('a1', 'a1', 1, '2026-11-01'), v('b1', 'b1', 1, '2026-11-02'), v('a3', 'a1', 3, '2026-11-05'), v('a2', 'a1', 2, '2026-11-03')]);
    expect(docs.map((d) => d.atual.id)).toEqual(['a3', 'b1']);
    expect(docs[0]!.anteriores.map((a) => a.versao)).toEqual([2, 1]);
    expect(docs[1]!.anteriores).toEqual([]);
  });
});
