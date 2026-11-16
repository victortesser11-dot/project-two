import 'server-only';

// Camada de IA plugável. O app pede "leia isto e responda em JSON" e não sabe qual modelo responde: o provedor é
// escolhido pelas variáveis da Vercel. A chave mora só aqui, no servidor; nunca vai para o navegador.
//
//   IA_CHAVE     chave do provedor (sem ela, as funções de IA ficam escondidas e o app segue normal)
//   IA_PROVEDOR  "gemini" (padrão, lê PDF e imagem) ou "openai" (qualquer API compatível: OpenRouter, Groq...; só imagem)
//   IA_MODELO    padrão "gemini-flash-latest" (o Google aponta para o Flash mais novo)
//   IA_URL       só para "openai": ex. https://openrouter.ai/api/v1
//   IA_LIMITE_DIA leituras por obra por dia (padrão 20), para não estourar a cota grátis

export type Anexo = { mime: string; dados: Uint8Array; nome: string };
export type RespostaIa = { texto: string; modelo: string };

export class ErroIa extends Error {}

const BASE_GEMINI = 'https://generativelanguage.googleapis.com/v1beta';
const TEMPO_MAXIMO = 150_000;

export function iaConfigurada(): boolean {
  return Boolean(process.env.IA_CHAVE);
}

export function limiteDiarioIa(): number {
  const n = Number(process.env.IA_LIMITE_DIA);
  return Number.isInteger(n) && n > 0 ? n : 20;
}

function provedor(): 'gemini' | 'openai' {
  return process.env.IA_PROVEDOR === 'openai' ? 'openai' : 'gemini';
}

/** O provedor configurado lê PDF? (O Gemini lê; as APIs compatíveis com OpenAI, em geral, só imagem.) */
export function iaLePdf(): boolean {
  return provedor() === 'gemini';
}

function base64(dados: Uint8Array): string {
  return Buffer.from(dados).toString('base64');
}

/** Mensagem para a tela a partir do status e do corpo do erro do provedor. */
function erroDoProvedor(status: number, corpo: string): ErroIa {
  if (status === 429 || /RESOURCE_EXHAUSTED|quota|rate.?limit/i.test(corpo)) {
    return new ErroIa('O limite gratuito da IA acabou por agora. Tente de novo mais tarde (a cota grátis renova todo dia).');
  }
  if (status === 401 || status === 403 || /API_KEY_INVALID|API key not valid|PERMISSION_DENIED/i.test(corpo)) {
    return new ErroIa('A chave da IA foi recusada. Confira a variável IA_CHAVE na Vercel.');
  }
  if (status === 413 || /too large|exceeds the maximum|payload size/i.test(corpo)) {
    return new ErroIa('Os arquivos ficaram grandes demais para uma leitura. Escolha menos arquivos de cada vez.');
  }
  if (status >= 500) return new ErroIa('O serviço de IA está fora do ar ou sobrecarregado. Tente de novo em alguns minutos.');
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
    throw new ErroIa(tempo ? 'A IA demorou demais para responder. Tente com menos arquivos.' : 'Não foi possível falar com o serviço de IA agora.');
  }
}

// ---------------------------------------------------------------- Gemini (API nativa: lê PDF e imagem)

let modeloReserva: string | null = null;

/** Quando o modelo pedido não existe mais (alias aposentado), escolhe o Flash mais novo da lista do Google. */
async function acharModeloFlash(chave: string): Promise<string | null> {
  if (modeloReserva) return modeloReserva;
  const r = await fetch(`${BASE_GEMINI}/models?pageSize=200`, { headers: { 'x-goog-api-key': chave }, cache: 'no-store' }).catch(() => null);
  if (!r?.ok) return null;
  const { models = [] } = (await r.json().catch(() => ({}))) as { models?: { name: string; supportedGenerationMethods?: string[] }[] };
  const candidatos = models
    .filter((m) => m.supportedGenerationMethods?.includes('generateContent'))
    .map((m) => m.name.replace(/^models\//, ''))
    .filter((n) => /flash/.test(n) && !/lite|image|tts|audio|live|thinking|exp/.test(n))
    .sort((a, b) => b.localeCompare(a, 'en', { numeric: true }));
  modeloReserva = candidatos.find((n) => !/preview/.test(n)) ?? candidatos[0] ?? null;
  return modeloReserva;
}

async function perguntarGemini(chave: string, modelo: string, instrucao: string, anexos: Anexo[], tentativa = 0): Promise<RespostaIa> {
  const corpo = {
    contents: [{ role: 'user', parts: [...anexos.map((a) => ({ inline_data: { mime_type: a.mime, data: base64(a.dados) } })), { text: instrucao }] }],
    generationConfig: { responseMimeType: 'application/json', temperature: 0.2 },
  };
  const r = await postar(`${BASE_GEMINI}/models/${encodeURIComponent(modelo)}:generateContent`, { 'x-goog-api-key': chave }, corpo);
  if (r.status === 404 && tentativa === 0) {
    const outro = await acharModeloFlash(chave);
    if (outro && outro !== modelo) return perguntarGemini(chave, outro, instrucao, anexos, 1);
  }
  if ((r.status === 503 || r.status === 500) && tentativa === 0) {
    await new Promise((ok) => setTimeout(ok, 3000));
    return perguntarGemini(chave, modelo, instrucao, anexos, 1);
  }
  const textoBruto = await r.text();
  if (!r.ok) {
    console.error(`IA (Gemini ${modelo}) recusou: ${r.status} ${textoBruto.slice(0, 500)}`);
    throw erroDoProvedor(r.status, textoBruto);
  }
  const json = JSON.parse(textoBruto) as {
    candidates?: { content?: { parts?: { text?: string }[] }; finishReason?: string }[];
    promptFeedback?: { blockReason?: string };
    modelVersion?: string;
  };
  if (json.promptFeedback?.blockReason) throw new ErroIa('A IA se recusou a ler este conteúdo. Tente com outros arquivos.');
  const texto = (json.candidates?.[0]?.content?.parts ?? []).map((p) => p.text ?? '').join('');
  if (!texto) throw new ErroIa('A IA não respondeu nada desta vez. Tente de novo.');
  return { texto, modelo: json.modelVersion || modelo };
}

// ---------------------------------------------------------------- API compatível com OpenAI (OpenRouter, Groq...)

async function perguntarCompativel(chave: string, modelo: string, instrucao: string, anexos: Anexo[]): Promise<RespostaIa> {
  const url = (process.env.IA_URL || 'https://openrouter.ai/api/v1').replace(/\/$/, '');
  if (anexos.some((a) => !a.mime.startsWith('image/'))) {
    throw new ErroIa('O provedor de IA configurado não lê PDF. Use o Gemini (IA_PROVEDOR=gemini) ou envie a prancha como imagem.');
  }
  const r = await postar(
    `${url}/chat/completions`,
    { Authorization: `Bearer ${chave}` },
    {
      model: modelo,
      temperature: 0.2,
      response_format: { type: 'json_object' },
      messages: [
        {
          role: 'user',
          content: [
            ...anexos.map((a) => ({ type: 'image_url', image_url: { url: `data:${a.mime};base64,${base64(a.dados)}` } })),
            { type: 'text', text: instrucao },
          ],
        },
      ],
    },
  );
  const textoBruto = await r.text();
  if (!r.ok) {
    console.error(`IA (${url} ${modelo}) recusou: ${r.status} ${textoBruto.slice(0, 500)}`);
    throw erroDoProvedor(r.status, textoBruto);
  }
  const json = JSON.parse(textoBruto) as { choices?: { message?: { content?: string } }[]; model?: string };
  const texto = json.choices?.[0]?.message?.content ?? '';
  if (!texto) throw new ErroIa('A IA não respondeu nada desta vez. Tente de novo.');
  return { texto, modelo: json.model || modelo };
}

/** Manda o pedido (texto + arquivos) ao provedor configurado e devolve o texto da resposta (JSON a validar). */
export async function perguntarIa(instrucao: string, anexos: Anexo[] = []): Promise<RespostaIa> {
  const chave = process.env.IA_CHAVE;
  if (!chave) throw new ErroIa('A IA não está ligada. Cadastre a variável IA_CHAVE na Vercel.');
  if (provedor() === 'openai') {
    const modelo = process.env.IA_MODELO;
    if (!modelo) throw new ErroIa('Com IA_PROVEDOR=openai, informe o modelo em IA_MODELO (ex.: um modelo ":free" do OpenRouter que leia imagem).');
    return perguntarCompativel(chave, modelo, instrucao, anexos);
  }
  return perguntarGemini(chave, process.env.IA_MODELO || 'gemini-flash-latest', instrucao, anexos);
}
