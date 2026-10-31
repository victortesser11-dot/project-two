import type { AgenteCamera, Camera, FotoCamera } from './dominio';
import { dataDoInstante, diasEntre, formatarData } from './formato';

/** "07:00:00" → "07:00". */
export function horaCurta(hora: string): string {
  return hora.slice(0, 5);
}

/** Hora (HH:MM) de um instante no horário de Brasília. */
export function horaDoInstante(instante: string, fuso = 'America/Sao_Paulo'): string {
  return new Intl.DateTimeFormat('pt-BR', { timeZone: fuso, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(new Date(instante));
}

/** O agente conversa com a plataforma a cada 30 s; sem contato há mais de 3 min, está fora. */
export const AGENTE_FORA_MS = 3 * 60_000;

export function agenteOnline(agente: Pick<AgenteCamera, 'ativo' | 'ultimo_contato_em'>, agora = new Date()): boolean {
  return agente.ativo && agente.ultimo_contato_em !== null && agora.getTime() - new Date(agente.ultimo_contato_em).getTime() <= AGENTE_FORA_MS;
}

export type NivelCamera = 'ok' | 'alerta' | 'aguardando' | 'desligada';

export interface SituacaoCamera {
  nivel: NivelCamera;
  texto: string;
}

/**
 * Como está a câmera, numa frase. Alerta a partir de 2 falhas seguidas (RF-102) ou com o
 * agente sem contato.
 */
export function situacaoCamera(
  camera: Pick<Camera, 'ativa' | 'origem' | 'ultima_foto_em' | 'falhas_seguidas' | 'ultimo_erro'>,
  agente: Pick<AgenteCamera, 'ativo' | 'ultimo_contato_em' | 'nome'> | null,
  agora = new Date(),
): SituacaoCamera {
  if (!camera.ativa) return { nivel: 'desligada', texto: 'Desligada' };
  const ultima = camera.ultima_foto_em
    ? `última foto ${dataDoInstante(camera.ultima_foto_em) === dataDoInstante(agora.toISOString()) ? 'hoje' : `em ${formatarData(dataDoInstante(camera.ultima_foto_em))}`} às ${horaDoInstante(camera.ultima_foto_em)}`
    : 'ainda sem foto';
  if (camera.origem === 'agente') {
    if (!agente || !agente.ativo) return { nivel: 'alerta', texto: `Agente desligado; ${ultima}` };
    if (!agenteOnline(agente, agora)) {
      if (!agente.ultimo_contato_em) return { nivel: 'alerta', texto: `Agente "${agente.nome}" ainda não ligou` };
      const desde = `${formatarData(dataDoInstante(agente.ultimo_contato_em))} às ${horaDoInstante(agente.ultimo_contato_em)}`;
      return { nivel: 'alerta', texto: `Agente "${agente.nome}" sem contato desde ${desde}` };
    }
    if (camera.falhas_seguidas >= 2) {
      return { nivel: 'alerta', texto: `${camera.falhas_seguidas} falhas seguidas: ${camera.ultimo_erro ?? 'sem detalhe'}` };
    }
  }
  if (!camera.ultima_foto_em) return { nivel: 'aguardando', texto: 'Ainda sem foto' };
  return { nivel: 'ok', texto: ultima.charAt(0).toUpperCase() + ultima.slice(1) };
}

/** Fotos agrupadas por dia (mais recente primeiro) e, dentro do dia, por hora. */
export function fotosPorDia<T extends Pick<FotoCamera, 'data' | 'capturada_em'>>(fotos: T[]): { data: string; fotos: T[] }[] {
  const mapa = new Map<string, T[]>();
  for (const f of fotos) mapa.set(f.data, [...(mapa.get(f.data) ?? []), f]);
  return [...mapa.entries()]
    .sort((a, b) => b[0].localeCompare(a[0]))
    .map(([data, lista]) => ({ data, fotos: lista.sort((a, b) => a.capturada_em.localeCompare(b.capturada_em)) }));
}

const minutosDoDia = (hhmm: string) => Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3, 5));

/** A foto do dia mais perto do horário-alvo (para comparar dias e montar o time-lapse com a mesma luz). */
export function fotoMaisPerto<T extends Pick<FotoCamera, 'capturada_em'>>(fotos: T[], alvo = '12:00'): T | null {
  let melhor: T | null = null;
  let distancia = Number.POSITIVE_INFINITY;
  for (const f of fotos) {
    const d = Math.abs(minutosDoDia(horaDoInstante(f.capturada_em)) - minutosDoDia(alvo));
    if (d < distancia) {
      melhor = f;
      distancia = d;
    }
  }
  return melhor;
}

/** Quadros do time-lapse: uma foto por dia (a mais perto do alvo), do mais antigo ao mais novo. */
export function quadrosTimelapse<T extends Pick<FotoCamera, 'data' | 'capturada_em'>>(
  fotos: T[],
  { de, ate, alvo = '12:00' }: { de?: string; ate?: string; alvo?: string } = {},
): T[] {
  return fotosPorDia(fotos.filter((f) => (!de || f.data >= de) && (!ate || f.data <= ate)))
    .reverse()
    .map((d) => fotoMaisPerto(d.fotos, alvo))
    .filter((f): f is T => f !== null);
}

/** Período "semana" (últimos 7 dias até a última foto) ou "obra" (tudo). */
export function periodoTimelapse(periodo: 'semana' | 'obra', ultimaData: string | null): { de?: string; ate?: string } {
  if (periodo === 'obra' || !ultimaData) return {};
  const d = new Date(`${ultimaData}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - 6);
  return { de: d.toISOString().slice(0, 10), ate: ultimaData };
}

/** Dias corridos sem foto até hoje (0 = teve foto hoje). null = nunca teve. */
export function diasSemFoto(ultimaFotoEm: string | null, hoje: string): number | null {
  return ultimaFotoEm ? Math.max(0, diasEntre(dataDoInstante(ultimaFotoEm), hoje)) : null;
}

/**
 * Endereço da foto de uma câmera ou NVR Intelbras (padrão Dahua). Com canal = NVR.
 * RTSP só quando a câmera não entrega foto por HTTP (precisa de FFmpeg no agente).
 */
export function enderecoIntelbras({ ip, porta, canal, rtsp = false }: { ip: string; porta?: number | null; canal?: number | null; rtsp?: boolean }): string {
  const host = ip.trim().replace(/^https?:\/\//, '').replace(/\/.*$/, '');
  if (rtsp) return `rtsp://${host}:${porta ?? 554}/cam/realmonitor?channel=${canal ?? 1}&subtype=0`;
  const comPorta = porta && porta !== 80 ? `${host}:${porta}` : host;
  return `http://${comPorta}/cgi-bin/snapshot.cgi${canal ? `?channel=${canal}` : ''}`;
}

/** Endereço de rede local? (o agente só alcança a rede da obra; IP público costuma ser engano). */
export function enderecoLocal(endereco: string): boolean {
  try {
    const h = new URL(endereco).hostname;
    return /^(10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.|127\.|169\.254\.)/.test(h) || !/^\d+\.\d+\.\d+\.\d+$/.test(h);
  } catch {
    return false;
  }
}
