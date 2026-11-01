// Autenticação HTTP Digest (RFC 2617/7616), a que as câmeras e NVRs Intelbras usam
// no /cgi-bin/snapshot.cgi. Também aceita Basic, que alguns modelos antigos pedem.
import { createHash, randomBytes } from 'node:crypto';

/** Lê o cabeçalho WWW-Authenticate: { esquema: 'digest', realm, nonce, qop, ... }. */
export function lerDesafio(cabecalho) {
  if (!cabecalho) return null;
  const m = cabecalho.match(/^\s*(\w+)\s+(.*)$/s);
  if (!m) return null;
  const desafio = { esquema: m[1].toLowerCase() };
  const re = /(\w+)=(?:"((?:[^"\\]|\\.)*)"|([^,\s]+))/g;
  let p;
  while ((p = re.exec(m[2]))) desafio[p[1].toLowerCase()] = p[2] !== undefined ? p[2].replace(/\\(.)/g, '$1') : p[3];
  return desafio;
}

function hash(algoritmo, texto) {
  return createHash(algoritmo).update(texto).digest('hex');
}

/**
 * Cabeçalho Authorization para um desafio Digest. `cnonce` e `nc` podem ser fixados
 * (testes); no uso normal o cnonce é aleatório.
 */
export function respostaDigest(desafio, { usuario, senha, metodo, uri, cnonce = randomBytes(8).toString('hex'), nc = '00000001' }) {
  const alg = (desafio.algorithm ?? 'MD5').toUpperCase();
  const funcao = alg.startsWith('SHA-256') ? 'sha256' : 'md5';
  let ha1 = hash(funcao, `${usuario}:${desafio.realm}:${senha}`);
  if (alg.endsWith('-SESS')) ha1 = hash(funcao, `${ha1}:${desafio.nonce}:${cnonce}`);
  const ha2 = hash(funcao, `${metodo}:${uri}`);
  const qops = (desafio.qop ?? '').split(',').map((q) => q.trim());
  const qop = qops.includes('auth') ? 'auth' : null;
  const response = qop
    ? hash(funcao, `${ha1}:${desafio.nonce}:${nc}:${cnonce}:${qop}:${ha2}`)
    : hash(funcao, `${ha1}:${desafio.nonce}:${ha2}`);
  const campos = [
    `username="${usuario}"`,
    `realm="${desafio.realm}"`,
    `nonce="${desafio.nonce}"`,
    `uri="${uri}"`,
    `response="${response}"`,
    desafio.algorithm ? `algorithm=${desafio.algorithm}` : null,
    desafio.opaque ? `opaque="${desafio.opaque}"` : null,
    qop ? `qop=${qop}, nc=${nc}, cnonce="${cnonce}"` : null,
  ].filter(Boolean);
  return `Digest ${campos.join(', ')}`;
}

/**
 * GET com usuário e senha: tenta sem autenticação, e responde ao desafio (Digest ou Basic)
 * se a câmera pedir. Devolve o Response final.
 */
export async function buscarComSenha(url, { usuario, senha, sinal } = {}) {
  const primeira = await fetch(url, { signal: sinal });
  if (primeira.status !== 401 || !usuario) return primeira;
  await primeira.arrayBuffer().catch(() => undefined);
  const desafio = lerDesafio(primeira.headers.get('www-authenticate'));
  const u = new URL(url);
  const uri = `${u.pathname}${u.search}`;
  let autorizacao;
  if (desafio?.esquema === 'digest') {
    autorizacao = respostaDigest(desafio, { usuario, senha: senha ?? '', metodo: 'GET', uri });
  } else {
    autorizacao = `Basic ${Buffer.from(`${usuario}:${senha ?? ''}`).toString('base64')}`;
  }
  return fetch(url, { headers: { authorization: autorizacao }, signal: sinal });
}
