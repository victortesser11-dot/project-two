import { createServer } from 'node:http';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { buscarComSenha, lerDesafio, respostaDigest } from '../src/digest.js';
import { capturarFoto, ehJpeg, explicarErro, rtspComSenha } from '../src/captura.js';
import { createHash } from 'node:crypto';

describe('Digest', () => {
  it('confere com o exemplo da RFC 2617', () => {
    const desafio = lerDesafio(
      'Digest realm="testrealm@host.com", qop="auth,auth-int", nonce="dcd98b7102dd2f0e8b11d0f600bfb0c093", opaque="5ccc069c403ebaf9f0171e9517f40e41"',
    );
    expect(desafio).toMatchObject({ esquema: 'digest', realm: 'testrealm@host.com', qop: 'auth,auth-int', opaque: '5ccc069c403ebaf9f0171e9517f40e41' });
    const cab = respostaDigest(desafio, { usuario: 'Mufasa', senha: 'Circle Of Life', metodo: 'GET', uri: '/dir/index.html', cnonce: '0a4f113b' });
    expect(cab).toContain('response="6629fae49393a05397450978507c4ef1"');
    expect(cab).toContain('qop=auth, nc=00000001, cnonce="0a4f113b"');
    expect(cab).toContain('opaque="5ccc069c403ebaf9f0171e9517f40e41"');
  });

  it('desafio sem qop (câmeras antigas) usa a fórmula curta', () => {
    const d = lerDesafio('Digest realm="Login to 2J0C0D3PAZ", nonce="abc"');
    const md5 = (t) => createHash('md5').update(t).digest('hex');
    const esperado = md5(`${md5('admin:Login to 2J0C0D3PAZ:x')}:abc:${md5('GET:/cgi-bin/snapshot.cgi')}`);
    expect(respostaDigest(d, { usuario: 'admin', senha: 'x', metodo: 'GET', uri: '/cgi-bin/snapshot.cgi' })).toContain(`response="${esperado}"`);
  });
});

// Câmera de mentira: pede Digest como a Intelbras e devolve um JPEG.
const JPEG = Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(500, 7), Buffer.from([0xff, 0xd9])]);
let servidor;
let base;

beforeAll(async () => {
  servidor = createServer((req, res) => {
    const auth = req.headers.authorization;
    if (!auth) {
      res.writeHead(401, { 'WWW-Authenticate': 'Digest realm="Login to CAM", qop="auth", nonce="n123", opaque="o9"' });
      return res.end();
    }
    const d = lerDesafio(auth);
    const md5 = (t) => createHash('md5').update(t).digest('hex');
    const ha1 = md5(`${d.username}:Login to CAM:obra123`);
    const certo = md5(`${ha1}:n123:${d.nc}:${d.cnonce}:auth:${md5(`GET:${d.uri}`)}`);
    if (d.response !== certo || d.uri !== req.url) {
      res.writeHead(401, { 'WWW-Authenticate': 'Digest realm="Login to CAM", qop="auth", nonce="n123"' });
      return res.end();
    }
    if (req.url.startsWith('/texto')) {
      res.writeHead(200, { 'content-type': 'text/html' });
      return res.end('<html>login</html>'.repeat(10));
    }
    res.writeHead(200, { 'content-type': 'image/jpeg' });
    res.end(JPEG);
  });
  await new Promise((r) => servidor.listen(0, '127.0.0.1', r));
  base = `http://127.0.0.1:${servidor.address().port}`;
});
afterAll(() => servidor.close());

describe('captura por HTTP', () => {
  it('responde ao Digest e recebe a foto', async () => {
    const r = await buscarComSenha(`${base}/cgi-bin/snapshot.cgi?channel=2`, { usuario: 'visualizador', senha: 'obra123' });
    expect(r.status).toBe(200);
    const foto = await capturarFoto({ endereco: `${base}/cgi-bin/snapshot.cgi?channel=2`, usuario: 'visualizador', senha: 'obra123' });
    expect(ehJpeg(foto)).toBe(true);
  });

  it('senha errada e resposta que não é foto viram mensagens claras', async () => {
    await expect(capturarFoto({ endereco: `${base}/cgi-bin/snapshot.cgi`, usuario: 'x', senha: 'errada' })).rejects.toThrow(
      'Usuário ou senha da câmera recusados (401).',
    );
    await expect(capturarFoto({ endereco: `${base}/texto`, usuario: 'x', senha: 'obra123' })).rejects.toThrow('não devolveu uma foto JPEG');
  });

  it('erros de rede em linguagem de obra', async () => {
    // Porta que acabou de fechar: conexão recusada.
    const livre = createServer();
    await new Promise((r) => livre.listen(0, '127.0.0.1', r));
    const porta = livre.address().port;
    await new Promise((r) => livre.close(r));
    let erro;
    try {
      await capturarFoto({ endereco: `http://127.0.0.1:${porta}/cgi-bin/snapshot.cgi` });
    } catch (e) {
      erro = e;
    }
    expect(explicarErro(erro)).toBe('A câmera recusou a conexão: confira o endereço e a porta.');
  });

  it('RTSP leva usuário e senha codificados para o FFmpeg', () => {
    expect(rtspComSenha('rtsp://192.168.1.108:554/cam/realmonitor?channel=1&subtype=0', 'vis', 'a@b:c')).toBe(
      'rtsp://vis:a%40b%3Ac@192.168.1.108:554/cam/realmonitor?channel=1&subtype=0',
    );
  });
});
