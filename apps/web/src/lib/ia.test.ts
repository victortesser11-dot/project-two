import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));
// O preparo de verdade (PDF.js + canvas) é testado à parte; aqui só importa que as partes cheguem ao provedor.
const preparar = vi.fn(async (anexos: { nome: string }[]) => [
  { tipo: 'texto' as const, texto: `Texto de "${anexos[0]?.nome.split('/').pop()}"` },
  { tipo: 'imagem' as const, mime: 'image/jpeg', dados: new Uint8Array([9]), nome: 'p1' },
]);
vi.mock('@/lib/anexosIa', () => ({ prepararAnexosIa: (a: { nome: string }[]) => preparar(a) }));

const resposta = (status: number, corpo: unknown) =>
  new Response(typeof corpo === 'string' ? corpo : JSON.stringify(corpo), { status, headers: { 'Content-Type': 'application/json' } });

const okGemini = (texto: string, modelo?: string) =>
  resposta(200, { candidates: [{ content: { parts: [{ text: texto }] } }], ...(modelo ? { modelVersion: modelo } : {}) });
const sobrecarga = () => resposta(503, { error: { code: 503, message: 'This model is currently experiencing high demand.', status: 'UNAVAILABLE' } });
const listaGoogle = (...nomes: string[]) =>
  resposta(200, { models: nomes.map((n) => ({ name: `models/${n}`, supportedGenerationMethods: ['generateContent'] })) });

describe('camada de IA', () => {
  const fetchOriginal = globalThis.fetch;
  let chamadas: { url: string; corpo: unknown; cabecalhos: Record<string, string> }[];

  beforeEach(() => {
    vi.resetModules();
    chamadas = [];
    process.env.IA_CHAVE = 'chave-gemini';
    delete process.env.OPENROUTER_CHAVE;
    delete process.env.API_OPENROUTER;
    delete process.env.OPENROUTER_MODELO;
    delete process.env.IA_MODELO;
    delete process.env.IA_PRINCIPAL;
    preparar.mockClear();
  });
  afterEach(() => {
    globalThis.fetch = fetchOriginal;
  });

  function responder(...respostas: Response[]) {
    globalThis.fetch = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
      chamadas.push({ url: String(url), corpo: init?.body ? JSON.parse(String(init.body)) : null, cabecalhos: (init?.headers ?? {}) as Record<string, string> });
      return respostas.shift() ?? resposta(500, 'sem resposta');
    }) as typeof fetch;
  }

  it('Gemini: manda o PDF junto, pede JSON e devolve o texto', async () => {
    responder(okGemini('{"resumo":"ok"}', 'gemini-x-flash'));
    const { perguntarIa } = await import('./ia');
    const r = await perguntarIa('Leia', [{ mime: 'application/pdf', dados: new Uint8Array([1, 2, 3]), nome: 'ARQ 01.pdf' }]);
    expect(r).toEqual({ texto: '{"resumo":"ok"}', modelo: 'gemini-x-flash' });
    expect(chamadas[0]!.url).toContain('/models/gemini-flash-latest:generateContent');
    expect(chamadas[0]!.cabecalhos['x-goog-api-key']).toBe('chave-gemini');
    const corpo = chamadas[0]!.corpo as { contents: { parts: unknown[] }[]; generationConfig: { responseMimeType: string } };
    expect(corpo.contents[0]!.parts[0]).toEqual({ inline_data: { mime_type: 'application/pdf', data: 'AQID' } });
    expect(corpo.generationConfig.responseMimeType).toBe('application/json');
  });

  it('modelo sobrecarregado (503): tenta o Flash mais novo da lista do Google, sem lite e sem prévia primeiro', async () => {
    responder(
      sobrecarga(),
      listaGoogle('gemini-3.6-flash', 'gemini-3.8-flash', 'gemini-3.9-flash-lite', 'gemini-3.9-flash-preview', 'gemini-3.8-pro'),
      sobrecarga(),
      okGemini('{}'),
    );
    const { perguntarIa } = await import('./ia');
    const r = await perguntarIa('Leia');
    expect(chamadas.map((c) => c.url.replace(/^.*\/models/, ''))).toEqual([
      '/gemini-flash-latest:generateContent',
      '?pageSize=200',
      '/gemini-3.8-flash:generateContent',
      '/gemini-3.6-flash:generateContent',
    ]);
    expect(r.modelo).toBe('gemini-3.6-flash');
  });

  it('todos os modelos sobrecarregados e sem OpenRouter: mensagem de sobrecarga, sem insistir sem fim', async () => {
    responder(sobrecarga(), listaGoogle('gemini-3.1-flash', 'gemini-3.2-flash', 'gemini-3.3-flash', 'gemini-3.4-flash'), sobrecarga(), sobrecarga(), sobrecarga());
    const { perguntarIa } = await import('./ia');
    await expect(perguntarIa('x')).rejects.toThrow('sobrecarregado');
    expect(chamadas.filter((c) => c.url.includes(':generateContent'))).toHaveLength(4);
  });

  it('com as duas chaves, o OpenRouter é o principal e o PDF vai aberto (texto + imagens), sem leitor de arquivo', async () => {
    process.env.API_OPENROUTER = 'chave-or';
    responder(resposta(200, { choices: [{ message: { content: '{}' } }], model: 'x:free' }));
    const { perguntarIa } = await import('./ia');
    const r = await perguntarIa('Leia', [{ mime: 'application/pdf', dados: new Uint8Array(11e6), nome: 'proj/ARQ 01 - Carimbado.pdf' }]);
    expect(r.modelo).toBe('openrouter:x:free');
    expect(chamadas).toHaveLength(1);
    const corpo = chamadas[0]!.corpo as { plugins?: unknown; messages: { content: { type: string; text?: string; image_url?: { url: string } }[] }[] };
    expect(corpo.plugins).toBeUndefined();
    expect(corpo.messages[0]!.content).toEqual([
      { type: 'text', text: 'Texto de "ARQ 01 - Carimbado.pdf"' },
      { type: 'image_url', image_url: { url: 'data:image/jpeg;base64,CQ==' } },
      { type: 'text', text: 'Leia' },
    ]);
  });

  it('Gemini: PDF grande demais para o pedido também vai aberto pelo servidor', async () => {
    responder(okGemini('{}'));
    const { perguntarIa } = await import('./ia');
    await perguntarIa('Leia', [{ mime: 'application/pdf', dados: new Uint8Array(9 * 1024 * 1024), nome: 'ARQ.pdf' }]);
    const corpo = chamadas[0]!.corpo as { contents: { parts: unknown[] }[] };
    expect(corpo.contents[0]!.parts).toEqual([{ text: 'Texto de "ARQ.pdf"' }, { inline_data: { mime_type: 'image/jpeg', data: 'CQ==' } }, { text: 'Leia' }]);
  });

  it('IA_PRINCIPAL=gemini: Gemini caiu, o OpenRouter (roteador grátis) responde com o PDF aberto', async () => {
    process.env.API_OPENROUTER = 'chave-or';
    process.env.IA_PRINCIPAL = 'gemini';
    responder(sobrecarga(), listaGoogle(), resposta(200, { choices: [{ message: { content: '{"a":1}' } }], model: 'qwen/algum:free' }));
    const { perguntarIa } = await import('./ia');
    const r = await perguntarIa('Leia', [{ mime: 'application/pdf', dados: new Uint8Array([1]), nome: 'proj/ARQ 01.pdf' }]);
    expect(r).toEqual({ texto: '{"a":1}', modelo: 'openrouter:qwen/algum:free' });
    const or = chamadas[2]!;
    expect(or.url).toBe('https://openrouter.ai/api/v1/chat/completions');
    expect(or.cabecalhos.Authorization).toBe('Bearer chave-or');
    const corpo = or.corpo as { model: string; messages: { content: { type: string; text?: string }[] }[] };
    expect(corpo.model).toBe('openrouter/free');
    expect(corpo.messages[0]!.content[0]).toEqual({ type: 'text', text: 'Texto de "ARQ 01.pdf"' });
    // Modelo que pensa pouco (responde mais rápido).
    expect((or.corpo as { reasoning: unknown }).reasoning).toEqual({ effort: 'low', exclude: true });
    // O PDF pequeno foi direto ao Gemini; o preparo só rodou para o OpenRouter.
    expect(preparar).toHaveBeenCalledTimes(1);
  });

  it('modelo sem cota no plano grátis ("limit: 0") e o sobrecarregado ficam de fora na próxima pergunta; "omni" nem entra', async () => {
    process.env.API_OPENROUTER = 'chave-or';
    process.env.IA_PRINCIPAL = 'gemini';
    const semCota = () =>
      resposta(429, { error: { code: 429, message: 'Quota exceeded for metric: generate_content_free_tier_requests, limit: 0, model: gemini-3.1-flash', status: 'RESOURCE_EXHAUSTED' } });
    const okOr = () => resposta(200, { choices: [{ message: { content: 'ok' } }], model: 'x:free' });
    responder(sobrecarga(), listaGoogle('gemini-omni-1.2-flash', 'gemini-3.1-flash'), semCota(), okOr(), okOr());
    const { conversarIa } = await import('./ia');
    await conversarIa({ mensagens: [{ papel: 'usuario', texto: 'oi' }] });
    expect(chamadas.some((c) => c.url.includes('omni'))).toBe(false);
    const antes = chamadas.length;
    const r = await conversarIa({ mensagens: [{ papel: 'usuario', texto: 'de novo' }] });
    expect(r.modelo).toBe('openrouter:x:free');
    // Na segunda pergunta nenhum Gemini é chamado: vai direto à reserva.
    expect(chamadas.slice(antes).map((c) => c.url)).toEqual(['https://openrouter.ai/api/v1/chat/completions']);
  });

  it('os dois provedores falharam: a mensagem diz o motivo de cada um', async () => {
    process.env.API_OPENROUTER = 'chave-or';
    process.env.IA_PRINCIPAL = 'gemini';
    responder(sobrecarga(), listaGoogle(), resposta(200, { error: { code: 413, message: 'context length exceeded' } }));
    const { perguntarIa } = await import('./ia');
    await expect(perguntarIa('x')).rejects.toThrow(/sobrecarregado.*reserva também falhou.*grandes demais/);
  });

  it('chave recusada não tenta outro modelo nem outro provedor', async () => {
    process.env.OPENROUTER_CHAVE = 'chave-or';
    responder(resposta(400, { error: { message: 'API key not valid', status: 'INVALID_ARGUMENT' } }));
    const { perguntarIa } = await import('./ia');
    await expect(perguntarIa('x')).rejects.toThrow('IA_CHAVE');
    expect(chamadas).toHaveLength(1);
  });

  it('conversa: instrução do sistema e histórico com papéis', async () => {
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

  it('só com OpenRouter também funciona; sem nenhuma chave, a IA fica desligada', async () => {
    delete process.env.IA_CHAVE;
    process.env.OPENROUTER_CHAVE = 'chave-or';
    responder(resposta(200, { choices: [{ message: { content: 'ok' } }] }));
    let ia = await import('./ia');
    expect(ia.iaConfigurada()).toBe(true);
    expect((await ia.conversarIa({ mensagens: [{ papel: 'usuario', texto: 'oi' }] })).texto).toBe('ok');
    delete process.env.OPENROUTER_CHAVE;
    vi.resetModules();
    ia = await import('./ia');
    expect(ia.iaConfigurada()).toBe(false);
    await expect(ia.perguntarIa('x')).rejects.toThrow('não está ligada');
  });

  it('prazo do pedido: sem tempo para mais uma tentativa, para e explica (não chega a cortar a página)', async () => {
    process.env.API_OPENROUTER = 'chave-or';
    responder();
    const { perguntarIa } = await import('./ia');
    await expect(perguntarIa('x', [], { prazoMs: 10_000 })).rejects.toThrow('demorou demais');
    expect(chamadas).toHaveLength(0);
  });

  it('pede resposta curta quando a tela manda (modelo grátis escreve devagar)', async () => {
    process.env.API_OPENROUTER = 'chave-or';
    responder(resposta(200, { choices: [{ message: { content: '{}' } }] }));
    const { perguntarIa } = await import('./ia');
    await perguntarIa('x', [], { maxTokens: 3_000 });
    expect((chamadas[0]!.corpo as { max_tokens: number }).max_tokens).toBe(3_000);
  });

  it('limite diário: padrão 20, ajustável pela variável', async () => {
    const { limiteDiarioIa } = await import('./ia');
    delete process.env.IA_LIMITE_DIA;
    expect(limiteDiarioIa()).toBe(20);
    process.env.IA_LIMITE_DIA = '5';
    expect(limiteDiarioIa()).toBe(5);
    process.env.IA_LIMITE_DIA = 'abc';
    expect(limiteDiarioIa()).toBe(20);
  });
});
