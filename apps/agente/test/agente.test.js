import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { criarAgente } from '../src/agente.js';
import { criarFila } from '../src/fila.js';
import { ErroPlataforma } from '../src/plataforma.js';

const JPEG = Buffer.concat([Buffer.from([0xff, 0xd8]), Buffer.alloc(200, 1)]);
const silencio = { info() {}, warn() {}, error() {} };

function plataformaFalsa(cameras) {
  const p = {
    online: true,
    enviadas: [],
    falhas: [],
    async config() {
      if (!p.online) throw new TypeError('fetch failed');
      return { fuso: 'America/Sao_Paulo', cameras };
    },
    async enviarFoto(cameraId, quando, jpeg, teste = false) {
      if (!p.online) throw new TypeError('fetch failed');
      p.enviadas.push({ cameraId, quando: quando.toISOString(), teste });
      return { ok: true };
    },
    async registrarFalha(cameraId, erro, teste = false) {
      if (!p.online) throw new TypeError('fetch failed');
      p.falhas.push({ cameraId, erro, teste });
    },
  };
  return p;
}

async function montar({ cameras, capturar = async () => JPEG, relogio }) {
  const plataforma = plataformaFalsa(cameras);
  const fila = criarFila(await mkdtemp(join(tmpdir(), 'agente-')));
  const estado = {};
  const agente = criarAgente({ plataforma, fila, estado, salvarEstado: async () => {}, log: silencio, capturar, relogio });
  return { plataforma, fila, estado, agente };
}

// 07:01 em Brasília
const as0701 = () => new Date('2026-10-31T10:01:00Z');

describe('ciclo do agente', () => {
  it('tira a foto do horário, envia e não repete', async () => {
    const { plataforma, agente } = await montar({ cameras: [{ id: 'c1', nome: 'Fachada', horarios: ['07:00', '12:00'] }], relogio: as0701 });
    await agente.ciclo();
    await agente.ciclo();
    expect(plataforma.enviadas).toEqual([{ cameraId: 'c1', quando: '2026-10-31T10:01:00.000Z', teste: false }]);
  });

  it('sem internet na hora de enviar, guarda na fila e envia quando volta', async () => {
    const { plataforma, fila, agente } = await montar({ cameras: [{ id: 'c2', nome: 'Pátio', horarios: ['07:00'] }], relogio: as0701 });
    const enviar = plataforma.enviarFoto;
    plataforma.enviarFoto = async () => {
      throw new TypeError('fetch failed');
    };
    await agente.ciclo();
    expect((await fila.itens()).length).toBe(1);

    plataforma.enviarFoto = enviar; // a internet voltou
    await agente.ciclo();
    expect(await fila.itens()).toEqual([]);
    expect(plataforma.enviadas.map((e) => e.cameraId)).toEqual(['c2']);
  });

  it('plataforma fora do ar: segue com a última configuração; sem nenhuma, espera', async () => {
    const semConfig = await montar({ cameras: [{ id: 'c1', nome: 'Fachada', horarios: ['07:00'] }], relogio: as0701 });
    semConfig.plataforma.online = false;
    await semConfig.agente.ciclo(); // nunca recebeu configuração: não tira foto
    expect(await semConfig.fila.itens()).toEqual([]);

    let agora = as0701();
    const { plataforma, fila, agente } = await montar({ cameras: [{ id: 'c1', nome: 'Fachada', horarios: ['07:00', '12:00'] }], relogio: () => agora });
    await agente.ciclo(); // 07:01 com internet: foto das 07:00 enviada
    plataforma.online = false;
    agora = new Date('2026-10-31T15:01:00Z'); // 12:01, sem internet
    await agente.ciclo();
    expect(plataforma.enviadas).toHaveLength(1);
    expect((await fila.itens()).length).toBe(1); // a das 12:00 espera na fila
  });

  it('falha de captura vai para a plataforma e tenta de novo depois', async () => {
    let n = 0;
    const { plataforma, estado, agente } = await montar({
      cameras: [{ id: 'c1', nome: 'Fachada', horarios: ['07:00'] }],
      capturar: async () => {
        n++;
        throw Object.assign(new Error('connect'), { code: 'EHOSTUNREACH' });
      },
      relogio: as0701,
    });
    await agente.ciclo();
    expect(plataforma.falhas).toEqual([
      { cameraId: 'c1', erro: 'Câmera fora da rede: confira se está ligada e no mesmo roteador do agente.', teste: false },
    ]);
    expect(estado['c1|2026-10-31|07:00']).toEqual({ feito: false, tentativa: 421 });
    await agente.ciclo(); // menos de 5 min depois: não tenta
    expect(n).toBe(1);
  });

  it('responde o pedido de teste com a foto ou com o erro', async () => {
    const { plataforma, agente } = await montar({
      cameras: [
        { id: 'boa', nome: 'Boa', horarios: ['18:00'], teste: true },
        { id: 'ruim', nome: 'Ruim', horarios: ['18:00'], teste: true },
      ],
      capturar: async (c) => {
        if (c.id === 'ruim') throw new Error('Usuário ou senha da câmera recusados (401).');
        return JPEG;
      },
      relogio: as0701,
    });
    await agente.ciclo();
    expect(plataforma.enviadas).toEqual([{ cameraId: 'boa', quando: '2026-10-31T10:01:00.000Z', teste: true }]);
    expect(plataforma.falhas).toEqual([{ cameraId: 'ruim', erro: 'Usuário ou senha da câmera recusados (401).', teste: true }]);
  });

  it('foto recusada pela plataforma (câmera removida) sai da fila', async () => {
    const { plataforma, fila, agente } = await montar({ cameras: [], relogio: as0701 });
    await fila.guardar('c9', new Date('2026-10-30T10:00:00Z'), JPEG);
    plataforma.enviarFoto = async () => {
      throw new ErroPlataforma('Agente sem acesso a esta câmera', 403);
    };
    await agente.ciclo();
    expect(await fila.itens()).toEqual([]);
  });
});
