import { describe, expect, it } from 'vitest';
import {
  abreNoNavegador,
  arquivoEditadoSchema,
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

  it('valida a edição', () => {
    expect(arquivoEditadoSchema.safeParse({ nome: 'Planta.dwg', categoria: 'arquitetonico', descricao: '' }).data?.descricao).toBeNull();
    expect(arquivoEditadoSchema.safeParse({ nome: ' ', categoria: 'arquitetonico' }).success).toBe(false);
    expect(arquivoEditadoSchema.safeParse({ nome: 'a.pdf', categoria: 'qualquer' }).success).toBe(false);
  });
});
