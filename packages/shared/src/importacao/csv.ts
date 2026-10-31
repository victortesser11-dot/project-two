import type { SeparadorDecimal } from './valores';

export type SeparadorCsv = ';' | ',' | '\t';

export interface Csv {
  linhas: string[][];
  separador: SeparadorCsv;
  /** Excel brasileiro salva CSV com ";" e vírgula decimal. */
  decimal: SeparadorDecimal;
}

/** Conta separadores fora de aspas em cada linha (amostra do começo do arquivo). */
function contarPorLinha(texto: string, separador: SeparadorCsv, maxLinhas = 15): number[] {
  const contagens: number[] = [];
  let atual = 0;
  let aspas = false;
  for (let i = 0; i < texto.length && contagens.length < maxLinhas; i++) {
    const c = texto[i];
    if (c === '"') aspas = !aspas;
    else if (!aspas && c === separador) atual++;
    else if (!aspas && c === '\n') {
      contagens.push(atual);
      atual = 0;
    }
  }
  if (contagens.length < maxLinhas && atual > 0) contagens.push(atual);
  return contagens;
}

/** Escolhe o separador que aparece com a mesma contagem no maior número de linhas. */
export function detectarSeparador(texto: string): SeparadorCsv {
  let melhor: { sep: SeparadorCsv; nota: number } = { sep: ';', nota: -1 };
  for (const sep of ['\t', ';', ','] as const) {
    const contagens = contarPorLinha(texto, sep).filter((n) => n > 0);
    if (contagens.length === 0) continue;
    const frequencia = new Map<number, number>();
    for (const n of contagens) frequencia.set(n, (frequencia.get(n) ?? 0) + 1);
    const nota = Math.max(...frequencia.values());
    if (nota > melhor.nota) melhor = { sep, nota };
  }
  return melhor.sep;
}

/**
 * Lê CSV seguindo a RFC 4180: campos entre aspas podem ter separador, quebra
 * de linha e aspas duplicadas ("").
 */
export function lerCsv(conteudo: string, separador?: SeparadorCsv): Csv {
  const texto = conteudo.replace(/^﻿/, '').replace(/\r\n?/g, '\n');
  const sep = separador ?? detectarSeparador(texto);

  const linhas: string[][] = [];
  let linha: string[] = [];
  let campo = '';
  let aspas = false;

  for (let i = 0; i < texto.length; i++) {
    const c = texto[i]!;
    if (aspas) {
      if (c === '"') {
        if (texto[i + 1] === '"') {
          campo += '"';
          i++;
        } else {
          aspas = false;
        }
      } else {
        campo += c;
      }
      continue;
    }
    if (c === '"' && campo === '') aspas = true;
    else if (c === sep) {
      linha.push(campo);
      campo = '';
    } else if (c === '\n') {
      linha.push(campo);
      linhas.push(linha);
      linha = [];
      campo = '';
    } else {
      campo += c;
    }
  }
  if (campo !== '' || linha.length > 0) {
    linha.push(campo);
    linhas.push(linha);
  }

  // remove linhas vazias do fim
  while (linhas.length > 0 && linhas[linhas.length - 1]!.every((c) => c.trim() === '')) linhas.pop();

  return { linhas, separador: sep, decimal: sep === ';' ? ',' : sep === ',' ? '.' : 'auto' };
}

/**
 * Decodifica bytes de um CSV: tenta UTF-8 e, se falhar, Windows-1252
 * (padrão do Excel em português ao salvar "CSV (separado por vírgulas)").
 */
export function decodificarTexto(bytes: ArrayBuffer | Uint8Array): string {
  const dados = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(dados);
  } catch {
    return new TextDecoder('windows-1252').decode(dados);
  }
}
