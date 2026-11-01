// Conversa com a função de borda agente-cameras da plataforma.

export const PLATAFORMA_PADRAO = 'https://bxsaaabxbzlddpahdrto.supabase.co/functions/v1/agente-cameras';

export class ErroPlataforma extends Error {
  constructor(mensagem, status) {
    super(mensagem);
    this.status = status;
  }
}

export function criarPlataforma({ url = PLATAFORMA_PADRAO, token, versao, buscar = fetch }) {
  const base = url.replace(/\/+$/, '');
  const cabecalhos = { 'x-agente-token': token, 'x-agente-versao': versao };

  async function chamar(caminho, opcoes = {}) {
    const r = await buscar(`${base}${caminho}`, {
      ...opcoes,
      headers: { ...cabecalhos, ...(opcoes.headers ?? {}) },
      signal: AbortSignal.timeout(60_000),
    });
    const corpo = await r.json().catch(() => ({}));
    if (!r.ok) throw new ErroPlataforma(corpo.erro ?? `A plataforma respondeu ${r.status}`, r.status);
    return corpo;
  }

  return {
    /** Câmeras deste agente (com senha), horários e pedidos de teste. */
    config: () => chamar('/config'),
    enviarFoto: (cameraId, quando, jpeg, teste = false) =>
      chamar(`/foto?camera=${cameraId}&quando=${encodeURIComponent(quando.toISOString())}${teste ? '&teste=1' : ''}`, {
        method: 'POST',
        headers: { 'content-type': 'image/jpeg' },
        body: jpeg,
      }),
    registrarFalha: (cameraId, erro, teste = false) =>
      chamar('/falha', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ camera: cameraId, erro, teste }),
      }),
  };
}

/** Erro que vale guardar na fila e tentar de novo (rede caiu, plataforma fora do ar). */
export function vale_tentar_de_novo(erro) {
  if (erro instanceof ErroPlataforma) return erro.status >= 500 || erro.status === 429;
  return true; // erro de rede
}
