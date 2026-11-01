#!/usr/bin/env node
// Testa o endereço da foto na rede da obra, antes de cadastrar na plataforma.
//   node src/testar-camera.js "http://192.168.1.108/cgi-bin/snapshot.cgi?channel=1" usuario senha
// Grava foto-teste.jpg na pasta atual se der certo.
import { writeFile } from 'node:fs/promises';
import { capturarFoto, explicarErro } from './captura.js';

const [endereco, usuario, senha] = process.argv.slice(2);
if (!endereco) {
  console.log('Uso: node src/testar-camera.js "<endereço da foto>" [usuário] [senha]');
  console.log('Intelbras (câmera):  http://IP/cgi-bin/snapshot.cgi');
  console.log('Intelbras (NVR):     http://IP-DO-NVR/cgi-bin/snapshot.cgi?channel=N');
  console.log('RTSP (precisa FFmpeg): rtsp://IP:554/cam/realmonitor?channel=1&subtype=0');
  process.exit(1);
}
try {
  const inicio = Date.now();
  const jpeg = await capturarFoto({ endereco, usuario, senha });
  await writeFile('foto-teste.jpg', jpeg);
  console.log(`✔ Foto recebida (${Math.round(jpeg.length / 1024)} KB em ${Date.now() - inicio} ms): foto-teste.jpg`);
} catch (e) {
  console.error(`✖ ${explicarErro(e)}`);
  process.exit(1);
}
