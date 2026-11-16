import 'server-only';
import type { Anexo } from '@/lib/ia';

// Prepara os anexos para o modelo: PDF grande ou escaneado não passa no leitor de arquivos dos provedores (o do
// OpenRouter recusa acima de alguns MB e só tira o texto). Aqui o servidor abre o PDF (unpdf, o PDF.js sem navegador),
// tira a camada de texto e desenha as primeiras páginas como imagem (@napi-rs/canvas). Prancha escaneada vira uma visão
// geral mais recortes em resolução maior, para o carimbo e as cotas ficarem legíveis. Foto grande é reduzida.

export type ParteIa =
  | { tipo: 'texto'; texto: string }
  | { tipo: 'imagem'; mime: string; dados: Uint8Array; nome: string };

/** Quantas imagens vão num pedido, somando todos os arquivos (cada imagem custa contexto do modelo). */
export const MAX_IMAGENS_PEDIDO = 8;
/** Recortes por prancha: os de mais conteúdo, sempre com o canto inferior direito (carimbo). Imagem demais deixa o modelo grátis lento. */
export const MAX_RECORTES_PRANCHA = 3;
const LADO_VISAO_GERAL = 1400;
const LADO_RECORTE = 1600;
/** Lado maior do desenho da prancha antes de recortar (~120 dpi numa A1): carimbo legível sem estourar a memória. */
const LADO_PRANCHA = 5000;
const LADO_FOTO = 2000;
const MAX_TEXTO_ARQUIVO = 15_000;
const MAX_PAGINAS_PDF = 3;
/** Página com lado maior que isto (em pontos; A2 tem 1684) é prancha de desenho. */
const PRANCHA_PONTOS = 1400;

type Canvas = typeof import('@napi-rs/canvas');
type Imagem = Awaited<ReturnType<Canvas['loadImage']>>;

let modulos: Promise<{ unpdf: typeof import('unpdf'); canvas: Canvas }> | null = null;
function carregar() {
  modulos ??= Promise.all([import('unpdf'), import('@napi-rs/canvas')]).then(([unpdf, canvas]) => ({ unpdf, canvas }));
  return modulos;
}

const nomeCurto = (nome: string) => nome.split('/').pop() || nome;

/** Desenha um pedaço da imagem (já girada, se for o caso) em JPEG de no máximo `lado` px. */
function recortar(c: Canvas, img: Imagem | InstanceType<Canvas['Canvas']>, sx: number, sy: number, sw: number, sh: number, lado: number): Uint8Array {
  const r = Math.min(1, lado / Math.max(sw, sh));
  const w = Math.max(1, Math.round(sw * r));
  const h = Math.max(1, Math.round(sh * r));
  const tela = c.createCanvas(w, h);
  const g = tela.getContext('2d');
  g.fillStyle = '#ffffff';
  g.fillRect(0, 0, w, h);
  g.drawImage(img as Imagem, sx, sy, sw, sh, 0, 0, w, h);
  return new Uint8Array(tela.toBuffer('image/jpeg', 82));
}

/** Gira 90° no sentido horário (prancha deitada que foi escaneada em pé: o carimbo volta para o canto inferior direito). */
function girarHorario(c: Canvas, img: Imagem) {
  const tela = c.createCanvas(img.height, img.width);
  const g = tela.getContext('2d');
  g.translate(img.height, 0);
  g.rotate(Math.PI / 2);
  g.drawImage(img, 0, 0);
  return tela;
}

async function prepararImagem(c: Canvas, a: Anexo): Promise<ParteIa> {
  if (a.dados.byteLength < 1_500_000) return { tipo: 'imagem', mime: a.mime, dados: a.dados, nome: a.nome };
  try {
    const img = await c.loadImage(Buffer.from(a.dados));
    return { tipo: 'imagem', mime: 'image/jpeg', dados: recortar(c, img, 0, 0, img.width, img.height, LADO_FOTO), nome: a.nome };
  } catch {
    // Formato que o canvas não abre (HEIC, por exemplo): vai como veio.
    return { tipo: 'imagem', mime: a.mime, dados: a.dados, nome: a.nome };
  }
}

async function prepararPdf(m: { unpdf: typeof import('unpdf'); canvas: Canvas }, a: Anexo, vagas: number): Promise<ParteIa[]> {
  const { unpdf, canvas: c } = m;
  const nome = nomeCurto(a.nome);
  const pdf = await unpdf.getDocumentProxy(new Uint8Array(a.dados));
  try {
    const partes: ParteIa[] = [];
    const { text } = await unpdf.extractText(pdf, { mergePages: true });
    const texto = text.replace(/[ \t]+/g, ' ').replace(/\n{3,}/g, '\n\n').trim();
    const escaneado = texto.replace(/\s/g, '').length < 50;
    if (!escaneado) {
      partes.push({
        tipo: 'texto',
        texto: `Texto de "${nome}" (camada de texto do PDF${texto.length > MAX_TEXTO_ARQUIVO ? ', cortado' : ''}):\n${texto.slice(0, MAX_TEXTO_ARQUIVO)}`,
      });
    }

    const paginas = Math.min(pdf.numPages, MAX_PAGINAS_PDF);
    for (let n = 1; n <= paginas && vagas > 0; n++) {
      const vp = (await pdf.getPage(n)).getViewport({ scale: 1 });
      const prancha = Math.max(vp.width, vp.height) > PRANCHA_PONTOS;
      // Recortes só na primeira página de prancha, e só se sobrar lugar para a visão geral e pelo menos 2 recortes.
      const comRecortes = prancha && n === 1 && vagas >= 3;
      const maxRecortes = Math.min(MAX_RECORTES_PRANCHA, vagas - 1);
      const lado = comRecortes ? LADO_PRANCHA : LADO_VISAO_GERAL * 1.25;
      const largura = Math.round(vp.width >= vp.height ? lado : (lado * vp.width) / vp.height);
      const png = await unpdf.renderPageAsImage(pdf, n, { canvasImport: () => Promise.resolve(c), width: largura, format: 'jpeg', quality: 0.92 });
      let img: Imagem | InstanceType<Canvas['Canvas']> = await c.loadImage(Buffer.from(png));
      let girada = false;
      if (escaneado && prancha && img.height > img.width * 1.3) {
        img = girarHorario(c, img as Imagem);
        girada = true;
      }
      const W = img.width;
      const H = img.height;
      partes.push({
        tipo: 'texto',
        texto: `Página ${n} de "${nome}"${escaneado ? ' (escaneada, sem texto)' : ''}${girada ? ', girada para ler o carimbo na horizontal' : ''}: visão geral.`,
      });
      partes.push({ tipo: 'imagem', mime: 'image/jpeg', dados: recortar(c, img, 0, 0, W, H, LADO_VISAO_GERAL), nome: `${nome} p${n}` });
      vagas--;

      if (comRecortes && maxRecortes > 0) {
        const colunas = Math.ceil(W / LADO_RECORTE);
        const linhas = Math.ceil(H / LADO_RECORTE);
        const cw = W / colunas;
        const ch = H / linhas;
        const todos: { l: number; k: number; dados: Uint8Array }[] = [];
        for (let l = 0; l < linhas; l++) {
          for (let k = 0; k < colunas; k++) todos.push({ l, k, dados: recortar(c, img, k * cw, l * ch, cw, ch, LADO_RECORTE) });
        }
        // JPEG maior = mais traço e texto. O canto inferior direito vai sempre (é onde fica o carimbo).
        const canto = todos.at(-1)!;
        const escolhidos = [canto, ...todos.filter((t) => t !== canto).sort((a, b) => b.dados.byteLength - a.dados.byteLength)]
          .slice(0, maxRecortes)
          .sort((a, b) => a.l - b.l || a.k - b.k);
        for (const t of escolhidos) {
          const ondeFica = t === canto ? ', canto inferior direito, onde costuma ficar o carimbo' : '';
          partes.push({
            tipo: 'texto',
            texto: `Recorte da página ${n} de "${nome}" em resolução maior: linha ${t.l + 1} de ${linhas}, coluna ${t.k + 1} de ${colunas}${ondeFica}.`,
          });
          partes.push({ tipo: 'imagem', mime: 'image/jpeg', dados: t.dados, nome: `${nome} p${n} r${t.l + 1}c${t.k + 1}` });
        }
        vagas -= escolhidos.length;
      }
    }
    if (pdf.numPages > paginas) partes.push({ tipo: 'texto', texto: `"${nome}" tem ${pdf.numPages} páginas; vão as ${paginas} primeiras como imagem.` });
    return partes;
  } finally {
    await pdf.loadingTask.destroy().catch(() => undefined);
  }
}

/**
 * Anexos em partes que qualquer modelo com visão lê: texto e imagens JPEG. PDF que não abre volta como veio (o provedor
 * decide), para a leitura não cair por causa de um arquivo.
 */
export async function prepararAnexosIa(anexos: Anexo[]): Promise<ParteIa[]> {
  if (anexos.length === 0) return [];
  const m = await carregar();
  const partes: ParteIa[] = [];
  const imagensSoltas = anexos.filter((a) => a.mime.startsWith('image/')).length;
  let vagas = MAX_IMAGENS_PEDIDO - imagensSoltas;
  for (const a of anexos) {
    if (a.mime.startsWith('image/')) {
      partes.push(await prepararImagem(m.canvas, a));
      continue;
    }
    if (a.mime !== 'application/pdf') continue;
    try {
      const doPdf = await prepararPdf(m, a, Math.max(1, vagas));
      vagas -= doPdf.filter((p) => p.tipo === 'imagem').length;
      partes.push(...doPdf);
    } catch (erro) {
      console.error(`IA: não consegui preparar "${nomeCurto(a.nome)}"`, erro);
      partes.push({ tipo: 'texto', texto: `Não foi possível abrir "${nomeCurto(a.nome)}" para leitura.` });
    }
  }
  return partes;
}
