import 'server-only';
import {
  climaDoDia,
  hojeIso,
  lerPrevisaoTempo,
  urlClima,
  urlPrevisaoTempo,
  type ClimaDoDia,
  type PrevisaoTempoDia,
  type RespostaOpenMeteo,
} from '@obras/shared';

/**
 * Clima do dia na obra pelo Open-Meteo. Falhou ou demorou (4 s)? Devolve null
 * e o diário segue com preenchimento manual. Cache de 1 hora por obra e dia.
 */
export async function buscarClimaDoDia(latitude: number, longitude: number, data: string): Promise<ClimaDoDia | null> {
  const url = urlClima(latitude, longitude, data, hojeIso());
  if (!url) return null;
  try {
    const resp = await fetch(url, { signal: AbortSignal.timeout(4000), next: { revalidate: 3600 } });
    if (!resp.ok) return null;
    return climaDoDia((await resp.json()) as RespostaOpenMeteo, data);
  } catch {
    return null;
  }
}

/**
 * Previsão de 7 dias na obra (tempo, máx/mín, chuva e chance, vento e rajadas), pelo Open-Meteo. Falhou, demorou ou o
 * serviço recusou (limite diário da API grátis)? Lista vazia: os outros alertas seguem. Cache de 1 hora por obra.
 */
export async function previsaoTempo(latitude: number, longitude: number): Promise<PrevisaoTempoDia[]> {
  try {
    const resp = await fetch(urlPrevisaoTempo(latitude, longitude), { signal: AbortSignal.timeout(4000), next: { revalidate: 3600 } });
    if (!resp.ok) return [];
    return lerPrevisaoTempo(await resp.json());
  } catch {
    return [];
  }
}
