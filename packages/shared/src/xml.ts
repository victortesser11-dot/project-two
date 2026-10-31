// Leitura simples de XML por expressões regulares (roda no navegador e no Node sem
// DOMParser). Serve para formatos conhecidos e bem-comportados, como o MSPDI do
// MS Project e a NF-e; não é um parser de XML genérico.

export function decodificarXml(texto: string): string {
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

/** Texto do primeiro <nome>…</nome> dentro do bloco (sem atributos na tag). */
export function campoXml(bloco: string, nome: string): string | null {
  const m = bloco.match(new RegExp(`<${nome}>([\\s\\S]*?)</${nome}>`));
  return m ? decodificarXml(m[1]!).trim() : null;
}

/** Conteúdo do primeiro <nome ...>…</nome> (a tag pode ter atributos). */
export function blocoXml(texto: string, nome: string): string | null {
  const m = texto.match(new RegExp(`<${nome}(?:\\s[^>]*)?>([\\s\\S]*?)</${nome}>`));
  return m ? m[1]! : null;
}

/** Todos os <nome ...>…</nome>, com os atributos da tag de abertura. */
export function blocosXml(texto: string, nome: string): { atributos: string; conteudo: string }[] {
  const re = new RegExp(`<${nome}(\\s[^>]*)?>([\\s\\S]*?)</${nome}>`, 'g');
  return [...texto.matchAll(re)].map((m) => ({ atributos: m[1] ?? '', conteudo: m[2]! }));
}

export function atributoXml(atributos: string, nome: string): string | null {
  const m = atributos.match(new RegExp(`\\b${nome}\\s*=\\s*"([^"]*)"`)) ?? atributos.match(new RegExp(`\\b${nome}\\s*=\\s*'([^']*)'`));
  return m ? decodificarXml(m[1]!) : null;
}

/** Remove prefixos de namespace (<nfe:det> vira <det>) e comentários. */
export function semPrefixos(texto: string): string {
  return texto.replace(/<!--[\s\S]*?-->/g, '').replace(/<(\/?)[A-Za-z_][\w.-]*:(?=[A-Za-z_])/g, '<$1');
}
