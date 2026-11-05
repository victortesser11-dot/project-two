import { describe, expect, it } from 'vitest';
import { cru, escapar, html } from './html';

describe('html', () => {
  it('escapa o que é interpolado', () => {
    expect(html`<p>${'<b>"Obra" & cia</b>'}</p>`.valor).toBe('<p>&lt;b&gt;&quot;Obra&quot; &amp; cia&lt;/b&gt;</p>');
    expect(escapar("d'água")).toBe('d&#39;água');
  });

  it('não escapa trecho seguro, listas e vazios', () => {
    const lista = [html`<i>${'a'}</i>`, 'b<'];
    expect(html`${cru('<br>')}${lista}${null}${false}${undefined}${3}`.valor).toBe('<br><i>a</i>b&lt;3');
  });
});
