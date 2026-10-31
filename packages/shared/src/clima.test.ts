import { describe, expect, it } from 'vitest';
import { climaDoDia, piorClima, urlClima, type RespostaOpenMeteo } from './clima';
import { diarioSchema, efetivoSchema } from './esquemas';

function resposta(data: string, porHora: (h: number) => [number, number, number]): RespostaOpenMeteo {
  const horas = Array.from({ length: 24 }, (_, h) => h);
  return {
    hourly: {
      time: horas.map((h) => `${data}T${String(h).padStart(2, '0')}:00`),
      weather_code: horas.map((h) => porHora(h)[0]),
      precipitation: horas.map((h) => porHora(h)[1]),
      temperature_2m: horas.map((h) => porHora(h)[2]),
    },
  };
}

describe('urlClima', () => {
  it('usa a previsão para datas recentes e o arquivo para antigas', () => {
    expect(urlClima(-22.9, -47.06, '2026-10-30', '2026-10-31')).toContain('api.open-meteo.com/v1/forecast');
    expect(urlClima(-22.9, -47.06, '2026-01-10', '2026-10-31')).toContain('archive-api.open-meteo.com');
    expect(urlClima(-22.9, -47.06, '2026-11-01', '2026-10-31')).toBeNull();
  });

  it('pede o dia no fuso de Brasília', () => {
    const u = new URL(urlClima(-22.9, -47.06, '2026-10-30', '2026-10-31')!);
    expect(u.searchParams.get('timezone')).toBe('America/Sao_Paulo');
    expect(u.searchParams.get('start_date')).toBe('2026-10-30');
  });
});

describe('climaDoDia', () => {
  it('manhã de sol, tarde com chuva forte', () => {
    const r = resposta('2026-10-30', (h) => (h >= 14 && h <= 16 ? [95, 3, 22] : h < 12 ? [0, 0, 18 + h / 2] : [2, 0, 26]));
    expect(climaDoDia(r, '2026-10-30')).toEqual({
      clima_manha: 'sol',
      clima_tarde: 'chuva_forte',
      praticavel_manha: true,
      praticavel_tarde: false,
      temp_min: 18,
      temp_max: 26,
      chuva_mm: 9,
    });
  });

  it('garoa leve vira chuva; céu fechado sem chuva é nublado', () => {
    const r = resposta('2026-10-30', (h) => (h >= 8 && h <= 9 ? [51, 0.4, 20] : [3, 0, 21]));
    const c = climaDoDia(r, '2026-10-30')!;
    expect(c.clima_manha).toBe('chuva');
    expect(c.clima_tarde).toBe('nublado');
    expect(c.praticavel_manha).toBe(true);
  });

  it('código de chuva sem chuva medida conta como nublado', () => {
    const r = resposta('2026-10-30', () => [61, 0, 20]);
    expect(climaDoDia(r, '2026-10-30')!.clima_manha).toBe('nublado');
  });

  it('resposta sem horas não vira clima', () => {
    expect(climaDoDia({}, '2026-10-30')).toBeNull();
    expect(climaDoDia(resposta('2026-10-29', () => [0, 0, 20]), '2026-10-30')).toBeNull();
  });

  it('pior clima', () => {
    expect(piorClima('sol', 'chuva')).toBe('chuva');
    expect(piorClima(null, 'nublado')).toBe('nublado');
  });
});

describe('diarioSchema', () => {
  it('converte o formulário', () => {
    const d = diarioSchema.parse({
      clima_manha: 'sol', clima_tarde: '', praticavel_manha: 'on', temp_min: '18,5', temp_max: '27', chuva_mm: '', ocorrencias: '  ',
    });
    expect(d).toMatchObject({ clima_manha: 'sol', clima_tarde: null, praticavel_manha: true, praticavel_tarde: false, temp_min: 18.5, chuva_mm: null, ocorrencias: null });
  });

  it('recusa máxima menor que a mínima', () => {
    expect(diarioSchema.safeParse({ temp_min: '30', temp_max: '20' }).success).toBe(false);
  });

  it('equipe com quantidade inteira', () => {
    expect(efetivoSchema.parse([{ funcao: 'Pedreiro', quantidade: '4' }])).toEqual([{ funcao: 'Pedreiro', empresa_terceira: null, quantidade: 4 }]);
    expect(efetivoSchema.safeParse([{ funcao: 'Pedreiro', quantidade: '0' }]).success).toBe(false);
    expect(efetivoSchema.safeParse([{ funcao: '', quantidade: '2' }]).success).toBe(false);
  });
});

import { dataIsoValida, formatarDataLonga, somarDias } from './formato';
describe('datas do diário', () => {
  it('valida datas de calendário', () => {
    expect(dataIsoValida('2026-10-31')).toBe(true);
    expect(dataIsoValida('2026-02-30')).toBe(false);
    expect(dataIsoValida('31/10/2026')).toBe(false);
  });
  it('soma dias e escreve por extenso', () => {
    expect(somarDias('2026-12-31', 1)).toBe('2027-01-01');
    expect(formatarDataLonga('2026-10-31')).toBe('sábado, 31/10/2026');
  });
});
