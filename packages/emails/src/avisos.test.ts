import { describe, expect, it } from 'vitest';
import { emailAcessoObra } from './avisos';

const base = {
  base: 'https://obras.exemplo.com.br',
  obra: 'Residência <Silva> & Filhos',
  empresa: 'Construtora A',
  papel: 'Mestre de obras',
  chavePapel: 'mestre',
  quem: 'bruno@a.test',
  urlObra: 'https://obras.exemplo.com.br/projetos/1?a=1&b=2',
};

describe('emailAcessoObra', () => {
  it('monta assunto, HTML e texto com a obra, o papel e o link', () => {
    const e = emailAcessoObra(base);
    expect(e.assunto).toBe('Você agora acessa a obra Residência <Silva> & Filhos');
    expect(e.html).toContain('Residência &lt;Silva&gt; &amp; Filhos');
    expect(e.html).not.toContain('<Silva>');
    expect(e.html).toContain('href="https://obras.exemplo.com.br/projetos/1?a=1&amp;b=2"');
    expect(e.html).toContain('src="https://obras.exemplo.com.br/email/logo.png"');
    expect(e.html).toContain('Aponta o avanço das tarefas');
    expect(e.texto).toContain('Seu papel: Mestre de obras');
    expect(e.texto).toContain('Abrir a obra: https://obras.exemplo.com.br/projetos/1?a=1&b=2');
  });

  it('funciona sem empresa e com papel desconhecido', () => {
    const e = emailAcessoObra({ ...base, empresa: null, chavePapel: 'outro' });
    expect(e.html).not.toContain(', da ');
    expect(e.texto).not.toContain('undefined');
  });
});
