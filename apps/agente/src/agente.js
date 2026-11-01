// Um ciclo do agente: pega a configuração, responde testes, tira as fotos do horário e esvazia a fila.
import { randomUUID } from 'node:crypto';
import { agoraNoFuso, horariosDevidos, limparEstado } from './agenda.js';
import { capturarFoto, explicarErro } from './captura.js';
import { vale_tentar_de_novo } from './plataforma.js';

export function criarAgente({ plataforma, fila, estado, salvarEstado, log = console, capturar = capturarFoto, relogio = () => new Date() }) {
  let config = null;

  // Cada foto ganha um id na hora da captura: se a resposta do envio se perder e a foto for
  // reenviada (agora ou pela fila), a plataforma grava no mesmo lugar e não duplica.
  async function enviarOuGuardar(camera, quando, jpeg, id) {
    try {
      await plataforma.enviarFoto(camera.id, quando, jpeg, false, id);
      return 'enviada';
    } catch (e) {
      if (!vale_tentar_de_novo(e)) throw e;
      await fila.guardar(camera.id, quando, jpeg, id);
      log.warn(`[${camera.nome}] sem conexão com a plataforma; foto guardada na fila (${explicarErro(e)})`);
      return 'na fila';
    }
  }

  async function esvaziarFila() {
    for (const nome of await fila.itens()) {
      let item;
      try {
        item = await fila.ler(nome);
      } catch (e) {
        // Arquivo pela metade (energia caiu no meio da gravação): não pode travar a fila.
        await fila.tirar(nome);
        log.warn(`fila: item ilegível descartado (${e.message})`);
        continue;
      }
      try {
        await plataforma.enviarFoto(item.cameraId, item.quando, item.jpeg, false, item.id);
        await fila.tirar(nome);
        log.info(`fila: foto de ${item.quando.toISOString()} enviada`);
      } catch (e) {
        if (vale_tentar_de_novo(e)) return; // ainda sem conexão: tenta no próximo ciclo
        await fila.tirar(nome); // câmera removida ou foto recusada: não adianta insistir
        log.warn(`fila: foto descartada (${e.message})`);
      }
    }
  }

  async function ciclo() {
    try {
      config = await plataforma.config();
    } catch (e) {
      if (!config) {
        log.error(`não consegui falar com a plataforma: ${e.message}`);
        return;
      }
      log.warn(`plataforma fora do ar; sigo com a última configuração (${e.message})`);
    }

    const agora = relogio();
    const hoje = agoraNoFuso(config.fuso ?? 'America/Sao_Paulo', agora);

    for (const camera of config.cameras ?? []) {
      // Pedido de teste feito na tela: responde já, com a foto ou com o erro.
      if (camera.teste) {
        try {
          const jpeg = await capturar(camera);
          await plataforma.enviarFoto(camera.id, agora, jpeg, true);
          log.info(`[${camera.nome}] teste respondido com foto`);
        } catch (e) {
          await plataforma.registrarFalha(camera.id, explicarErro(e), true).catch(() => undefined);
          log.warn(`[${camera.nome}] teste falhou: ${explicarErro(e)}`);
        }
      }

      // Vários horários vencidos de uma vez (agente ficou desligado): uma foto só vale por todos.
      const devidos = horariosDevidos(camera, hoje, estado);
      if (devidos.length > 0) {
        const rotulo = devidos.join(', ');
        let feito = false;
        try {
          const jpeg = await capturar(camera);
          const destino = await enviarOuGuardar(camera, relogio(), jpeg, randomUUID());
          feito = true;
          log.info(`[${camera.nome}] foto das ${rotulo} ${destino}`);
        } catch (e) {
          const msg = explicarErro(e);
          log.warn(`[${camera.nome}] foto das ${rotulo} falhou: ${msg}`);
          await plataforma.registrarFalha(camera.id, msg).catch(() => undefined);
        }
        for (const h of devidos) estado[`${camera.id}|${hoje.data}|${h}`] = { feito, tentativa: hoje.minutos };
      }
    }

    const limpo = limparEstado(estado, hoje.data);
    for (const chave of Object.keys(estado)) if (!(chave in limpo)) delete estado[chave];
    await salvarEstado(estado);
    await esvaziarFila();
  }

  return { ciclo };
}
