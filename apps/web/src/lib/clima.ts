import 'server-only';
import { climaDoDia, hojeIso, urlClima, type ClimaDoDia, type RespostaOpenMeteo } from '@obras/shared';

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
