// Links dos e-mails de acesso (modelos em packages/emails/src/supabase.ts).

export const TIPOS_LINK = ['email', 'invite', 'recovery', 'email_change'] as const;
export type TipoLink = (typeof TIPOS_LINK)[number];

export function tipoDeLink(valor: unknown): TipoLink | null {
  return TIPOS_LINK.find((t) => t === valor) ?? null;
}

/** Para onde vai quem confirmou o link. */
export const DESTINO_LINK: Record<TipoLink, string> = {
  email: '/',
  invite: '/conta/senha?convite=1',
  recovery: '/conta/senha',
  email_change: '/',
};

/** Token do e-mail: hexadecimal, às vezes com o prefixo `pkce_`. */
export function tokenValido(valor: unknown): valor is string {
  return typeof valor === 'string' && /^(pkce_)?[0-9a-f]{20,128}$/i.test(valor);
}
