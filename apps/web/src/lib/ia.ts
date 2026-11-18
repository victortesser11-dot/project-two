import 'server-only';
import { MAX_IMAGENS_PEDIDO, prepararAnexosIa, type ParteIa } from '@/lib/anexosIa';

// Camada de IA plugável. O app pede "converse" ou "leia isto" e não sabe qual modelo responde. Cada tipo de pedido tem a
// sua fila de modelos (provedor:modelo), tentados em ordem, uma vez cada:
//
//   conversa  assistente da obra: só texto, precisa ser rápido.      IA_CONVERSA (padrão em ROTAS_PADRAO)
//   leitura   pranchas, fotos do diário, fiscal: imagem e PDF.        IA_LEITURA
//
// Três provedores grátis, cada um com a própria cota (um pedido que falha num não gasta a do outro):
//
//   GROQ_CHAVE      Groq (console.groq.com, sem cartão). Muito rápido; o qwen lê até 3 imagens por pedido.
//   API_OPENROUTER  OpenRouter (também aceita OPENROUTER_CHAVE). Modelos ":free": 50 pedidos por dia na conta inteira
//                   sem crédito comprado, 1.000 com US$ 10 de crédito único (que os modelos grátis não gastam).
//   IA_CHAVE        Gemini (Google AI Studio). Lê PDF direto. O grátis vive sobrecarregado: fica de reserva.
//
// Fila sem a chave do provedor perde aquele item. Modelo que falhou por cota ou sobrecarga fica de fora por um tempo
// (memória da instância), para o próximo pedido não gastar tempo com ele. IA_LIMITE_DIA: leituras por obra por dia.
// Sem nenhuma chave, as telas de IA ficam escondidas e o app segue normal.

export type Anexo = { mime: string; dados: Uint8Array; nome: string };
export type RespostaIa = { texto: string; modelo: string };
export type MensagemIa = { papel: 'usuario' | 'assistente'; texto: string };
export type TarefaIa = 'conversa' | 'leitura';
export type ProvedorIa = 'groq' | 'openrouter' | 'gemini';
export type RotaIa = { provedor: ProvedorIa; modelo: string };

export class ErroIa extends Error {}
/** Falha deste modelo que vale tentar no próximo da fila (sobrecarga, cota, resposta vazia, pedido grande demais). */
class ErroPassageiro extends ErroIa {}
/** Acabou o tempo do pedido: não adianta tentar outro modelo (a função da Vercel seria cortada no meio). */
class ErroTempo extends ErroIa {}
/** O modelo gastou o limite pensando e não escreveu nada: vale repetir no mesmo modelo, com mais espaço. */
class ErroCortado extends ErroPassageiro {
  /** O modelo não aceita "sem pensar": a repetição vai pensando pouco, com espaço para o raciocínio. */
  readonly pensaSempre: boolean;
  constructor(mensagem: string, pensaSempre = false) {
    super(mensagem);
    this.pensaSempre = pensaSempre;
  }
}

/** Filas padrão: o mais rápido e confiável primeiro. Escritas como nas variáveis IA_CONVERSA e IA_LEITURA. */
export const ROTAS_PADRAO: Record<TarefaIa, string> = {
  conversa: [
    'groq:openai/gpt-oss-120b',
    'openrouter:nvidia/nemotron-3.5-super-vl:free',
    'groq:qwen/qwen3.8-27b',
    'gemini:gemini-flash-lite-latest',
    'openrouter:openrouter/free',
  ].join(', '),
  leitura: [
    'openrouter:nvidia/nemotron-3.5-super-vl:free',
    'groq:qwen/qwen3.8-27b',
    'gemini:gemini-flash-latest',
    'openrouter:openrouter/free',
  ].join(', '),
};
const VARIAVEL: Record<TarefaIa, string> = { conversa: 'IA_CONVERSA', leitura: 'IA_LEITURA' };

/** Prazo total padrão (somando as tentativas): a página do assistente tem 120 s e as de leitura 300 s na Vercel. */
const PRAZO_PADRAO: Record<TarefaIa, number> = { conversa: 60_000, leitura: 240_000 };
/** Quanto cada chamada pode esperar, no máximo (dentro do prazo total). Conversa lenta passa logo ao próximo. */
const ESPERA: Record<TarefaIa, Record<ProvedorIa, number>> = {
  conversa: { groq: 25_000, openrouter: 40_000, gemini: 30_000 },
  leitura: { groq: 60_000, openrouter: 150_000, gemini: 90_000 },
};
/** Imagens por pedido que cada provedor aceita (o qwen do Groq recusa mais de 3). */
const MAX_IMAGENS: Record<ProvedorIa, number> = { groq: 3, openrouter: MAX_IMAGENS_PEDIDO, gemini: MAX_IMAGENS_PEDIDO };
/** Resposta padrão (sem contar o raciocínio): modelo grátis escreve devagar, e resposta longa estoura o tempo. */
const TOKENS_PADRAO = 2_000;
/** Espaço extra quando o modelo insiste em pensar antes de responder. */
const TOKENS_PENSANDO = 8_000;

const BASE_GEMINI = 'https://generativelanguage.googleapis.com/v1beta';
const BASE_OPENROUTER = 'https://openrouter.ai/api/v1';
const BASE_GROQ = 'https://api.groq.com/openai/v1';

function chaves(): Record<ProvedorIa, string | undefined> {
  return {
    groq: process.env.GROQ_CHAVE || process.env.GROQ_API_KEY || undefined,
    openrouter: process.env.API_OPENROUTER || process.env.OPENROUTER_CHAVE || undefined,
    gemini: process.env.IA_CHAVE || undefined,
  };
}

const PROVEDORES: ProvedorIa[] = ['groq', 'openrouter', 'gemini'];

/** Lê uma fila "provedor:modelo, provedor:modelo" (o modelo pode ter ":", como "x/y:free"), sem repetir. */
export function lerRotas(valor: string): RotaIa[] {
  const rotas: RotaIa[] = [];
  for (const item of valor.split(',')) {
    const t = item.trim();
    const i = t.indexOf(':');
    if (i < 0) continue;
    const provedor = t.slice(0, i).trim().toLowerCase() as ProvedorIa;
    const modelo = t.slice(i + 1).trim();
    if (!PROVEDORES.includes(provedor) || !modelo) continue;
    if (!rotas.some((r) => r.provedor === provedor && r.modelo === modelo)) rotas.push({ provedor, modelo });
  }
  return rotas;
}

/** Fila de modelos deste tipo de pedido, só com os provedores que têm chave. */
export function rotasIa(tarefa: TarefaIa): RotaIa[] {
  const c = chaves();
  const valor = process.env[VARIAVEL[tarefa]]?.trim() || ROTAS_PADRAO[tarefa];
  return lerRotas(valor).filter((r) => c[r.provedor]);
}

export function iaConfigurada(): boolean {
  return rotasIa('conversa').length > 0 || rotasIa('leitura').length > 0;
}

/** Algum modelo da fila de leitura? (Todos leem PDF: o Gemini direto, os outros com o PDF aberto pelo servidor.) */
export function iaLePdf(): boolean {
  return rotasIa('leitura').length > 0;
}

export function limiteDiarioIa(): number {
  const n = Number(process.env.IA_LIMITE_DIA);
  return Number.isInteger(n) && n > 0 ? n : 20;
}

const rotulo = (r: RotaIa) => `${r.provedor}:${r.modelo}`;
const base64 = (dados: Uint8Array) => Buffer.from(dados).toString('base64');
const segundos = (desde: number) => `${((Date.now() - desde) / 1000).toFixed(1)} s`;
const gratisOpenRouter = (r: RotaIa) => r.provedor === 'openrouter' && (r.modelo.endsWith(':free') || r.modelo === 'openrouter/free');

// ---------------------------------------------------------------- quem está de fora (memória da instância)

const foraAte = new Map<string, number>();
const MINUTO = 60_000;
/** Cota diária dos modelos grátis do OpenRouter: vale para a conta inteira, todos os ":free" juntos. */
const OPENROUTER_GRATIS = 'openrouter:*:free';

function proximaMeiaNoiteUtc(): number {
  const d = new Date();
  return Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate() + 1);
}

function deixarDeFora(chave: string, ms: number) {
  if (ms > 0) foraAte.set(chave, Math.max(foraAte.get(chave) ?? 0, Date.now() + ms));
}

function fora(chave: string): boolean {
  const ate = foraAte.get(chave);
  if (ate === undefined) return false;
  if (ate > Date.now()) return true;
  foraAte.delete(chave);
  return false;
}

export function rotaDeFora(r: RotaIa): boolean {
  return fora(rotulo(r)) || fora(`${r.provedor}:*`) || (gratisOpenRouter(r) && fora(OPENROUTER_GRATIS));
}

/** Por quanto tempo deixar o modelo (ou o provedor inteiro) de fora depois desta recusa. */
function anotarRecusa(r: RotaIa, status: number, corpo: string, esperar: string | null) {
  if (status === 401 || status === 403) return deixarDeFora(`${r.provedor}:*`, 10 * MINUTO);
  if (gratisOpenRouter(r) && /free-models-per-day/i.test(corpo)) return deixarDeFora(OPENROUTER_GRATIS, proximaMeiaNoiteUtc() - Date.now());
  if (status === 404 || /limit: 0\b/.test(corpo)) return deixarDeFora(rotulo(r), 24 * 60 * MINUTO);
  if (/per ?day|PerDay|\(RPD\)|\(TPD\)/i.test(corpo)) return deixarDeFora(rotulo(r), 60 * MINUTO);
  if (status === 429) {
    const s = Number(esperar);
    return deixarDeFora(rotulo(r), Number.isFinite(s) && s > 0 ? Math.min(s * 1000, 10 * MINUTO) : 2 * MINUTO);
  }
  if (status >= 500) return deixarDeFora(rotulo(r), MINUTO);
}

/** Mensagem para a tela a partir do status e do corpo do erro do provedor. */
function erroDoProvedor(status: number, corpo: string): ErroIa {
  if (status === 401 || status === 403 || /API_KEY_INVALID|API key not valid|Invalid API Key|PERMISSION_DENIED|No auth credentials|User not found/i.test(corpo)) {
    return new ErroPassageiro('A chave de um provedor de IA foi recusada (confira GROQ_CHAVE, API_OPENROUTER e IA_CHAVE na Vercel).');
  }
  if (status === 413 || /too large|exceeds the maximum|payload size|context length|context_length/i.test(corpo)) {
    return new ErroPassageiro('Os arquivos ficaram grandes demais para uma leitura. Escolha menos arquivos de cada vez.');
  }
  if (status === 429 || /RESOURCE_EXHAUSTED|quota|rate.?limit/i.test(corpo)) {
    return new ErroPassageiro('O limite gratuito da IA acabou por agora. Tente de novo mais tarde (a cota grátis renova todo dia).');
  }
  if (status === 404) return new ErroPassageiro('O modelo de IA configurado não existe mais.');
  if (status >= 500) return new ErroPassageiro('O serviço de IA está sobrecarregado agora. Tente de novo em alguns minutos.');
  return new ErroPassageiro(`A IA não aceitou o pedido (${status}).`);
}

// ---------------------------------------------------------------- pedido

type Pedido = {
  tarefa: TarefaIa;
  sistema?: string;
  mensagens: MensagemIa[];
  anexos: Anexo[];
  json: boolean;
  /** Anexos abertos pelo servidor (texto do PDF + imagens das páginas), no máximo `n` imagens; preparados uma vez só. */
  preparados: (n: number) => Promise<ParteIa[]>;
  /** Instante-limite do pedido inteiro (todas as tentativas). */
  fim: number;
  maxTokens: number;
};

/** Como chamar o modelo nesta tentativa. */
type Jeito = { pensar: boolean; tokens: number };

/** Quanto esta chamada pode esperar: o limite do provedor, sem passar do prazo do pedido. */
function tempoDaChamada(p: Pedido, provedor: ProvedorIa): number {
  const resta = p.fim - Date.now() - 5_000;
  if (resta < 10_000) throw new ErroTempo('A IA demorou demais e a leitura parou. Tente de novo com menos arquivos, ou mais tarde.');
  return Math.min(ESPERA[p.tarefa][provedor], resta);
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
    throw new ErroPassageiro(tempo ? 'A IA demorou demais para responder.' : 'Não foi possível falar com o serviço de IA agora.');
  }
}

/** Lê a resposta HTTP: recusa vira erro (e deixa o modelo de fora um tempo); sucesso devolve o JSON. */
async function lerResposta<T>(r: Response, rota: RotaIa): Promise<T> {
  const bruto = await r.text();
  if (!r.ok) {
    console.error(`IA (${rotulo(rota)}) recusou: ${r.status} ${bruto.slice(0, 400)}`);
    anotarRecusa(rota, r.status, bruto, r.headers.get('retry-after'));
    // Modelo que só funciona pensando recusa o "sem pensar": repete no mesmo modelo, pensando pouco.
    if (r.status === 400 && /reasoning|thinking/i.test(bruto) && /mandatory|required|not supported|cannot be disabled|disable/i.test(bruto)) {
      throw new ErroCortado('O modelo exige raciocínio.', true);
    }
    throw erroDoProvedor(r.status, bruto);
  }
  try {
    return JSON.parse(bruto) as T;
  } catch {
    console.error(`IA (${rotulo(rota)}) devolveu algo que não é JSON: ${bruto.slice(0, 300)}`);
    throw new ErroPassageiro('A IA respondeu com defeito. Tente de novo.');
  }
}

// ---------------------------------------------------------------- formato de chat da OpenAI (OpenRouter e Groq)

type RespostaChat = {
  choices?: { message?: { content?: string | null }; finish_reason?: string }[];
  model?: string;
  error?: { message?: string; code?: number };
};

async function mensagensChat(p: Pedido, maxImagens: number) {
  const anexos = p.anexos.length > 0 ? await p.preparados(maxImagens) : [];
  const imagens = anexos.filter((x) => x.tipo === 'imagem').length;
  if (imagens > maxImagens) throw new ErroPassageiro(`Imagens demais para este modelo (até ${maxImagens}).`);
  const parte = (x: ParteIa) =>
    x.tipo === 'texto' ? { type: 'text', text: x.texto } : { type: 'image_url', image_url: { url: `data:${x.mime};base64,${base64(x.dados)}` } };
  return [
    ...(p.sistema ? [{ role: 'system', content: p.sistema }] : []),
    ...p.mensagens.map((m, i) =>
      i === p.mensagens.length - 1 && anexos.length > 0
        ? { role: 'user', content: [...anexos.map(parte), { type: 'text', text: m.texto }] }
        : { role: m.papel === 'assistente' ? 'assistant' : 'user', content: m.texto },
    ),
  ];
}

function textoDoChat(json: RespostaChat, rota: RotaIa, jeito: Jeito): RespostaIa {
  if (json.error) {
    console.error(`IA (${rotulo(rota)}) falhou: ${json.error.code ?? '?'} ${(json.error.message ?? '').slice(0, 300)}`);
    anotarRecusa(rota, json.error.code ?? 500, json.error.message ?? '', null);
    throw erroDoProvedor(json.error.code ?? 500, json.error.message ?? '');
  }
  const escolha = json.choices?.[0];
  const texto = escolha?.message?.content ?? '';
  if (!texto.trim()) {
    const fim = escolha?.finish_reason ?? '?';
    console.error(`IA (${rotulo(rota)}${json.model && json.model !== rota.modelo ? ` → ${json.model}` : ''}) respondeu vazio (fim: ${fim}, limite ${jeito.tokens}).`);
    if (fim === 'length') throw new ErroCortado('A IA gastou o limite pensando e não respondeu.');
    throw new ErroPassageiro('A IA não respondeu nada desta vez. Tente de novo.');
  }
  return { texto, modelo: `${rota.provedor}:${json.model || rota.modelo}` };
}

async function chamarOpenRouter(chave: string, rota: RotaIa, p: Pedido, jeito: Jeito): Promise<RespostaIa> {
  const messages = await mensagensChat(p, MAX_IMAGENS.openrouter);
  const url = (process.env.OPENROUTER_URL || BASE_OPENROUTER).replace(/\/$/, '');
  const r = await postar(
    `${url}/chat/completions`,
    {
      Authorization: `Bearer ${chave}`,
      'X-Title': 'Controle de Obras',
      ...(process.env.NEXT_PUBLIC_SITE_URL ? { 'HTTP-Referer': process.env.NEXT_PUBLIC_SITE_URL } : {}),
    },
    {
      model: rota.modelo,
      temperature: 0.2,
      messages,
      // Sem raciocínio: os modelos grátis pensam devagar, e o raciocínio conta dentro do max_tokens (pensou demais,
      // não sobrou nada para a resposta). Quem exige raciocínio volta pensando pouco, com espaço extra.
      reasoning: jeito.pensar ? { effort: 'low', exclude: true } : { effort: 'none', exclude: true },
      max_tokens: jeito.tokens,
      // O roteador grátis sorteia o modelo, e o modo JSON restringe o sorteio a modelos que às vezes respondem vazio.
      ...(p.json && rota.modelo !== 'openrouter/free' ? { response_format: { type: 'json_object' } } : {}),
    },
    tempoDaChamada(p, 'openrouter'),
  );
  return textoDoChat(await lerResposta<RespostaChat>(r, rota), rota, jeito);
}

async function chamarGroq(chave: string, rota: RotaIa, p: Pedido, jeito: Jeito): Promise<RespostaIa> {
  const messages = await mensagensChat(p, MAX_IMAGENS.groq);
  // gpt-oss sempre pensa (low/medium/high) e esconde o raciocínio com include_reasoning; o qwen desliga com "none".
  const gptOss = /gpt-oss/.test(rota.modelo);
  const raciocinio = gptOss
    ? { reasoning_effort: jeito.pensar ? 'medium' : 'low', include_reasoning: false }
    : { reasoning_effort: jeito.pensar ? 'default' : 'none', reasoning_format: 'hidden' };
  const r = await postar(
    `${BASE_GROQ}/chat/completions`,
    { Authorization: `Bearer ${chave}` },
    {
      model: rota.modelo,
      temperature: 0.2,
      messages,
      max_completion_tokens: gptOss ? jeito.tokens + 2_000 : jeito.tokens,
      ...raciocinio,
      ...(p.json ? { response_format: { type: 'json_object' } } : {}),
    },
    tempoDaChamada(p, 'groq'),
  );
  return textoDoChat(await lerResposta<RespostaChat>(r, rota), rota, jeito);
}

// ---------------------------------------------------------------- Gemini (API nativa: lê PDF e imagem)

/** O Gemini lê PDF e imagem direto; arquivo grande demais para o pedido (limite de 20 MB) vai preparado. */
const MAX_ANEXO_DIRETO = 8 * 1024 * 1024;
const MAX_ANEXOS_DIRETO = 14 * 1024 * 1024;
const geminiLeDireto = (anexos: Anexo[]) =>
  anexos.every((a) => a.dados.byteLength <= MAX_ANEXO_DIRETO) && anexos.reduce((t, a) => t + a.dados.byteLength, 0) <= MAX_ANEXOS_DIRETO;

async function chamarGemini(chave: string, rota: RotaIa, p: Pedido): Promise<RespostaIa> {
  const anexos = geminiLeDireto(p.anexos)
    ? p.anexos.map((a) => ({ inline_data: { mime_type: a.mime, data: base64(a.dados) } }))
    : (await p.preparados(MAX_IMAGENS.gemini)).map((x) =>
        x.tipo === 'texto' ? { text: x.texto } : { inline_data: { mime_type: x.mime, data: base64(x.dados) } },
      );
  const contents = p.mensagens.map((m, i) => ({
    role: m.papel === 'assistente' ? 'model' : 'user',
    // Os anexos vão junto da última mensagem de quem pergunta.
    parts: [...(i === p.mensagens.length - 1 ? anexos : []), { text: m.texto }],
  }));
  const corpo = {
    ...(p.sistema ? { systemInstruction: { parts: [{ text: p.sistema }] } } : {}),
    contents,
    // Sem maxOutputTokens: no Gemini o raciocínio entra no limite e cortaria a resposta.
    generationConfig: { temperature: 0.2, ...(p.json ? { responseMimeType: 'application/json' } : {}) },
  };
  const r = await postar(
    `${BASE_GEMINI}/models/${encodeURIComponent(rota.modelo)}:generateContent`,
    { 'x-goog-api-key': chave },
    corpo,
    tempoDaChamada(p, 'gemini'),
  );
  const json = await lerResposta<{
    candidates?: { content?: { parts?: { text?: string; thought?: boolean }[] }; finishReason?: string }[];
    promptFeedback?: { blockReason?: string };
    modelVersion?: string;
  }>(r, rota);
  if (json.promptFeedback?.blockReason) throw new ErroPassageiro('A IA se recusou a ler este conteúdo.');
  const texto = (json.candidates?.[0]?.content?.parts ?? []).filter((x) => !x.thought).map((x) => x.text ?? '').join('');
  if (!texto.trim()) {
    console.error(`IA (${rotulo(rota)}) respondeu vazio (fim: ${json.candidates?.[0]?.finishReason ?? '?'}).`);
    throw new ErroPassageiro('A IA não respondeu nada desta vez. Tente de novo.');
  }
  return { texto, modelo: `gemini:${json.modelVersion || rota.modelo}` };
}

// ---------------------------------------------------------------- entrada

/** Uma rota: sem pensar; se o modelo gastou o limite pensando (ou exige pensar), mais uma vez no mesmo modelo. */
async function tentarRota(rota: RotaIa, chave: string, p: Pedido): Promise<RespostaIa> {
  const chamar = (jeito: Jeito) =>
    rota.provedor === 'gemini' ? chamarGemini(chave, rota, p) : rota.provedor === 'groq' ? chamarGroq(chave, rota, p, jeito) : chamarOpenRouter(chave, rota, p, jeito);
  try {
    return await chamar({ pensar: false, tokens: p.maxTokens });
  } catch (erro) {
    if (!(erro instanceof ErroCortado) || rota.provedor === 'gemini') throw erro;
    return chamar({ pensar: erro.pensaSempre, tokens: p.maxTokens + TOKENS_PENSANDO });
  }
}

/**
 * Conversa com a IA pela fila do tipo de pedido: cada modelo uma vez, na ordem; o que falha passa ao próximo. Sem
 * `tarefa`, pedido com anexo é leitura e sem anexo é conversa.
 */
export async function conversarIa(p: {
  tarefa?: TarefaIa;
  sistema?: string;
  mensagens: MensagemIa[];
  anexos?: Anexo[];
  json?: boolean;
  /** Prazo total, somando todas as tentativas. */
  prazoMs?: number;
  /** Tamanho da resposta (sem contar o raciocínio). */
  maxTokens?: number;
}): Promise<RespostaIa> {
  const anexos = p.anexos ?? [];
  const tarefa: TarefaIa = p.tarefa ?? (anexos.length > 0 ? 'leitura' : 'conversa');
  const preparos = new Map<number, Promise<ParteIa[]>>();
  const pedido: Pedido = {
    tarefa,
    sistema: p.sistema,
    mensagens: p.mensagens,
    anexos,
    json: p.json ?? false,
    preparados: (n) => {
      let pronto = preparos.get(n);
      if (!pronto) preparos.set(n, (pronto = prepararAnexosIa(anexos, n)));
      return pronto;
    },
    fim: Date.now() + (p.prazoMs ?? PRAZO_PADRAO[tarefa]),
    maxTokens: p.maxTokens ?? TOKENS_PADRAO,
  };

  const c = chaves();
  const rotas = rotasIa(tarefa);
  if (rotas.length === 0) throw new ErroIa('A IA não está ligada. Cadastre GROQ_CHAVE, API_OPENROUTER ou IA_CHAVE na Vercel.');
  const disponiveis = rotas.filter((r) => !rotaDeFora(r));
  // Todos de fora (cota ou sobrecarga recentes): tenta mesmo assim o primeiro, em vez de recusar sem perguntar.
  const fila = disponiveis.length > 0 ? disponiveis : rotas.slice(0, 1);

  const falhas: string[] = [];
  const erros: ErroIa[] = [];
  for (const rota of fila) {
    if (falhas.length > 0 && pedido.fim - Date.now() < 15_000) break;
    const inicio = Date.now();
    try {
      const r = await tentarRota(rota, c[rota.provedor]!, pedido);
      console.info(`IA ${tarefa}: ${r.modelo} respondeu em ${segundos(inicio)}${falhas.length ? ` (antes: ${falhas.join('; ')})` : ''}.`);
      return r;
    } catch (erro) {
      const e = erro instanceof ErroIa ? erro : new ErroPassageiro('A IA não respondeu.');
      if (!(erro instanceof ErroIa)) console.error(`IA (${rotulo(rota)}) falhou de um jeito inesperado`, erro);
      falhas.push(`${rotulo(rota)} ${segundos(inicio)}: ${e.message}`);
      if (e instanceof ErroTempo) {
        console.error(`IA ${tarefa}: sem tempo depois de ${falhas.join('; ')}`);
        throw e;
      }
      erros.push(e);
    }
  }
  console.error(`IA ${tarefa}: nenhum modelo respondeu (${falhas.join('; ')}).`);
  throw new ErroIa(mensagemFinal(erros));
}

/** O motivo que mais ajuda quem está na tela, entre as falhas de todos os modelos tentados. */
function mensagemFinal(erros: ErroIa[]): string {
  const com = (re: RegExp) => erros.find((e) => re.test(e.message))?.message;
  return (
    com(/grandes demais/) ??
    (erros.every((e) => /chave/.test(e.message)) ? erros[0]?.message : undefined) ??
    com(/limite gratuito/) ??
    (erros.some((e) => /demorou/.test(e.message)) ? 'A IA demorou demais para responder. Tente de novo com menos arquivos, ou mais tarde.' : undefined) ??
    'Os modelos de IA estão ocupados agora. Tente de novo em alguns minutos.'
  );
}

/** Pedido de leitura (texto + arquivos) com resposta em JSON. */
export async function perguntarIa(
  instrucao: string,
  anexos: Anexo[] = [],
  opcoes: { prazoMs?: number; maxTokens?: number; tarefa?: TarefaIa } = {},
): Promise<RespostaIa> {
  return conversarIa({ mensagens: [{ papel: 'usuario', texto: instrucao }], anexos, json: true, ...opcoes });
}
