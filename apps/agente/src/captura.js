// Pede uma foto à câmera: HTTP (snapshot.cgi, com Digest) ou RTSP (um quadro pelo FFmpeg).
import { spawn } from 'node:child_process';
import { buscarComSenha } from './digest.js';

export const TEMPO_MAXIMO_MS = 20_000;

/** Começa como JPEG (FF D8) e tem um tamanho razoável? */
export function ehJpeg(dados) {
  return dados.length > 100 && dados[0] === 0xff && dados[1] === 0xd8;
}

/** Explica o erro em linguagem de obra (vai para a tela da plataforma). */
export function explicarErro(erro) {
  const texto = String(erro?.cause?.code ?? erro?.code ?? erro?.message ?? erro);
  if (/ECONNREFUSED/.test(texto)) return 'A câmera recusou a conexão: confira o endereço e a porta.';
  if (/EHOSTUNREACH|ENETUNREACH|EHOSTDOWN/.test(texto)) return 'Câmera fora da rede: confira se está ligada e no mesmo roteador do agente.';
  if (/ETIMEDOUT|AbortError|TimeoutError|tempo esgotado/i.test(texto)) return 'A câmera não respondeu a tempo (20 s).';
  if (/ENOTFOUND/.test(texto)) return 'Endereço da câmera não encontrado na rede.';
  return texto.slice(0, 300);
}

async function porHttp(camera) {
  const r = await buscarComSenha(camera.endereco, {
    usuario: camera.usuario ?? undefined,
    senha: camera.senha ?? undefined,
    sinal: AbortSignal.timeout(TEMPO_MAXIMO_MS),
  });
  if (r.status === 401) throw new Error('Usuário ou senha da câmera recusados (401).');
  if (!r.ok) throw new Error(`A câmera respondeu ${r.status} no endereço da foto.`);
  return Buffer.from(await r.arrayBuffer());
}

/** Endereço RTSP com usuário e senha embutidos (o FFmpeg lê assim). */
export function rtspComSenha(endereco, usuario, senha) {
  const u = new URL(endereco);
  if (usuario) {
    u.username = encodeURIComponent(usuario);
    u.password = encodeURIComponent(senha ?? '');
  }
  return u.toString();
}

function porRtsp(camera, ffmpeg = process.env.FFMPEG ?? 'ffmpeg') {
  return new Promise((resolver, rejeitar) => {
    const args = ['-hide_banner', '-loglevel', 'error', '-rtsp_transport', 'tcp', '-i', rtspComSenha(camera.endereco, camera.usuario, camera.senha),
      '-frames:v', '1', '-q:v', '3', '-f', 'image2', 'pipe:1'];
    const p = spawn(ffmpeg, args, { stdio: ['ignore', 'pipe', 'pipe'] });
    const partes = [];
    let erro = '';
    const relogio = setTimeout(() => p.kill('SIGKILL'), TEMPO_MAXIMO_MS);
    p.stdout.on('data', (d) => partes.push(d));
    p.stderr.on('data', (d) => (erro += d));
    p.on('error', (e) => {
      clearTimeout(relogio);
      rejeitar(new Error(e.code === 'ENOENT' ? 'FFmpeg não instalado: necessário para endereço rtsp://' : e.message));
    });
    p.on('close', (codigo) => {
      clearTimeout(relogio);
      if (codigo === 0) resolver(Buffer.concat(partes));
      else rejeitar(new Error(erro.trim().split('\n').pop() || `FFmpeg terminou com código ${codigo} (tempo esgotado?)`));
    });
  });
}

/** Foto da câmera em JPEG; lança erro com mensagem legível. */
export async function capturarFoto(camera) {
  const dados = /^rtsp:\/\//i.test(camera.endereco) ? await porRtsp(camera) : await porHttp(camera);
  if (!ehJpeg(dados)) throw new Error('A câmera não devolveu uma foto JPEG: confira o endereço da foto.');
  return dados;
}
