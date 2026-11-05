// HTML de e-mail montado à mão, sem dependências: roda na Vercel, numa função de borda (Deno) e gera os
// modelos do Supabase. Segue o que funciona em Gmail, Outlook e Apple Mail (o mesmo que o React Email faz):
// tabelas para o layout, estilos inline, largura máxima de 560px e botão "à prova de Outlook".

/** Trecho de HTML já montado (não é escapado de novo). */
export class Seguro {
  constructor(readonly valor: string) {}
  toString() {
    return this.valor;
  }
}

const ENTIDADES: Record<string, string> = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };

export function escapar(texto: string): string {
  return texto.replace(/[&<>"']/g, (c) => ENTIDADES[c] ?? c);
}

/** HTML literal: use para os marcadores do Supabase (`{{ .SiteURL }}`) e trechos fixos. */
export function cru(html: string): Seguro {
  return new Seguro(html);
}

type Valor = Seguro | string | number | null | undefined | false | Valor[];

function emHtml(v: Valor): string {
  if (v instanceof Seguro) return v.valor;
  if (Array.isArray(v)) return v.map(emHtml).join('');
  if (v === null || v === undefined || v === false) return '';
  return escapar(String(v));
}

/** Modelo que escapa tudo o que é interpolado, exceto `Seguro`. Texto do usuário nunca vira marcação. */
export function html(partes: TemplateStringsArray, ...valores: Valor[]): Seguro {
  let saida = partes[0] ?? '';
  valores.forEach((v, i) => {
    saida += emHtml(v) + (partes[i + 1] ?? '');
  });
  return new Seguro(saida);
}
