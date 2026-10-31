import { describe, expect, it } from 'vitest';
import {
  agenteOnline,
  diasSemFoto,
  enderecoIntelbras,
  enderecoLocal,
  fotoMaisPerto,
  fotosPorDia,
  horaCurta,
  periodoTimelapse,
  quadrosTimelapse,
  situacaoCamera,
} from './cameras';
import { cameraSchema, errosPorCampo } from './esquemas';

const U = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
// Instantes em UTC; Brasília = UTC−3.
const foto = (id: number, instante: string) => ({ id: U(id), data: new Date(new Date(instante).getTime() - 3 * 3600e3).toISOString().slice(0, 10), capturada_em: instante });

describe('situação da câmera', () => {
  const agora = new Date('2026-10-31T15:00:00Z'); // 12:00 em Brasília
  const agente = { ativo: true, nome: 'PC do escritório', ultimo_contato_em: '2026-10-31T14:59:40Z' };
  const cam = { ativa: true, origem: 'agente' as const, ultima_foto_em: '2026-10-31T10:00:20Z', falhas_seguidas: 0, ultimo_erro: null };

  it('ok com a hora da última foto em Brasília', () => {
    expect(situacaoCamera(cam, agente, agora)).toEqual({ nivel: 'ok', texto: 'Última foto hoje às 07:00' });
    expect(situacaoCamera({ ...cam, ultima_foto_em: '2026-10-30T20:00:00Z' }, agente, agora).texto).toBe('Última foto em 30/10/2026 às 17:00');
  });

  it('alerta a partir de 2 falhas seguidas, não com 1', () => {
    expect(situacaoCamera({ ...cam, falhas_seguidas: 1, ultimo_erro: 'Tempo esgotado' }, agente, agora).nivel).toBe('ok');
    expect(situacaoCamera({ ...cam, falhas_seguidas: 2, ultimo_erro: 'Usuário ou senha recusados' }, agente, agora)).toEqual({
      nivel: 'alerta',
      texto: '2 falhas seguidas: Usuário ou senha recusados',
    });
  });

  it('agente sem contato há mais de 3 minutos é alerta', () => {
    expect(agenteOnline(agente, agora)).toBe(true);
    const parado = { ...agente, ultimo_contato_em: '2026-10-31T14:50:00Z' };
    expect(agenteOnline(parado, agora)).toBe(false);
    expect(situacaoCamera(cam, parado, agora)).toEqual({ nivel: 'alerta', texto: 'Agente "PC do escritório" sem contato desde 31/10/2026 às 11:50' });
    expect(situacaoCamera(cam, { ...agente, ultimo_contato_em: null }, agora).texto).toBe('Agente "PC do escritório" ainda não ligou');
  });

  it('câmera manual e desligada', () => {
    expect(situacaoCamera({ ...cam, origem: 'manual', ultima_foto_em: null }, null, agora)).toEqual({ nivel: 'aguardando', texto: 'Ainda sem foto' });
    expect(situacaoCamera({ ...cam, ativa: false }, agente, agora).nivel).toBe('desligada');
  });
});

describe('fotos e time-lapse', () => {
  const fotos = [
    foto(1, '2026-10-29T10:00:00Z'), // 29/10 07:00
    foto(2, '2026-10-29T15:05:00Z'), // 29/10 12:05
    foto(3, '2026-10-29T20:00:00Z'), // 29/10 17:00
    foto(4, '2026-10-30T10:00:00Z'), // 30/10 07:00
    foto(5, '2026-10-31T02:30:00Z'), // ainda 30/10 (23:30 em Brasília)
    foto(6, '2026-10-31T19:00:00Z'), // 31/10 16:00
  ];

  it('agrupa por dia de Brasília, mais recente primeiro', () => {
    expect(fotosPorDia(fotos).map((d) => [d.data, d.fotos.map((f) => f.id.slice(-1))])).toEqual([
      ['2026-10-31', ['6']],
      ['2026-10-30', ['4', '5']],
      ['2026-10-29', ['1', '2', '3']],
    ]);
  });

  it('time-lapse: uma foto por dia, a mais perto do meio-dia', () => {
    expect(fotoMaisPerto(fotos.slice(0, 3))?.id).toBe(U(2));
    expect(quadrosTimelapse(fotos).map((f) => f.id.slice(-1))).toEqual(['2', '4', '6']);
    expect(quadrosTimelapse(fotos, { de: '2026-10-30' }).map((f) => f.id.slice(-1))).toEqual(['4', '6']);
    expect(quadrosTimelapse(fotos, { alvo: '07:00' }).map((f) => f.id.slice(-1))).toEqual(['1', '4', '6']);
  });

  it('período da semana termina na última foto', () => {
    expect(periodoTimelapse('semana', '2026-10-31')).toEqual({ de: '2026-10-25', ate: '2026-10-31' });
    expect(periodoTimelapse('obra', '2026-10-31')).toEqual({});
    expect(diasSemFoto('2026-10-29T20:00:00Z', '2026-10-31')).toBe(2);
    expect(diasSemFoto(null, '2026-10-31')).toBeNull();
    expect(horaCurta('07:00:00')).toBe('07:00');
  });
});

describe('endereço Intelbras', () => {
  it('câmera, NVR e RTSP', () => {
    expect(enderecoIntelbras({ ip: '192.168.1.108' })).toBe('http://192.168.1.108/cgi-bin/snapshot.cgi');
    expect(enderecoIntelbras({ ip: '192.168.1.200', canal: 3 })).toBe('http://192.168.1.200/cgi-bin/snapshot.cgi?channel=3');
    expect(enderecoIntelbras({ ip: 'http://192.168.1.200/', porta: 8080, canal: 2 })).toBe('http://192.168.1.200:8080/cgi-bin/snapshot.cgi?channel=2');
    expect(enderecoIntelbras({ ip: '192.168.1.108', rtsp: true })).toBe('rtsp://192.168.1.108:554/cam/realmonitor?channel=1&subtype=0');
  });

  it('avisa quando o endereço parece público (o agente só alcança a rede da obra)', () => {
    expect(enderecoLocal('http://192.168.1.108/cgi-bin/snapshot.cgi')).toBe(true);
    expect(enderecoLocal('http://10.0.0.5/x')).toBe(true);
    expect(enderecoLocal('http://172.20.1.1/x')).toBe(true);
    expect(enderecoLocal('http://camera.local/x')).toBe(true);
    expect(enderecoLocal('http://200.150.10.1/x')).toBe(false);
  });
});

describe('esquema da câmera', () => {
  it('agente: exige agente e endereço; horários em ordem, sem repetição', () => {
    const r = cameraSchema.safeParse({ nome: 'Fachada', origem: 'agente', horarios: ['17:00', '07:00', '07:00', ''] });
    expect(errosPorCampo(r.error!)).toEqual({ agente_id: 'Escolha o agente da obra', endereco: 'Informe o endereço da foto' });
    const ok = cameraSchema.parse({
      nome: 'Fachada', origem: 'agente', agente_id: U(1), endereco: 'http://192.168.1.108/cgi-bin/snapshot.cgi',
      usuario: 'visualizador', senha: 'x', horarios: ['17:00', '07:00', '07:00', ''], ativa: 'on',
    });
    expect(ok).toMatchObject({ horarios: ['07:00', '17:00'], ativa: true, remover_senha: false, senha: 'x' });
  });

  it('horários: de 1 a 4 e no formato HH:MM', () => {
    expect(errosPorCampo(cameraSchema.safeParse({ nome: 'Celular', origem: 'manual', horarios: [] }).error!)).toEqual({
      horarios: 'Escolha de 1 a 4 horários por dia',
    });
    expect(errosPorCampo(cameraSchema.safeParse({ nome: 'Celular', origem: 'manual', horarios: ['24:00'] }).error!)).toEqual({
      horarios: 'Horário inválido: use HH:MM',
    });
    expect(
      errosPorCampo(cameraSchema.safeParse({ nome: 'X', origem: 'agente', agente_id: U(1), endereco: 'ftp://1.1.1.1', horarios: ['07:00'] }).error!),
    ).toMatchObject({ nome: 'Informe o nome da câmera (ex.: Fachada, Pátio)', endereco: 'O endereço começa com http://, https:// ou rtsp://' });
  });
});
