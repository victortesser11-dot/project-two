// Clima do dia para o diário de obra, a partir do Open-Meteo (gratuito, sem chave).
// Aqui só a parte pura: montar a URL e transformar as leituras de hora em hora
// em manhã (7h–11h) e tarde (12h–17h). A busca HTTP fica no servidor do app.
import type { Clima } from './dominio';
import { diasEntre } from './formato';

export interface RespostaOpenMeteo {
  hourly?: {
    time?: string[];
    weather_code?: (number | null)[];
    precipitation?: (number | null)[];
    temperature_2m?: (number | null)[];
  };
}

export interface ClimaDoDia {
  clima_manha: Clima;
  clima_tarde: Clima;
  praticavel_manha: boolean;
  praticavel_tarde: boolean;
  temp_min: number;
  temp_max: number;
  chuva_mm: number;
}

/**
 * Previsão (até 92 dias para trás) ou arquivo histórico (mais antigo).
 * Datas futuras não têm clima de diário.
 */
export function urlClima(latitude: number, longitude: number, data: string, hoje: string): string | null {
  if (data > hoje) return null;
  const base = diasEntre(data, hoje) <= 90 ? 'https://api.open-meteo.com/v1/forecast' : 'https://archive-api.open-meteo.com/v1/archive';
  const q = new URLSearchParams({
    latitude: latitude.toFixed(4),
    longitude: longitude.toFixed(4),
    hourly: 'weather_code,precipitation,temperature_2m',
    timezone: 'America/Sao_Paulo',
    start_date: data,
    end_date: data,
  });
  return `${base}?${q.toString()}`;
}

/** Códigos WMO: 0–1 céu limpo; 2–3 e neblina nublado; garoa/chuva/neve chuva; pancadas fortes e trovoada chuva forte. */
function climaDoCodigo(codigo: number): Clima {
  if (codigo <= 1) return 'sol';
  if (codigo <= 48) return 'nublado';
  if ([65, 67, 75, 82, 86].includes(codigo) || codigo >= 95) return 'chuva_forte';
  return 'chuva';
}

const ORDEM: Clima[] = ['sol', 'nublado', 'chuva', 'chuva_forte'];

function periodo(codigos: number[], chuva: number): Clima {
  // Chuva medida manda: ≥ 5 mm no período é chuva forte; ≥ 0,5 mm é chuva.
  if (chuva >= 5) return 'chuva_forte';
  if (chuva >= 0.5) return 'chuva';
  // Sem chuva medida: vale o céu da maior parte das horas (código de chuva sem medição conta como nublado).
  const ceu = codigos.map((c) => {
    const k = climaDoCodigo(c);
    return k === 'chuva' || k === 'chuva_forte' ? 'nublado' : k;
  });
  const nublado = ceu.filter((c) => c === 'nublado').length;
  return nublado > ceu.length / 2 ? 'nublado' : 'sol';
}

/** Resume o dia. Devolve null se a resposta não tiver as horas de trabalho. */
export function climaDoDia(resposta: RespostaOpenMeteo, data: string): ClimaDoDia | null {
  const h = resposta.hourly;
  if (!h?.time || !h.weather_code || !h.precipitation || !h.temperature_2m) return null;

  const manha: { c: number[]; p: number } = { c: [], p: 0 };
  const tarde: { c: number[]; p: number } = { c: [], p: 0 };
  const temps: number[] = [];
  let chuvaDia = 0;

  h.time.forEach((t, i) => {
    if (!t.startsWith(data)) return;
    const hora = Number(t.slice(11, 13));
    const codigo = h.weather_code![i];
    const chuva = h.precipitation![i] ?? 0;
    const temp = h.temperature_2m![i];
    chuvaDia += chuva;
    if (temp !== null && temp !== undefined) temps.push(temp);
    if (codigo === null || codigo === undefined) return;
    if (hora >= 7 && hora <= 11) {
      manha.c.push(codigo);
      manha.p += chuva;
    } else if (hora >= 12 && hora <= 17) {
      tarde.c.push(codigo);
      tarde.p += chuva;
    }
  });

  if (manha.c.length === 0 || tarde.c.length === 0 || temps.length === 0) return null;
  const clima_manha = periodo(manha.c, manha.p);
  const clima_tarde = periodo(tarde.c, tarde.p);
  return {
    clima_manha,
    clima_tarde,
    // Chuva forte para o serviço externo; o engenheiro ajusta quando a frente é coberta.
    praticavel_manha: clima_manha !== 'chuva_forte',
    praticavel_tarde: clima_tarde !== 'chuva_forte',
    temp_min: Math.round(Math.min(...temps) * 10) / 10,
    temp_max: Math.round(Math.max(...temps) * 10) / 10,
    chuva_mm: Math.round(chuvaDia * 10) / 10,
  };
}

/** O pior clima entre dois (para resumos). */
export function piorClima(a: Clima | null, b: Clima | null): Clima | null {
  if (!a) return b;
  if (!b) return a;
  return ORDEM.indexOf(a) >= ORDEM.indexOf(b) ? a : b;
}
