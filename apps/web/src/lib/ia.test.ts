import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

const resposta = (status: number, corpo: unknown) =>
  new Response(typeof corpo === 'string' ? corpo : JSON.stringify(corpo), { status, headers: { 'Content-Type': 'application/json' } });

describe('camada de IA', () => {
  const fetchOriginal = globalThis.fetch;
  let chamadas: { url: string; corpo: unknown; cabecalhos: Record<string, string> }[];

  beforeEach(() => {
    vi.resetModules();
    chamadas = [];
    process.env.IA_CHAVE = 'chave-de-teste';
    delete process.env.IA_PROVEDOR;
    delete process.env.IA_MODELO;
    delete process.env.IA_URL;
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
    responder(resposta(200, { candidates: [{ content: { parts: [{ text: '{"resumo":"ok"}' }] } }], modelVersion: 'gemini-x-flash' }));
    const { perguntarIa } = await import('./ia');
    const r = await perguntarIa('Leia', [{ mime: 'application/pdf', dados: new Uint8Array([1, 2, 3]), nome: 'ARQ 01.pdf' }]);
    expect(r).toEqual({ texto: '{"resumo":"ok"}', modelo: 'gemini-x-flash' });
    expect(chamadas[0]!.url).toContain('/models/gemini-flash-latest:generateContent');
    expect(chamadas[0]!.cabecalhos['x-goog-api-key']).toBe('chave-de-teste');
    const corpo = chamadas[0]!.corpo as { contents: { parts: unknown[] }[]; generationConfig: { responseMimeType: string } };
    expect(corpo.contents[0]!.parts[0]).toEqual({ inline_data: { mime_type: 'application/pdf', data: 'AQID' } });
    expect(corpo.generationConfig.responseMimeType).toBe('application/json');
  });

  it('modelo aposentado (404): acha o Flash mais novo na lista do Google e tenta de novo', async () => {
    responder(
      resposta(404, { error: { message: 'not found' } }),
      resposta(200, {
        models: [
          { name: 'models/gemini-3.6-flash', supportedGenerationMethods: ['generateContent'] },
          { name: 'models/gemini-3.8-flash', supportedGenerationMethods: ['generateContent'] },
          { name: 'models/gemini-3.9-flash-lite', supportedGenerationMethods: ['generateContent'] },
          { name: 'models/gemini-3.8-pro', supportedGenerationMethods: ['generateContent'] },
        ],
      }),
      resposta(200, { candidates: [{ content: { parts: [{ text: '{}' }] } }] }),
    );
    const { perguntarIa } = await import('./ia');
    const r = await perguntarIa('Leia');
    expect(r.modelo).toBe('gemini-3.8-flash');
    expect(chamadas[2]!.url).toContain('/models/gemini-3.8-flash:generateContent');
  });

  it('erros do provedor viram mensagem de obra', async () => {
    const { perguntarIa } = await import('./ia');
    responder(resposta(429, { error: { status: 'RESOURCE_EXHAUSTED' } }));
    await expect(perguntarIa('x')).rejects.toThrow('limite gratuito');
    responder(resposta(400, { error: { message: 'API key not valid', status: 'INVALID_ARGUMENT' } }));
    await expect(perguntarIa('x')).rejects.toThrow('IA_CHAVE');
    responder(resposta(200, { promptFeedback: { blockReason: 'SAFETY' } }));
    await expect(perguntarIa('x')).rejects.toThrow('recusou');
  });

  it('sem chave, a IA fica desligada', async () => {
    delete process.env.IA_CHAVE;
    const { iaConfigurada, perguntarIa } = await import('./ia');
    expect(iaConfigurada()).toBe(false);
    await expect(perguntarIa('x')).rejects.toThrow('não está ligada');
  });

  it('API compatível com OpenAI (OpenRouter): imagem vai como data URL; PDF é recusado antes de gastar a cota', async () => {
    process.env.IA_PROVEDOR = 'openai';
    process.env.IA_MODELO = 'algum/modelo:free';
    process.env.IA_URL = 'https://openrouter.ai/api/v1/';
    responder(resposta(200, { choices: [{ message: { content: '{"a":1}' } }], model: 'algum/modelo:free' }));
    const { perguntarIa, iaLePdf } = await import('./ia');
    expect(iaLePdf()).toBe(false);
    const r = await perguntarIa('Leia', [{ mime: 'image/jpeg', dados: new Uint8Array([255]), nome: 'f.jpg' }]);
    expect(r.texto).toBe('{"a":1}');
    expect(chamadas[0]!.url).toBe('https://openrouter.ai/api/v1/chat/completions');
    expect(JSON.stringify(chamadas[0]!.corpo)).toContain('data:image/jpeg;base64,/w==');
    await expect(perguntarIa('Leia', [{ mime: 'application/pdf', dados: new Uint8Array([1]), nome: 'a.pdf' }])).rejects.toThrow('não lê PDF');
    expect(chamadas).toHaveLength(1);
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
