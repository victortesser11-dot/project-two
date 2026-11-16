import 'server-only';

// Camada de IA plugável. O app pede "leia isto e responda" e não sabe qual modelo responde: os provedores vêm das
// variáveis da Vercel e são tentados em ordem. As chaves moram só aqui, no servidor; nunca vão para o navegador.
//
//   IA_CHAVE           chave do Gemini (Google AI Studio). Lê PDF e imagem.
//   IA_MODELO          modelo preferido do Gemini (padrão "gemini-flash-latest"). Sobrecarregado (503), sem cota (429)
//                      ou aposentado (404)? Tenta os outros Flash da lista do Google.
//   API_OPENROUTER     chave do OpenRouter (opcional; também aceita OPENROUTER_CHAVE): reserva quando o Gemini falha,
//                      e provedor único se não houver IA_CHAVE. Lê texto, imagem e PDF.
//   OPENROUTER_MODELO  padrão "openrouter/free" (o roteador grátis escolhe um modelo livre).
//   IA_LIMITE_DIA      leituras por obra por dia (padrão 20), para não estourar a cota grátis.
// Com nenhuma das chaves, as telas de IA ficam escondidas e o app segue normal.

export type Anexo = { mime: string; dados: Uint8Array; nome: string };
export type RespostaIa = { texto: string; modelo: string };
export type MensagemIa = { papel: 'usuario' | 'assistente'; texto: string };

export class ErroIa extends Error {}

/** Erro de um provedor que vale tentar em outro modelo ou provedor (sobrecarga, cota, modelo sumido). */
class ErroPassageiro extends ErroIa {}

const BASE_GEMINI = 'https://generativelanguage.googleapis.com/v1beta';
const BASE_OPENROUTER = 'https://openrouter.ai/api/v1';
const TEMPO_MAXIMO = 120_000;
const MAX_MODELOS_GEMINI = 4;

/** Chave do OpenRouter: API_OPENROUTER (nome cadastrado na Vercel) ou OPENROUTER_CHAVE. */
function chaveOpenRouter(): string | undefined {
  return process.env.API_OPENROUTER || process.env.OPENROUTER_CHAVE || undefined;
}

export function iaConfigurada(): boolean {
  return Boolean(process.env.IA_CHAVE || chaveOpenRouter());
}

export function limiteDiarioIa(): number {
  const n = Number(process.env.IA_LIMITE_DIA);
  return Number.isInteger(n) && n > 0 ? n : 20;
}

/** Os provedores configurados leem PDF? (Gemini lê; o OpenRouter converte o PDF antes.) */
export function iaLePdf(): boolean {
  return iaConfigurada();
}

function base64(dados: Uint8Array): string {
  return Buffer.from(dados).toString('base64');
}

const espera = (ms: number) => new Promise((ok) => setTimeout(ok, ms));

// Modelos que falharam há pouco ficam de fora por um tempo (memória da instância do servidor): não vale reenviar os
// arquivos para um modelo sem cota no plano grátis ("limit: 0") ou que acabou de dizer que está sobrecarregado.
const foraAte = new Map<string, number>();
const MINUTO = 60_000;

/** Por quanto tempo deixar um modelo de fora depois desta falha. */
function tempoDeFora(status: number, corpo: string): number {
  if (status === 404 || /limit: 0\b/.test(corpo)) return 24 * 60 * MINUTO;
  if (/per ?day|PerDay/i.test(corpo)) return 60 * MINUTO;
  if (status === 429) return 2 * MINUTO;
  if (status >= 500) return MINUTO;
  return 0;
}

function marcarFora(modelo: string, status: number, corpo: string) {
  const ms = tempoDeFora(status, corpo);
  if (ms > 0) foraAte.set(modelo, Date.now() + ms);
}

function estaFora(modelo: string): boolean {
  const ate = foraAte.get(modelo);
  if (ate === undefined) return false;
  if (ate > Date.now()) return true;
  foraAte.delete(modelo);
  return false;
}

/** Mensagem para a tela a partir do status e do corpo do erro do provedor. */
function erroDoProvedor(status: number, corpo: string): ErroIa {
  if (status === 401 || status === 403 || /API_KEY_INVALID|API key not valid|PERMISSION_DENIED|No auth credentials|User not found/i.test(corpo)) {
    return new ErroIa('A chave da IA foi recusada. Confira IA_CHAVE (Gemini) ou API_OPENROUTER na Vercel.');
  }
  if (status === 413 || /too large|exceeds the maximum|payload size|context length/i.test(corpo)) {
    return new ErroIa('Os arquivos ficaram grandes demais para uma leitura. Escolha menos arquivos de cada vez.');
  }
  if (status === 429 || /RESOURCE_EXHAUSTED|quota|rate.?limit/i.test(corpo)) {
    return new ErroPassageiro('O limite gratuito da IA acabou por agora. Tente de novo mais tarde (a cota grátis renova todo dia).');
  }
  if (status === 404) return new ErroPassageiro('O modelo de IA configurado não existe mais.');
  if (status >= 500) return new ErroPassageiro('O serviço de IA está sobrecarregado agora. Tente de novo em alguns minutos.');
  return new ErroIa(`A IA não aceitou o pedido (${status}). ${corpo.slice(0, 200)}`);
}

async function postar(url: string, cabecalhos: Record<string, string>, corpo: unknown): Promise<Response> {
  try {
    return await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...cabecalhos },
      body: JSON.stringify(corpo),
      signal: AbortSignal.timeout(TEMPO_MAXIMO),
      cache: 'no-store',
    });
  } catch (erro) {
    const tempo = erro instanceof Error && /timeout|abort/i.test(erro.name + erro.message);
    throw new ErroPassageiro(tempo ? 'A IA demorou demais para responder. Tente com menos arquivos.' : 'Não foi possível falar com o serviço de IA agora.');
  }
}

type Pedido = { sistema?: string; mensagens: MensagemIa[]; anexos: Anexo[]; json: boolean };

// ---------------------------------------------------------------- Gemini (API nativa: lê PDF e imagem)

let flashDoGoogle: { quando: number; modelos: string[] } | null = null;

/** Modelos Flash que a chave enxerga, do mais novo para o mais antigo; os "lite" e as prévias por último. */
async function modelosFlash(chave: string): Promise<string[]> {
  if (flashDoGoogle && Date.now() - flashDoGoogle.quando < 6 * 3600_000) return flashDoGoogle.modelos;
  const r = await fetch(`${BASE_GEMINI}/models?pageSize=200`, { headers: { 'x-goog-api-key': chave }, cache: 'no-store' }).catch(() => null);
  if (!r?.ok) return [];
  const { models = [] } = (await r.json().catch(() => ({}))) as { models?: { name: string; supportedGenerationMethods?: string[] }[] };
  const nomes = models
    .filter((m) => m.supportedGenerationMethods?.includes('generateContent'))
    .map((m) => m.name.replace(/^models\//, ''))
    .filter((n) => /flash/.test(n) && !/image|tts|audio|live|embedding|thinking|exp/.test(n));
  const peso = (n: string) => (/lite/.test(n) ? 2 : 0) + (/preview/.test(n) ? 1 : 0);
  const modelos = nomes.sort((a, b) => peso(a) - peso(b) || b.localeCompare(a, 'en', { numeric: true }));
  flashDoGoogle = { quando: Date.now(), modelos };
  return modelos;
}

async function chamarGemini(chave: string, modelo: string, p: Pedido): Promise<RespostaIa> {
  const contents = p.mensagens.map((m, i) => ({
    role: m.papel === 'assistente' ? 'model' : 'user',
    // Os anexos vão junto da última mensagem de quem pergunta.
    parts: [
      ...(i === p.mensagens.length - 1 ? p.anexos.map((a) => ({ inline_data: { mime_type: a.mime, data: base64(a.dados) } })) : []),
      { text: m.texto },
    ],
  }));
  const corpo = {
    ...(p.sistema ? { systemInstruction: { parts: [{ text: p.sistema }] } } : {}),
    contents,
    generationConfig: { temperature: 0.2, ...(p.json ? { responseMimeType: 'application/json' } : {}) },
  };
  const r = await postar(`${BASE_GEMINI}/models/${encodeURIComponent(modelo)}:generateContent`, { 'x-goog-api-key': chave }, corpo);
  const textoBruto = await r.text();
  if (!r.ok) {
    console.error(`IA (Gemini ${modelo}) recusou: ${r.status} ${textoBruto.slice(0, 500)}`);
    marcarFora(modelo, r.status, textoBruto);
    throw erroDoProvedor(r.status, textoBruto);
  }
  const json = JSON.parse(textoBruto) as {
    candidates?: { content?: { parts?: { text?: string }[] } }[];
    promptFeedback?: { blockReason?: string };
    modelVersion?: string;
  };
  if (json.promptFeedback?.blockReason) throw new ErroIa('A IA se recusou a ler este conteúdo. Tente com outros arquivos.');
  const texto = (json.candidates?.[0]?.content?.parts ?? []).map((x) => x.text ?? '').join('');
  if (!texto) throw new ErroPassageiro('A IA não respondeu nada desta vez. Tente de novo.');
  return { texto, modelo: json.modelVersion || modelo };
}

/** Tenta o modelo preferido e, se ele estiver sobrecarregado, sem cota ou aposentado, outros Flash da mesma chave. */
async function perguntarGemini(chave: string, p: Pedido): Promise<RespostaIa> {
  const preferido = process.env.IA_MODELO || 'gemini-flash-latest';
  const tentados: string[] = [];
  let ultimo: ErroIa = new ErroPassageiro('O serviço de IA está sobrecarregado agora.');
  let fila = [preferido];
  while (tentados.length < MAX_MODELOS_GEMINI) {
    const modelo = fila.shift();
    if (!modelo) {
      if (tentados.length === 1) {
        fila = (await modelosFlash(chave)).filter((m) => !tentados.includes(m) && !estaFora(m));
        if (fila.length > 0) continue;
      }
      break;
    }
    if (tentados.includes(modelo)) continue;
    if (estaFora(modelo)) {
      // Não conta como tentativa, mas abre a lista do Google se o preferido está de fora.
      if (tentados.length === 0) tentados.push(modelo);
      continue;
    }
    tentados.push(modelo);
    try {
      return await chamarGemini(chave, modelo, p);
    } catch (erro) {
      if (!(erro instanceof ErroPassageiro)) throw erro;
      ultimo = erro;
      await espera(300);
    }
  }
  throw ultimo;
}

// ---------------------------------------------------------------- OpenRouter (formato de chat da OpenAI)

async function perguntarOpenRouter(chave: string, p: Pedido): Promise<RespostaIa> {
  const url = (process.env.OPENROUTER_URL || BASE_OPENROUTER).replace(/\/$/, '');
  const modelo = process.env.OPENROUTER_MODELO || 'openrouter/free';
  const parteAnexo = (a: Anexo) =>
    a.mime.startsWith('image/')
      ? { type: 'image_url', image_url: { url: `data:${a.mime};base64,${base64(a.dados)}` } }
      : { type: 'file', file: { filename: a.nome.split('/').pop() || 'arquivo.pdf', file_data: `data:${a.mime};base64,${base64(a.dados)}` } };
  const messages = [
    ...(p.sistema ? [{ role: 'system', content: p.sistema }] : []),
    ...p.mensagens.map((m, i) =>
      i === p.mensagens.length - 1 && p.anexos.length > 0
        ? { role: 'user', content: [...p.anexos.map(parteAnexo), { type: 'text', text: m.texto }] }
        : { role: m.papel === 'assistente' ? 'assistant' : 'user', content: m.texto },
    ),
  ];
  const r = await postar(
    `${url}/chat/completions`,
    {
      Authorization: `Bearer ${chave}`,
      'X-Title': 'Controle de Obras',
      ...(process.env.NEXT_PUBLIC_SITE_URL ? { 'HTTP-Referer': process.env.NEXT_PUBLIC_SITE_URL } : {}),
    },
    {
      model: modelo,
      temperature: 0.2,
      messages,
      // Modelo que "pensa" antes de responder demora muito: pensa pouco e não devolve o raciocínio.
      reasoning: { effort: 'low', exclude: true },
      // PDF vira texto pelo leitor grátis do OpenRouter (o OCR padrão é pago e falha numa conta sem crédito).
      ...(p.anexos.some((a) => !a.mime.startsWith('image/')) ? { plugins: [{ id: 'file-parser', pdf: { engine: 'pdf-text' } }] } : {}),
      ...(p.json ? { response_format: { type: 'json_object' } } : {}),
    },
  );
  const textoBruto = await r.text();
  if (!r.ok) {
    console.error(`IA (OpenRouter ${modelo}) recusou: ${r.status} ${textoBruto.slice(0, 500)}`);
    throw erroDoProvedor(r.status, textoBruto);
  }
  let json: { choices?: { message?: { content?: string } }[]; model?: string; error?: { message?: string; code?: number } };
  try {
    json = JSON.parse(textoBruto);
  } catch {
    console.error(`IA (OpenRouter ${modelo}) devolveu algo que não é JSON: ${textoBruto.slice(0, 300)}`);
    throw new ErroPassageiro('A IA reserva respondeu com defeito. Tente de novo.');
  }
  if (json.error) {
    console.error(`IA (OpenRouter ${json.model || modelo}) falhou: ${json.error.code ?? '?'} ${(json.error.message ?? '').slice(0, 300)}`);
    throw erroDoProvedor(json.error.code ?? 500, json.error.message ?? '');
  }
  const texto = json.choices?.[0]?.message?.content ?? '';
  if (!texto) {
    console.error(`IA (OpenRouter ${json.model || modelo}) respondeu vazio.`);
    throw new ErroPassageiro('A IA não respondeu nada desta vez. Tente de novo.');
  }
  return { texto, modelo: `openrouter:${json.model || modelo}` };
}

// ---------------------------------------------------------------- entrada

/** Conversa com a IA: Gemini primeiro (tentando outros modelos), OpenRouter se o Gemini não der conta. */
export async function conversarIa(p: { sistema?: string; mensagens: MensagemIa[]; anexos?: Anexo[]; json?: boolean }): Promise<RespostaIa> {
  const pedido: Pedido = { sistema: p.sistema, mensagens: p.mensagens, anexos: p.anexos ?? [], json: p.json ?? false };
  const gemini = process.env.IA_CHAVE;
  const openrouter = chaveOpenRouter();
  if (!gemini && !openrouter) throw new ErroIa('A IA não está ligada. Cadastre IA_CHAVE (Gemini) ou API_OPENROUTER na Vercel.');
  let ultimo: ErroIa | null = null;
  if (gemini) {
    try {
      return await perguntarGemini(gemini, pedido);
    } catch (erro) {
      if (!(erro instanceof ErroPassageiro) || !openrouter) throw erro;
      ultimo = erro;
    }
  }
  if (openrouter) {
    const inicio = Date.now();
    try {
      return await perguntarOpenRouter(openrouter, pedido);
    } catch (erro) {
      const motivo = erro instanceof ErroIa ? erro.message : String(erro);
      console.error(`IA (OpenRouter) não conseguiu em ${Math.round((Date.now() - inicio) / 1000)} s: ${motivo}`);
      if (!ultimo) throw erro instanceof ErroIa ? erro : new ErroIa('A IA não respondeu.');
      // Os dois falharam: diz o motivo de cada um.
      throw new ErroIa(`${ultimo.message} A IA reserva também falhou: ${motivo}`);
    }
  }
  throw ultimo ?? new ErroIa('A IA não respondeu.');
}

/** Pedido de leitura (texto + arquivos) com resposta em JSON. */
export async function perguntarIa(instrucao: string, anexos: Anexo[] = []): Promise<RespostaIa> {
  return conversarIa({ mensagens: [{ papel: 'usuario', texto: instrucao }], anexos, json: true });
}
