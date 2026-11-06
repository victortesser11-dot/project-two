import { z } from 'zod';

// Arquivos da obra (projetos, legalização, contratos). Espelha o enum categoria_arquivo e
// app.extensao_arquivo_permitida do banco: mudou um, muda o outro.

export const CATEGORIAS_ARQUIVO = [
  'arquitetonico',
  'estrutural',
  'eletrico',
  'hidrossanitario',
  'outros_projetos',
  'legalizacao',
  'contrato',
  'orcamento',
  'outros',
] as const;
export type CategoriaArquivo = (typeof CATEGORIAS_ARQUIVO)[number];

export const ROTULO_CATEGORIA_ARQUIVO: Record<CategoriaArquivo, string> = {
  arquitetonico: 'Projeto arquitetônico',
  estrutural: 'Projeto estrutural',
  eletrico: 'Projeto elétrico',
  hidrossanitario: 'Projeto hidrossanitário',
  outros_projetos: 'Outros projetos',
  legalizacao: 'Legalização (alvará, ART, habite-se)',
  contrato: 'Contratos',
  orcamento: 'Orçamentos e propostas',
  outros: 'Outros',
};

/** 50 MB: limite do Storage no plano grátis (e do check no banco). */
export const LIMITE_ARQUIVO_BYTES = 50 * 1024 * 1024;

export type TipoArquivo = 'cad' | 'pdf' | 'imagem' | 'planilha' | 'documento' | 'compactado' | 'outro';

const TIPO_POR_EXTENSAO: Record<string, TipoArquivo> = {
  dwg: 'cad', dxf: 'cad', dwf: 'cad', rvt: 'cad', rfa: 'cad', ifc: 'cad', skp: 'cad', nwd: 'cad', nwc: 'cad', pln: 'cad',
  pdf: 'pdf',
  jpg: 'imagem', jpeg: 'imagem', png: 'imagem', webp: 'imagem', heic: 'imagem',
  xlsx: 'planilha', xls: 'planilha', csv: 'planilha', ods: 'planilha', mpp: 'planilha',
  docx: 'documento', doc: 'documento', odt: 'documento', pptx: 'documento', txt: 'documento', xml: 'documento',
  zip: 'compactado', rar: 'compactado', '7z': 'compactado', kmz: 'compactado', kml: 'outro',
};

/** Extensões aceitas (a mesma lista do banco). */
export const EXTENSOES_ARQUIVO = Object.keys(TIPO_POR_EXTENSAO);

/** Para o campo <input type="file" accept>. */
export const ACEITA_ARQUIVO = EXTENSOES_ARQUIVO.map((e) => `.${e}`).join(',');

export function extensaoDoArquivo(nome: string): string | null {
  const m = /\.([A-Za-z0-9]{1,5})$/.exec(nome.trim());
  return m ? m[1]!.toLowerCase() : null;
}

export function tipoDoArquivo(nome: string): TipoArquivo {
  const ext = extensaoDoArquivo(nome);
  return (ext && TIPO_POR_EXTENSAO[ext]) || 'outro';
}

export function extensaoPermitida(nome: string): boolean {
  const ext = extensaoDoArquivo(nome);
  return ext !== null && ext in TIPO_POR_EXTENSAO;
}

/** O navegador mostra direto (PDF e imagem comum); o resto é para baixar. */
export function abreNoNavegador(nome: string): boolean {
  const ext = extensaoDoArquivo(nome);
  return ext === 'pdf' || ext === 'jpg' || ext === 'jpeg' || ext === 'png' || ext === 'webp';
}

/** Nome para o caminho no Storage: sem acento, espaço vira hífen, só letras, números, ponto, hífen e sublinhado. */
export function nomeSeguroArquivo(nome: string): string {
  const ext = extensaoDoArquivo(nome);
  const base = (ext ? nome.trim().slice(0, -(ext.length + 1)) : nome.trim())
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^A-Za-z0-9._-]+/g, '-')
    .replace(/\.{2,}/g, '.')
    .replace(/^[-.]+|[-.]+$/g, '')
    .toLowerCase()
    .slice(0, 80);
  return `${base || 'arquivo'}${ext ? `.${ext}` : ''}`;
}

export function formatarTamanho(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  const kb = bytes / 1024;
  if (kb < 1024) return `${Math.round(kb)} KB`;
  const mb = kb / 1024;
  return `${mb.toLocaleString('pt-BR', { maximumFractionDigits: mb < 10 ? 1 : 0 })} MB`;
}

/** Problema do arquivo antes de enviar (null = pode enviar). */
export function problemaDoArquivo(arquivo: { name: string; size: number }): string | null {
  if (!extensaoPermitida(arquivo.name)) {
    return `${arquivo.name}: tipo não aceito. Envie projeto (DWG, PDF, IFC, RVT, SKP), imagem, planilha, documento ou ZIP.`;
  }
  if (arquivo.size <= 0) return `${arquivo.name}: o arquivo está vazio.`;
  if (arquivo.size > LIMITE_ARQUIVO_BYTES) return `${arquivo.name}: passa de 50 MB. Compacte em ZIP ou divida em partes.`;
  return null;
}

export const arquivoEditadoSchema = z.object({
  nome: z.string().trim().min(1, 'Dê um nome ao arquivo').max(200, 'Use no máximo 200 caracteres'),
  categoria: z.enum(CATEGORIAS_ARQUIVO, { message: 'Escolha a pasta' }),
  descricao: z.string().trim().max(500, 'Use no máximo 500 caracteres').optional().transform((v) => v || null),
});

export interface ArquivoObra {
  id: string;
  projeto_id: string;
  categoria: CategoriaArquivo;
  nome: string;
  descricao: string | null;
  caminho: string;
  tamanho: number;
  tipo_mime: string | null;
  enviado_nome: string | null;
  criado_em: string;
}
