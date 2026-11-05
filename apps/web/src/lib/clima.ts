import 'server-only';
import { climaDoDia, hojeIso, urlClima, type ClimaDoDia, type PrevisaoDia, type RespostaOpenMeteo } from '@obras/shared';

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
 * Chuva prevista para os próximos 7 dias (mm e chance máxima), pelo Open-Meteo. Falhou? Lista vazia:
 * os outros alertas seguem. Cache de 1 hora.
 */
export async function previsaoChuva(latitude: number, longitude: number): Promise<PrevisaoDia[]> {
  const q = new URLSearchParams({
    latitude: latitude.toFixed(4),
    longitude: longitude.toFixed(4),
    daily: 'precipitation_sum,precipitation_probability_max',
    timezone: 'America/Sao_Paulo',
    forecast_days: '7',
  });
  try {
    const resp = await fetch(`https://api.open-meteo.com/v1/forecast?${q.toString()}`, { signal: AbortSignal.timeout(4000), next: { revalidate: 3600 } });
    if (!resp.ok) return [];
    const j = (await resp.json()) as { daily?: { time?: string[]; precipitation_sum?: (number | null)[]; precipitation_probability_max?: (number | null)[] } };
    const d = j.daily;
    if (!d?.time || !d.precipitation_sum) return [];
    return d.time.map((data, i) => ({
      data,
      chuva_mm: d.precipitation_sum?.[i] ?? 0,
      probabilidade: d.precipitation_probability_max?.[i] ?? null,
    }));
  } catch {
    return [];
  }
}
