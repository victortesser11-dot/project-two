import { readFileSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { modelosSupabase } from './supabase';

const pasta = fileURLToPath(new URL('../../../supabase/templates/', import.meta.url));
const atualizar = process.env.ATUALIZAR_MODELOS === '1';

describe('modelos do Supabase', () => {
  const modelos = modelosSupabase();

  it('cada link leva para /auth/confirmar com o token_hash e o tipo certo', () => {
    const tipos = Object.fromEntries(
      modelos.map((m) => [m.arquivo, /\/auth\/confirmar\?token_hash=\{\{ \.TokenHash \}\}&amp;type=(\w+)/.exec(m.html)?.[1] ?? null]),
    );
    expect(tipos).toEqual({
      'confirmar-cadastro.html': 'email',
      'convite.html': 'invite',
      'link-magico.html': 'email',
      'troca-de-email.html': 'email_change',
      'redefinir-senha.html': 'recovery',
      'reautenticacao.html': null,
    });
    expect(modelos.find((m) => m.arquivo === 'reautenticacao.html')?.html).toContain('{{ .Token }}');
  });

  it('não usa o ConfirmationURL (o link é gasto por antivírus que abre e-mails)', () => {
    for (const m of modelos) expect(m.html).not.toContain('ConfirmationURL');
  });

  it('os blocos {{ if }} fecham e não sobra marcador quebrado', () => {
    for (const m of modelos) {
      const abre = m.html.match(/\{\{ if /g)?.length ?? 0;
      const fecha = m.html.match(/\{\{ end \}\}/g)?.length ?? 0;
      expect(fecha, m.arquivo).toBe(abre);
      expect(m.html, m.arquivo).not.toMatch(/undefined|\[object |&lt;|\{\{(?! [.a-z])/);
      expect(m.html.length, m.arquivo).toBeLessThan(60_000);
    }
  });

  it.each(modelos.map((m) => [m.arquivo, m] as const))('%s está igual ao arquivo em supabase/templates', (arquivo, m) => {
    const caminho = `${pasta}${arquivo}`;
    if (atualizar) writeFileSync(caminho, `${m.html}\n`);
    expect(readFileSync(caminho, 'utf8'), 'rode `pnpm --filter @obras/emails exportar`').toBe(`${m.html}\n`);
  });
});
