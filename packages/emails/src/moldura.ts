import { cru, html, type Seguro } from './html';

// Tokens de `apps/web/src/app/globals.css`: claro e limpo, legível no sol do canteiro.
export const COR = {
  papel: '#ffffff',
  concreto: '#f3f4f6',
  grafite: '#1a1d21',
  regua: '#5f6670',
  linha: '#e3e5e8',
  cianotipia: '#2346a0',
  cianotipiaClaro: '#e8edf8',
  marcador: '#b9461a',
  marcadorClaro: '#fbeee7',
  ok: '#2f7d4f',
  atencao: '#8a5a00',
  atencaoClaro: '#fdf3dc',
} as const;

const FONTE = "'Archivo', 'Segoe UI', Helvetica, Arial, sans-serif";
const TEXTO = `font-family:${FONTE};color:${COR.grafite};`;

export const NOME_PRODUTO = 'Controle de Obras';

export function titulo(texto: Seguro | string): Seguro {
  return html`<h1 class="titulo" style="margin:0 0 16px;${cru(TEXTO)}font-size:24px;line-height:30px;font-weight:600;">${texto}</h1>`;
}

export function paragrafo(conteudo: Seguro | string, discreto = false): Seguro {
  const cor = discreto ? `color:${COR.regua};font-size:14px;line-height:21px;` : 'font-size:16px;line-height:24px;';
  return html`<p style="margin:0 0 16px;${cru(TEXTO)}${cru(cor)}">${conteudo}</p>`;
}

export function forte(texto: Seguro | string): Seguro {
  return html`<strong style="font-weight:600;color:${COR.grafite};">${texto}</strong>`;
}

/** Botão que o Outlook também desenha: a cor fica na célula, o clique no link. */
export function botao(rotulo: string, url: Seguro | string): Seguro {
  return html`<table role="presentation" border="0" cellpadding="0" cellspacing="0" style="margin:8px 0 24px;">
<tr><td align="center" bgcolor="${COR.cianotipia}" style="border-radius:6px;background-color:${COR.cianotipia};">
<a href="${url}" target="_blank" style="display:inline-block;padding:14px 24px;font-family:${cru(FONTE)};font-size:16px;line-height:20px;font-weight:600;color:#ffffff;text-decoration:none;border-radius:6px;border:1px solid ${COR.cianotipia};">${rotulo}</a>
</td></tr></table>`;
}

/** O endereço por extenso, para quando o botão não abre (alguns leitores corporativos bloqueiam). */
export function reserva(url: Seguro | string): Seguro {
  return html`<p style="margin:0 0 8px;font-family:${cru(FONTE)};font-size:13px;line-height:19px;color:${COR.regua};">Se o botão não abrir, copie este endereço no navegador:</p>
<p style="margin:0 0 20px;font-family:${cru(FONTE)};font-size:13px;line-height:19px;word-break:break-all;"><a href="${url}" target="_blank" style="color:${COR.cianotipia};text-decoration:underline;">${url}</a></p>`;
}

/** Quadro cinza com pares "rótulo: valor" (obra, papel, quem convidou). */
export function quadro(linhas: [string, Seguro | string][]): Seguro {
  const corpo = linhas.map(
    ([rotulo, valor], i) => html`<tr>
<td style="padding:${i === 0 ? '14px' : '4px'} 16px ${i === linhas.length - 1 ? '14px' : '4px'};font-family:${cru(FONTE)};font-size:14px;line-height:20px;color:${COR.regua};white-space:nowrap;vertical-align:top;width:1%;padding-right:24px;">${rotulo}</td>
<td style="padding:${i === 0 ? '14px' : '4px'} 16px ${i === linhas.length - 1 ? '14px' : '4px'} 0;font-family:${cru(FONTE)};font-size:14px;line-height:20px;color:${COR.grafite};font-weight:600;vertical-align:top;">${valor}</td>
</tr>`,
  );
  return html`<table role="presentation" width="100%" border="0" cellpadding="0" cellspacing="0" bgcolor="${COR.concreto}" style="margin:4px 0 24px;background-color:${COR.concreto};border-radius:6px;">${corpo}</table>`;
}

/** Código numérico grande, com algarismos espaçados. */
export function codigo(valor: Seguro | string): Seguro {
  return html`<table role="presentation" width="100%" border="0" cellpadding="0" cellspacing="0" style="margin:4px 0 24px;">
<tr><td align="center" bgcolor="${COR.concreto}" style="padding:20px 16px;background-color:${COR.concreto};border-radius:6px;font-family:'SFMono-Regular',Consolas,'Liberation Mono',Menlo,monospace;font-size:32px;line-height:38px;font-weight:600;letter-spacing:8px;padding-left:24px;color:${COR.grafite};">${valor}</td></tr></table>`;
}

/**
 * A régua de prazo do app em miniatura: barra de 6px cortada em meses, com o trecho decorrido em cianotipia.
 * Só células com cor de fundo, que todo cliente de e-mail desenha.
 */
export function regua(decorrido = 0.62, cor: string = COR.cianotipia): Seguro {
  const meses = 12;
  const cheios = Math.round(Math.min(1, Math.max(0, decorrido)) * meses);
  const celulas: Seguro[] = [];
  for (let i = 0; i < meses; i++) {
    const fundo = i < cheios ? cor : COR.linha;
    const canto = i === 0 ? 'border-radius:3px 0 0 3px;' : i === meses - 1 ? 'border-radius:0 3px 3px 0;' : '';
    if (i > 0) celulas.push(html`<td width="2" style="width:2px;font-size:0;line-height:0;" bgcolor="${COR.papel}">&nbsp;</td>`);
    celulas.push(html`<td bgcolor="${fundo}" style="height:6px;font-size:0;line-height:0;background-color:${fundo};${cru(canto)}">&nbsp;</td>`);
  }
  return html`<table role="presentation" width="100%" border="0" cellpadding="0" cellspacing="0" style="margin:0 0 28px;height:6px;"><tr>${celulas}</tr></table>`;
}

export type Moldura = {
  /** Endereço do site (`https://...`) ou o marcador `{{ .SiteURL }}` nos modelos do Supabase. */
  base: Seguro | string;
  titulo: string;
  /** Primeira linha que o leitor de e-mail mostra na lista, antes de abrir. */
  previa: Seguro | string;
  conteudo: Seguro;
  /** Por que a pessoa recebeu (rodapé). */
  motivo: Seguro | string;
  decorrido?: number;
};

export function moldura(m: Moldura): Seguro {
  // Espaços invisíveis depois da prévia: impedem o leitor de completar a linha com o começo do texto.
  const enchimento = cru('&#847;&zwnj;&nbsp;'.repeat(40));
  return html`<!doctype html>
<html lang="pt-BR" xmlns="http://www.w3.org/1999/xhtml">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="x-apple-disable-message-reformatting">
<meta name="color-scheme" content="light">
<meta name="supported-color-schemes" content="light">
<title>${m.titulo}</title>
<link href="https://fonts.googleapis.com/css2?family=Archivo:wght@400;600&amp;display=swap" rel="stylesheet">
<style>
  body { margin: 0; padding: 0; width: 100% !important; -webkit-text-size-adjust: 100%; }
  a { color: ${cru(COR.cianotipia)}; }
  @media (max-width: 600px) {
    .cartao { padding: 28px 20px 24px !important; }
    .titulo { font-size: 22px !important; line-height: 28px !important; }
  }
</style>
</head>
<body style="margin:0;padding:0;background-color:${COR.concreto};">
<div style="display:none;max-height:0;max-width:0;overflow:hidden;opacity:0;mso-hide:all;font-size:1px;line-height:1px;color:${COR.concreto};">${m.previa}${enchimento}</div>
<table role="presentation" width="100%" border="0" cellpadding="0" cellspacing="0" bgcolor="${COR.concreto}" style="background-color:${COR.concreto};">
<tr><td align="center" style="padding:32px 12px 40px;">
<table role="presentation" width="100%" border="0" cellpadding="0" cellspacing="0" style="max-width:560px;">
<tr><td style="padding:0 8px 16px;">
<table role="presentation" border="0" cellpadding="0" cellspacing="0"><tr>
<td style="padding-right:10px;vertical-align:middle;"><img src="${m.base}/email/logo.png" width="32" height="32" alt="" style="display:block;border:0;border-radius:8px;"></td>
<td style="vertical-align:middle;font-family:${cru(FONTE)};font-size:17px;line-height:22px;font-weight:600;color:${COR.grafite};">${NOME_PRODUTO}</td>
</tr></table>
</td></tr>
<tr><td class="cartao" bgcolor="${COR.papel}" style="background-color:${COR.papel};border:1px solid ${COR.linha};border-radius:10px;padding:32px 32px 24px;">
${regua(m.decorrido)}
${m.conteudo}
</td></tr>
<tr><td style="padding:20px 8px 0;font-family:${cru(FONTE)};font-size:13px;line-height:19px;color:${COR.regua};">
<p style="margin:0 0 8px;">${m.motivo}</p>
<p style="margin:0;">${NOME_PRODUTO} · cronograma, campo, almoxarifado e custos da obra num lugar só.</p>
</td></tr>
</table>
</td></tr>
</table>
</body>
</html>`;
}

/** Texto puro que acompanha o HTML (leitores sem HTML e filtros de spam gostam). */
export function textoPuro(linhas: (string | false | null | undefined)[]): string {
  return [...linhas.filter((l): l is string => typeof l === 'string'), '', `— ${NOME_PRODUTO}`].join('\n');
}
