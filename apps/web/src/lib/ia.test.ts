import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));
// O preparo de verdade (PDF.js + canvas) é testado à parte; aqui só importa que as partes cheguem ao provedor.
const preparar = vi.fn(async (anexos: { nome: string; mime: string }[], max?: number) => {
  void max;
  const fotos = anexos.filter((a) => a.mime.startsWith('image/'));
  if (fotos.length > 0) return fotos.map((f) => ({ tipo: 'imagem' as const, mime: 'image/jpeg', dados: new Uint8Array([7]), nome: f.nome }));
  return [
    { tipo: 'texto' as const, texto: `Texto de "${anexos[0]?.nome.split('/').pop()}"` },
    { tipo: 'imagem' as const, mime: 'image/jpeg', dados: new Uint8Array([9]), nome: 'p1' },
  ];
});
vi.mock('@/lib/anexosIa', () => ({ MAX_IMAGENS_PEDIDO: 8, prepararAnexosIa: (a: { nome: string; mime: string }[], n?: number) => preparar(a, n) }));

const resposta = (status: number, corpo: unknown, cabecalhos: Record<string, string> = {}) =>
  new Response(typeof corpo === 'string' ? corpo : JSON.stringify(corpo), { status, headers: { 'Content-Type': 'application/json', ...cabecalhos } });
const chat = (texto: string, modelo = 'm', fim = 'stop') => resposta(200, { choices: [{ message: { content: texto }, finish_reason: fim }], model: modelo });
const okGemini = (texto: string, modelo?: string) =>
  resposta(200, { candidates: [{ content: { parts: [{ text: 'pensando...', thought: true }, { text: texto }] } }], ...(modelo ? { modelVersion: modelo } : {}) });
const pdf = (nome = 'proj/ARQ 01.pdf') => ({ mime: 'application/pdf', dados: new Uint8Array([1, 2, 3]), nome });
const foto = (n: number) => ({ mime: 'image/jpeg', dados: new Uint8Array([n]), nome: `foto${n}.jpg` });

type Chamada = { url: string; corpo: Record<string, unknown>; cabecalhos: Record<string, string> };

describe('camada de IA', () => {
  const fetchOriginal = globalThis.fetch;
  let chamadas: Chamada[];

  beforeEach(() => {
    vi.resetModules();
    chamadas = [];
    for (const v of ['IA_CHAVE', 'GROQ_CHAVE', 'GROQ_API_KEY', 'API_OPENROUTER', 'OPENROUTER_CHAVE', 'IA_CONVERSA', 'IA_LEITURA', 'IA_LIMITE_DIA']) delete process.env[v];
    process.env.GROQ_CHAVE = 'chave-groq';
    process.env.API_OPENROUTER = 'chave-or';
    process.env.IA_CHAVE = 'chave-gemini';
    preparar.mockClear();
  });
  afterEach(() => {
    globalThis.fetch = fetchOriginal;
    vi.useRealTimers();
  });

  function responder(...respostas: Response[]) {
    globalThis.fetch = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
      chamadas.push({ url: String(url), corpo: init?.body ? JSON.parse(String(init.body)) : null, cabecalhos: (init?.headers ?? {}) as Record<string, string> });
      return respostas.shift() ?? resposta(500, 'sem resposta');
    }) as typeof fetch;
  }
  const modelos = () => chamadas.map((c) => (c.url.includes('generativelanguage') ? `gemini:${c.url.replace(/^.*\/models\/|:generateContent$/g, '')}` : `${c.url.includes('groq') ? 'groq' : 'openrouter'}:${String(c.corpo.model)}`));

  it('conversa: Groq primeiro (rápido), pensando pouco, sem devolver o raciocínio, em JSON', async () => {
    responder(chat('{"resumo":"ok"}', 'openai/gpt-oss-120b'));
    const { conversarIa } = await import('./ia');
    const r = await conversarIa({ sistema: 'Você é o assistente.', mensagens: [{ papel: 'usuario', texto: 'O que atrasou?' }], json: true, maxTokens: 2_000 });
    expect(r).toEqual({ texto: '{"resumo":"ok"}', modelo: 'groq:openai/gpt-oss-120b' });
    const c = chamadas[0]!;
    expect(c.url).toBe('https://api.groq.com/openai/v1/chat/completions');
    expect(c.cabecalhos.Authorization).toBe('Bearer chave-groq');
    expect(c.corpo).toMatchObject({
      model: 'openai/gpt-oss-120b',
      reasoning_effort: 'low',
      include_reasoning: false,
      max_completion_tokens: 4_000,
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: 'Você é o assistente.' },
        { role: 'user', content: 'O que atrasou?' },
      ],
    });
  });

  it('leitura: OpenRouter com modelo de visão, sem raciocínio, PDF aberto pelo servidor (texto + imagens)', async () => {
    responder(chat('{}', 'nvidia/nemotron-3.5-super-vl:free'));
    const { perguntarIa } = await import('./ia');
    const r = await perguntarIa('Leia', [pdf('proj/ARQ 01 - Carimbado.pdf')], { maxTokens: 3_000 });
    expect(r.modelo).toBe('openrouter:nvidia/nemotron-3.5-super-vl:free');
    const c = chamadas[0]!;
    expect(c.url).toBe('https://openrouter.ai/api/v1/chat/completions');
    expect(c.corpo).toMatchObject({
      model: 'nvidia/nemotron-3.5-super-vl:free',
      reasoning: { effort: 'none', exclude: true },
      max_tokens: 3_000,
      response_format: { type: 'json_object' },
    });
    expect((c.corpo.messages as { content: unknown }[])[0]!.content).toEqual([
      { type: 'text', text: 'Texto de "ARQ 01 - Carimbado.pdf"' },
      { type: 'image_url', image_url: { url: 'data:image/jpeg;base64,CQ==' } },
      { type: 'text', text: 'Leia' },
    ]);
    expect(preparar).toHaveBeenCalledWith(expect.anything(), 8);
  });

  it('modelo gastou o limite pensando (vazio, "length"): repete no mesmo modelo com mais espaço, sem ir a outro', async () => {
    responder(chat('', 'nvidia/nemotron-3.5-super-vl:free', 'length'), chat('{"ok":1}', 'nvidia/nemotron-3.5-super-vl:free'));
    const { perguntarIa } = await import('./ia');
    const r = await perguntarIa('Leia', [pdf()], { maxTokens: 3_000 });
    expect(r.texto).toBe('{"ok":1}');
    expect(modelos()).toEqual(['openrouter:nvidia/nemotron-3.5-super-vl:free', 'openrouter:nvidia/nemotron-3.5-super-vl:free']);
    expect(chamadas[1]!.corpo.max_tokens).toBe(11_000);
  });

  it('modelo que exige raciocínio recusa o "sem pensar": repete pensando pouco', async () => {
    responder(resposta(400, { error: { code: 400, message: 'Reasoning is mandatory for this endpoint and cannot be disabled.' } }), chat('{}'));
    const { perguntarIa } = await import('./ia');
    await perguntarIa('Leia', [pdf()]);
    expect(chamadas[1]!.corpo.reasoning).toEqual({ effort: 'low', exclude: true });
    expect(chamadas[1]!.corpo.model).toBe(chamadas[0]!.corpo.model);
  });

  it('cota diária dos grátis do OpenRouter acabou: pula todos os ":free" até a meia-noite UTC e segue no Groq', async () => {
    const semCota = () => resposta(429, { error: { code: 429, message: 'Rate limit exceeded: free-models-per-day. Add 10 credits to unlock 1000 free model requests per day' } });
    responder(semCota(), chat('{"a":1}', 'qwen/qwen3.8-27b'), chat('{"b":2}', 'qwen/qwen3.8-27b'));
    const { perguntarIa } = await import('./ia');
    expect((await perguntarIa('Leia', [pdf()])).modelo).toBe('groq:qwen/qwen3.8-27b');
    expect(chamadas[1]!.corpo).toMatchObject({ reasoning_effort: 'none', reasoning_format: 'hidden' });
    expect(preparar).toHaveBeenCalledWith(expect.anything(), 3);
    const antes = chamadas.length;
    await perguntarIa('De novo', [pdf()]);
    expect(modelos().slice(antes)).toEqual(['groq:qwen/qwen3.8-27b']);
  });

  it('Groq lê até 3 imagens: com 4 fotos ele fica de fora sem gastar pedido', async () => {
    responder(resposta(503, { error: { code: 503, message: 'overloaded' } }), okGemini('{}', 'gemini-x-flash'));
    const { perguntarIa } = await import('./ia');
    const r = await perguntarIa('Leia as fotos', [foto(1), foto(2), foto(3), foto(4)]);
    expect(r.modelo).toBe('gemini:gemini-x-flash');
    expect(modelos()).toEqual(['openrouter:nvidia/nemotron-3.5-super-vl:free', 'gemini:gemini-flash-latest']);
  });

  it('Gemini: lê o PDF direto, sem limite de resposta (o raciocínio cortaria), e ignora o pensamento', async () => {
    process.env.IA_LEITURA = 'gemini:gemini-flash-latest';
    responder(okGemini('{"resumo":"ok"}', 'gemini-x-flash'));
    const { perguntarIa } = await import('./ia');
    const r = await perguntarIa('Leia', [pdf()]);
    expect(r).toEqual({ texto: '{"resumo":"ok"}', modelo: 'gemini:gemini-x-flash' });
    expect(chamadas[0]!.cabecalhos['x-goog-api-key']).toBe('chave-gemini');
    const corpo = chamadas[0]!.corpo as { contents: { parts: unknown[] }[]; generationConfig: Record<string, unknown> };
    expect(corpo.contents[0]!.parts[0]).toEqual({ inline_data: { mime_type: 'application/pdf', data: 'AQID' } });
    expect(corpo.generationConfig).toEqual({ temperature: 0.2, responseMimeType: 'application/json' });
    expect(preparar).not.toHaveBeenCalled();
  });

  it('a fila só usa provedores com chave, e as variáveis trocam a ordem', async () => {
    delete process.env.GROQ_CHAVE;
    const { rotasIa, lerRotas } = await import('./ia');
    expect(rotasIa('conversa').map((r) => r.provedor)).not.toContain('groq');
    process.env.IA_CONVERSA = 'gemini:gemini-flash-lite-latest, openrouter:x/y:free, groq:z, nada:w, gemini:gemini-flash-lite-latest';
    expect(rotasIa('conversa')).toEqual([
      { provedor: 'gemini', modelo: 'gemini-flash-lite-latest' },
      { provedor: 'openrouter', modelo: 'x/y:free' },
    ]);
    expect(lerRotas('openrouter:openrouter/free')).toEqual([{ provedor: 'openrouter', modelo: 'openrouter/free' }]);
  });

  it('chave recusada num provedor: o próximo responde, e esse provedor fica de fora um tempo', async () => {
    responder(resposta(401, { error: { message: 'Invalid API Key' } }), chat('ok', 'nvidia/nemotron-3.5-super-vl:free'), chat('de novo', 'nvidia/nemotron-3.5-super-vl:free'));
    const { conversarIa } = await import('./ia');
    expect((await conversarIa({ mensagens: [{ papel: 'usuario', texto: 'oi' }] })).texto).toBe('ok');
    const antes = chamadas.length;
    await conversarIa({ mensagens: [{ papel: 'usuario', texto: 'oi' }] });
    expect(modelos().slice(antes)).toEqual(['openrouter:nvidia/nemotron-3.5-super-vl:free']);
  });

  it('só chaves recusadas: a mensagem diz para conferir as chaves', async () => {
    delete process.env.IA_CHAVE;
    delete process.env.API_OPENROUTER;
    responder(resposta(401, { error: { message: 'Invalid API Key' } }), resposta(401, { error: { message: 'Invalid API Key' } }));
    const { conversarIa } = await import('./ia');
    await expect(conversarIa({ mensagens: [{ papel: 'usuario', texto: 'oi' }] })).rejects.toThrow(/chave.*GROQ_CHAVE/);
  });

  it('todos falharam: o motivo mais útil vai para a tela (arquivo grande vence sobrecarga)', async () => {
    responder(
      resposta(200, { error: { code: 413, message: 'context length exceeded' } }),
      resposta(413, { error: { message: 'Request too large for model' } }),
      resposta(503, 'overloaded'),
      resposta(503, 'overloaded'),
    );
    const { perguntarIa } = await import('./ia');
    await expect(perguntarIa('Leia', [pdf()])).rejects.toThrow('grandes demais');
    expect(chamadas).toHaveLength(4);
  });

  it('Groq lotado (429 com retry-after): fica de fora esse tempo e volta depois', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    responder(resposta(429, { error: { message: 'Rate limit reached' } }, { 'retry-after': '30' }), chat('a'), chat('b'), chat('c', 'openai/gpt-oss-120b'));
    const { conversarIa } = await import('./ia');
    const msg = { mensagens: [{ papel: 'usuario' as const, texto: 'oi' }] };
    await conversarIa(msg);
    await conversarIa(msg);
    expect(modelos()).toEqual(['groq:openai/gpt-oss-120b', 'openrouter:nvidia/nemotron-3.5-super-vl:free', 'openrouter:nvidia/nemotron-3.5-super-vl:free']);
    vi.setSystemTime(Date.now() + 31_000);
    expect((await conversarIa(msg)).modelo).toBe('groq:openai/gpt-oss-120b');
  });

  it('conversa: histórico com papéis no formato de chat e no do Gemini', async () => {
    process.env.IA_CONVERSA = 'gemini:gemini-flash-lite-latest';
    responder(okGemini('A laje do 4º atrasou 3 dias.'));
    const { conversarIa } = await import('./ia');
    const r = await conversarIa({
      sistema: 'Você é o assistente da obra.',
      mensagens: [
        { papel: 'usuario', texto: 'Oi' },
        { papel: 'assistente', texto: 'Olá!' },
        { papel: 'usuario', texto: 'O que atrasou?' },
      ],
    });
    expect(r.texto).toBe('A laje do 4º atrasou 3 dias.');
    const corpo = chamadas[0]!.corpo as { systemInstruction: unknown; contents: { role: string }[]; generationConfig: Record<string, unknown> };
    expect(corpo.systemInstruction).toEqual({ parts: [{ text: 'Você é o assistente da obra.' }] });
    expect(corpo.contents.map((c) => c.role)).toEqual(['user', 'model', 'user']);
    expect(corpo.generationConfig.responseMimeType).toBeUndefined();
  });

  it('o roteador grátis vai sem modo JSON (restringiria o sorteio a modelos que respondem vazio)', async () => {
    process.env.IA_LEITURA = 'openrouter:openrouter/free';
    responder(chat('{}', 'algum:free'));
    const { perguntarIa } = await import('./ia');
    expect((await perguntarIa('x', [pdf()])).modelo).toBe('openrouter:algum:free');
    expect(chamadas[0]!.corpo.response_format).toBeUndefined();
  });

  it('sem nenhuma chave, a IA fica desligada', async () => {
    delete process.env.GROQ_CHAVE;
    delete process.env.API_OPENROUTER;
    delete process.env.IA_CHAVE;
    const ia = await import('./ia');
    expect(ia.iaConfigurada()).toBe(false);
    expect(ia.iaLePdf()).toBe(false);
    await expect(ia.perguntarIa('x')).rejects.toThrow('não está ligada');
  });

  it('prazo do pedido: sem tempo para uma tentativa, para e explica (não chega a cortar a página)', async () => {
    responder();
    const { perguntarIa } = await import('./ia');
    await expect(perguntarIa('x', [], { prazoMs: 8_000 })).rejects.toThrow('demorou demais');
    expect(chamadas).toHaveLength(0);
  });

  it('limite diário: padrão 20, ajustável pela variável', async () => {
    const { limiteDiarioIa } = await import('./ia');
    expect(limiteDiarioIa()).toBe(20);
    process.env.IA_LIMITE_DIA = '5';
    expect(limiteDiarioIa()).toBe(5);
    process.env.IA_LIMITE_DIA = 'abc';
    expect(limiteDiarioIa()).toBe(20);
  });
});
