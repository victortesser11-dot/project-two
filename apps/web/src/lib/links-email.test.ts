import { describe, expect, it } from 'vitest';
import { DESTINO_LINK, tipoDeLink, tokenValido } from './links-email';

describe('links dos e-mails', () => {
  it('aceita só os tipos que os modelos geram', () => {
    expect(tipoDeLink('recovery')).toBe('recovery');
    expect(tipoDeLink('invite')).toBe('invite');
    expect(tipoDeLink('signup')).toBeNull();
    expect(tipoDeLink(undefined)).toBeNull();
  });

  it('convite e senha esquecida terminam na tela de senha', () => {
    expect(DESTINO_LINK.invite).toBe('/conta/senha?convite=1');
    expect(DESTINO_LINK.recovery).toBe('/conta/senha');
    expect(DESTINO_LINK.email).toBe('/');
  });

  it('confere o formato do token', () => {
    expect(tokenValido('3f9a1c2b7d3f9a1c2b7d3f9a1c2b7d3f9a1c2b7d3f9a1c2b7d3f9a1c')).toBe(true);
    expect(tokenValido('pkce_3f9a1c2b7d3f9a1c2b7d3f9a1c2b7d3f9a1c2b7d')).toBe(true);
    expect(tokenValido('<script>')).toBe(false);
    expect(tokenValido('')).toBe(false);
  });
});
