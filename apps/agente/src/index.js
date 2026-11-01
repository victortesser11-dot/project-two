#!/usr/bin/env node
// Agente da obra. Variáveis de ambiente:
//   AGENTE_TOKEN      token gerado na plataforma (Câmeras → Agentes). Obrigatório.
//   PLATAFORMA_URL    endereço da função agente-cameras (padrão: o do projeto).
//   PASTA_DADOS       onde guardar a fila e o estado (padrão: ./dados).
//   INTERVALO_SEG     de quanto em quanto tempo conversa com a plataforma (padrão: 30).
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { criarAgente } from './agente.js';
import { criarFila } from './fila.js';
import { criarPlataforma, PLATAFORMA_PADRAO } from './plataforma.js';

const VERSAO = '1.0.0';
const token = process.env.AGENTE_TOKEN?.trim();
if (!token || !/^obra_[0-9a-f]{48}$/.test(token)) {
  console.error('Defina AGENTE_TOKEN com o token gerado na plataforma (começa com "obra_").');
  process.exit(1);
}
const pasta = process.env.PASTA_DADOS ?? './dados';
const intervalo = Math.max(15, Number(process.env.INTERVALO_SEG ?? 30)) * 1000;
const arquivoEstado = join(pasta, 'estado.json');

await mkdir(pasta, { recursive: true });
const estado = JSON.parse(await readFile(arquivoEstado, 'utf8').catch(() => '{}'));
const hora = () => new Date().toLocaleTimeString('pt-BR', { timeZone: 'America/Sao_Paulo' });
const log = {
  info: (m) => console.log(`${hora()} ${m}`),
  warn: (m) => console.warn(`${hora()} ⚠ ${m}`),
  error: (m) => console.error(`${hora()} ✖ ${m}`),
};

const agente = criarAgente({
  plataforma: criarPlataforma({ url: process.env.PLATAFORMA_URL ?? PLATAFORMA_PADRAO, token, versao: VERSAO }),
  fila: criarFila(pasta),
  estado,
  // Só horários e datas; a senha das câmeras nunca vai para o disco.
  salvarEstado: (e) => writeFile(arquivoEstado, JSON.stringify(e)),
  log,
});

log.info(`agente da obra ${VERSAO} ligado; conversando com a plataforma a cada ${intervalo / 1000} s`);
let rodando = false;
async function rodar() {
  if (rodando) return;
  rodando = true;
  try {
    await agente.ciclo();
  } catch (e) {
    log.error(e instanceof Error ? e.message : String(e));
  } finally {
    rodando = false;
  }
}
await rodar();
setInterval(rodar, intervalo);
