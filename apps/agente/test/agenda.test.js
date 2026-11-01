import { describe, expect, it } from 'vitest';
import { agoraNoFuso, horariosDevidos, limparEstado } from '../src/agenda.js';

const cam = { id: 'c1', horarios: ['07:00', '12:00', '17:00'] };

describe('agenda das fotos', () => {
  it('converte o relógio do aparelho para o horário da obra', () => {
    // 10:05 UTC = 07:05 em Brasília
    expect(agoraNoFuso('America/Sao_Paulo', new Date('2026-10-31T10:05:00Z'))).toEqual({ data: '2026-10-31', minutos: 7 * 60 + 5 });
    // 02:30 UTC do dia 1º ainda é dia 31 em Brasília
    expect(agoraNoFuso('America/Sao_Paulo', new Date('2026-11-01T02:30:00Z')).data).toBe('2026-10-31');
  });

  it('tira a foto do horário dentro da janela de 1 hora e só uma vez', () => {
    const hoje = { data: '2026-10-31', minutos: 7 * 60 + 2 };
    expect(horariosDevidos(cam, hoje, {})).toEqual(['07:00']);
    expect(horariosDevidos(cam, { ...hoje, minutos: 6 * 60 + 59 }, {})).toEqual([]);
    expect(horariosDevidos(cam, { ...hoje, minutos: 8 * 60 + 1 }, {})).toEqual([]); // passou a janela
    expect(horariosDevidos(cam, hoje, { 'c1|2026-10-31|07:00': { feito: true, tentativa: 420 } })).toEqual([]);
  });

  it('depois de uma falha, tenta de novo a cada 5 minutos', () => {
    const estado = { 'c1|2026-10-31|12:00': { feito: false, tentativa: 12 * 60 + 1 } };
    expect(horariosDevidos(cam, { data: '2026-10-31', minutos: 12 * 60 + 4 }, estado)).toEqual([]);
    expect(horariosDevidos(cam, { data: '2026-10-31', minutos: 12 * 60 + 6 }, estado)).toEqual(['12:00']);
  });

  it('esquece o que tem mais de 3 dias', () => {
    const estado = { 'c1|2026-10-27|07:00': { feito: true }, 'c1|2026-10-28|07:00': { feito: true }, 'c1|2026-10-31|07:00': { feito: true } };
    expect(Object.keys(limparEstado(estado, '2026-10-31'))).toEqual(['c1|2026-10-28|07:00', 'c1|2026-10-31|07:00']);
  });
});
