import 'server-only';
import { prepararAnexosIa, type ParteIa } from '@/lib/anexosIa';

// Camada de IA plugável. O app pede "leia isto e responda" e não sabe qual modelo responde: os provedores vêm das
// variáveis da Vercel e são tentados em ordem (o principal e, se ele falhar, o outro). As chaves moram só aqui, no
// servidor; nunca vão para o navegador.
//
//   IA_PRINCIPAL       "openrouter" ou "gemini": quem tenta primeiro (padrão: OpenRouter, se a chave dele existir).
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
/** Acabou o tempo da leitura: não adianta tentar outro modelo (a função da Vercel seria cortada no meio). */
class ErroTempo extends ErroIa {}

const BASE_GEMINI = 'https://generativelanguage.googleapis.com/v1beta';
const BASE_OPENROUTER = 'https://openrouter.ai/api/v1';
/** Quanto cada chamada pode esperar, no máximo (dentro do prazo total do pedido). */
const ESPERA_OPENROUTER = 150_000;
const ESPERA_GEMINI = 90_000;
/** Prazo total padrão de um pedido (a página da leitura tem 300 s na Vercel; sobra para gravar e responder). */
const PRAZO_PADRAO = 240_000;
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

/** Quanto esta chamada pode esperar: o limite do provedor, sem passar do prazo do pedido. */
function tempoDaChamada(p: Pedido, limite: number): number {
  const resta = p.fim - Date.now() - 5_000;
  if (resta < 15_000) throw new ErroTempo('A IA demorou demais e a leitura parou. Tente de novo com menos arquivos, ou mais tarde.');
  return Math.min(limite, resta);
}

async function postar(url: string, cabecalhos: Record<string, string>, corpo: unknown, ms: number): Promise<Response> {
  try {
    return await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...cabecalhos },
      body: JSON.stringify(corpo),
      signal: AbortSignal.timeout(ms),
      cache: 'no-store',
    });
  } catch (erro) {
    const tempo = erro instanceof Error && /timeout|abort/i.test(erro.name + erro.message);
    throw new ErroPassageiro(tempo ? 'A IA demorou demais para responder. Tente com menos arquivos.' : 'Não foi possível falar com o serviço de IA agora.');
  }
}

type Pedido = {
  sistema?: string;
  mensagens: MensagemIa[];
  anexos: Anexo[];
  json: boolean;
  /** Anexos já abertos pelo servidor (texto do PDF + imagens das páginas), preparados só se algum provedor precisar. */
  preparados: () => Promise<ParteIa[]>;
  /** Instante-limite do pedido inteiro (todas as tentativas). */
  fim: number;
  /** Tamanho máximo da resposta: modelo grátis escreve devagar, e resposta longa estoura o tempo. */
  maxTokens?: number;
};

/** O Gemini lê PDF e imagem direto; arquivo grande demais para o pedido (limite de 20 MB) vai preparado. */
const MAX_ANEXO_DIRETO = 8 * 1024 * 1024;
const MAX_ANEXOS_DIRETO = 14 * 1024 * 1024;
const geminiLeDireto = (anexos: Anexo[]) =>
  anexos.every((a) => a.dados.byteLength <= MAX_ANEXO_DIRETO) && anexos.reduce((t, a) => t + a.dados.byteLength, 0) <= MAX_ANEXOS_DIRETO;

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
    // Só a família normal ("gemini-3.8-flash"): as variantes com outro nome (omni...) vêm com cota zero no plano grátis.
    .filter((n) => /^gemini-\d[\d.]*-flash/.test(n) && !/image|tts|audio|live|embedding|thinking|exp/.test(n));
  const peso = (n: string) => (/lite/.test(n) ? 2 : 0) + (/preview/.test(n) ? 1 : 0);
  const modelos = nomes.sort((a, b) => peso(a) - peso(b) || b.localeCompare(a, 'en', { numeric: true }));
  flashDoGoogle = { quando: Date.now(), modelos };
  return modelos;
}

async function chamarGemini(chave: string, modelo: string, p: Pedido): Promise<RespostaIa> {
  tempoDaChamada(p, ESPERA_GEMINI);
  const anexos = geminiLeDireto(p.anexos)
    ? p.anexos.map((a) => ({ inline_data: { mime_type: a.mime, data: base64(a.dados) } }))
    : (await p.preparados()).map((x) => (x.tipo === 'texto' ? { text: x.texto } : { inline_data: { mime_type: x.mime, data: base64(x.dados) } }));
  const contents = p.mensagens.map((m, i) => ({
    role: m.papel === 'assistente' ? 'model' : 'user',
    // Os anexos vão junto da última mensagem de quem pergunta.
    parts: [...(i === p.mensagens.length - 1 ? anexos : []), { text: m.texto }],
  }));
  const corpo = {
    ...(p.sistema ? { systemInstruction: { parts: [{ text: p.sistema }] } } : {}),
    contents,
    generationConfig: {
      temperature: 0.2,
      ...(p.maxTokens ? { maxOutputTokens: p.maxTokens } : {}),
      ...(p.json ? { responseMimeType: 'application/json' } : {}),
    },
  };
  const ms = tempoDaChamada(p, ESPERA_GEMINI);
  const r = await postar(`${BASE_GEMINI}/models/${encodeURIComponent(modelo)}:generateContent`, { 'x-goog-api-key': chave }, corpo, ms);
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
  // PDF vai aberto pelo servidor (texto + imagens das páginas): o leitor de arquivos do OpenRouter recusa PDF grande
  // e não vê desenho nem prancha escaneada.
  tempoDaChamada(p, ESPERA_OPENROUTER);
  const anexos = p.anexos.length > 0 ? await p.preparados() : [];
  const parteAnexo = (x: ParteIa) =>
    x.tipo === 'texto' ? { type: 'text', text: x.texto } : { type: 'image_url', image_url: { url: `data:${x.mime};base64,${base64(x.dados)}` } };
  const messages = [
    ...(p.sistema ? [{ role: 'system', content: p.sistema }] : []),
    ...p.mensagens.map((m, i) =>
      i === p.mensagens.length - 1 && anexos.length > 0
        ? { role: 'user', content: [...anexos.map(parteAnexo), { type: 'text', text: m.texto }] }
        : { role: m.papel === 'assistente' ? 'assistant' : 'user', content: m.texto },
    ),
  ];
  const ms = tempoDaChamada(p, ESPERA_OPENROUTER);
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
      ...(p.maxTokens ? { max_tokens: p.maxTokens } : {}),
      ...(p.json ? { response_format: { type: 'json_object' } } : {}),
    },
    ms,
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

type Provedor = { nome: 'gemini' | 'openrouter'; perguntar: (p: Pedido) => Promise<RespostaIa> };

/** Provedores com chave, o principal primeiro (IA_PRINCIPAL; sem ela, o OpenRouter, que aguenta mais o plano grátis). */
function provedores(): Provedor[] {
  const gemini = process.env.IA_CHAVE;
  const openrouter = chaveOpenRouter();
  const lista: Provedor[] = [];
  if (openrouter) lista.push({ nome: 'openrouter', perguntar: (p) => perguntarOpenRouter(openrouter, p) });
  if (gemini) lista.push({ nome: 'gemini', perguntar: (p) => perguntarGemini(gemini, p) });
  const principal = (process.env.IA_PRINCIPAL || 'openrouter').toLowerCase();
  return lista.sort((a, b) => Number(b.nome === principal) - Number(a.nome === principal));
}

/** Conversa com a IA: o provedor principal e, se ele não der conta (sobrecarga, cota, arquivo recusado), o outro. */
export async function conversarIa(p: {
  sistema?: string;
  mensagens: MensagemIa[];
  anexos?: Anexo[];
  json?: boolean;
  /** Prazo total, somando todas as tentativas (padrão 240 s). */
  prazoMs?: number;
  maxTokens?: number;
}): Promise<RespostaIa> {
  const anexos = p.anexos ?? [];
  let preparo: Promise<ParteIa[]> | null = null;
  const pedido: Pedido = {
    sistema: p.sistema,
    mensagens: p.mensagens,
    anexos,
    json: p.json ?? false,
    preparados: () => (preparo ??= prepararAnexosIa(anexos)),
    fim: Date.now() + (p.prazoMs ?? PRAZO_PADRAO),
    maxTokens: p.maxTokens,
  };
  const lista = provedores();
  if (lista.length === 0) throw new ErroIa('A IA não está ligada. Cadastre API_OPENROUTER ou IA_CHAVE (Gemini) na Vercel.');
  const falhas: { nome: string; erro: ErroIa }[] = [];
  for (const [i, prov] of lista.entries()) {
    const inicio = Date.now();
    try {
      return await prov.perguntar(pedido);
    } catch (erro) {
      const e = erro instanceof ErroIa ? erro : new ErroIa('A IA não respondeu.');
      if (!(erro instanceof ErroIa)) console.error(`IA (${prov.nome}) falhou de um jeito inesperado`, erro);
      console.error(`IA (${prov.nome}) não conseguiu em ${Math.round((Date.now() - inicio) / 1000)} s: ${e.message}`);
      falhas.push({ nome: prov.nome, erro: e });
      // Acabou o tempo: para aqui, com a mensagem que explica (e o motivo do provedor que falhou antes, se houver).
      if (e instanceof ErroTempo) {
        if (falhas.length === 1) throw e;
        throw new ErroIa(`${falhas[0]!.erro.message} ${e.message}`);
      }
      // Chave recusada ou pedido inválido: avisa já (outro provedor não resolve o que é da configuração).
      if (!(e instanceof ErroPassageiro) && /chave/i.test(e.message)) throw e;
      if (i === lista.length - 1) break;
    }
  }
  if (falhas.length === 1) throw falhas[0]!.erro;
  const [primeira, ...outras] = falhas;
  throw new ErroIa(`${primeira!.erro.message} A IA reserva também falhou: ${outras.map((f) => f.erro.message).join(' ')}`);
}

/** Pedido de leitura (texto + arquivos) com resposta em JSON. */
export async function perguntarIa(
  instrucao: string,
  anexos: Anexo[] = [],
  opcoes: { prazoMs?: number; maxTokens?: number } = {},
): Promise<RespostaIa> {
  return conversarIa({ mensagens: [{ papel: 'usuario', texto: instrucao }], anexos, json: true, ...opcoes });
}
