import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

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
    delete process.env.OPENROUTER_MODELO;
    delete process.env.IA_MODELO;
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
    responder(sobrecarga(), listaGoogle('gemini-a-flash', 'gemini-b-flash', 'gemini-c-flash', 'gemini-d-flash'), sobrecarga(), sobrecarga(), sobrecarga());
    const { perguntarIa } = await import('./ia');
    await expect(perguntarIa('x')).rejects.toThrow('sobrecarregado');
    expect(chamadas.filter((c) => c.url.includes(':generateContent'))).toHaveLength(4);
  });

  it('Gemini caiu: o OpenRouter (roteador grátis) responde, com PDF como arquivo', async () => {
    process.env.OPENROUTER_CHAVE = 'chave-or';
    responder(sobrecarga(), listaGoogle(), resposta(200, { choices: [{ message: { content: '{"a":1}' } }], model: 'qwen/algum:free' }));
    const { perguntarIa } = await import('./ia');
    const r = await perguntarIa('Leia', [{ mime: 'application/pdf', dados: new Uint8Array([1]), nome: 'proj/ARQ 01.pdf' }]);
    expect(r).toEqual({ texto: '{"a":1}', modelo: 'openrouter:qwen/algum:free' });
    const or = chamadas[2]!;
    expect(or.url).toBe('https://openrouter.ai/api/v1/chat/completions');
    expect(or.cabecalhos.Authorization).toBe('Bearer chave-or');
    const corpo = or.corpo as { model: string; messages: { content: { type: string; file?: { filename: string; file_data: string } }[] }[] };
    expect(corpo.model).toBe('openrouter/free');
    expect(corpo.messages[0]!.content[0]).toEqual({ type: 'file', file: { filename: 'ARQ 01.pdf', file_data: 'data:application/pdf;base64,AQ==' } });
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
