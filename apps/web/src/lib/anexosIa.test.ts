import { describe, expect, it, vi } from 'vitest';

vi.mock('server-only', () => ({}));

/** PDF mínimo de uma página com texto (o PDF.js refaz a tabela xref sozinho). */
function pdfComTexto(largura: number, altura: number, texto: string): Uint8Array {
  const conteudo = `BT /F1 40 Tf 100 100 Td (${texto}) Tj ET`;
  const pdf = `%PDF-1.4
1 0 obj << /Type /Catalog /Pages 2 0 R >> endobj
2 0 obj << /Type /Pages /Kids [3 0 R] /Count 1 >> endobj
3 0 obj << /Type /Page /Parent 2 0 R /MediaBox [0 0 ${largura} ${altura}] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >> endobj
4 0 obj << /Length ${conteudo.length} >> stream
${conteudo}
endstream endobj
5 0 obj << /Type /Font /Subtype /Type1 /BaseFont /Helvetica >> endobj
trailer << /Root 1 0 R >>
%%EOF`;
  return new TextEncoder().encode(pdf);
}

describe('preparo dos anexos para a IA', () => {
  it('prancha com texto: texto do PDF, visão geral e recortes em JPEG', async () => {
    const { prepararAnexosIa, MAX_IMAGENS_PEDIDO } = await import('./anexosIa');
    const partes = await prepararAnexosIa([{ mime: 'application/pdf', dados: pdfComTexto(2951, 1684, 'CARIMBO ARQ 01 - Residencial Multifamiliar - Av. Santos Ferreira, 4200 - Canoas RS'), nome: 'obra/ARQ 01.pdf' }]);
    expect(partes[0]).toMatchObject({ tipo: 'texto' });
    expect((partes[0] as { texto: string }).texto).toContain('CARIMBO ARQ 01 - Residencial');
    const imagens = partes.filter((p) => p.tipo === 'imagem');
    // Visão geral + 3 recortes (os de mais conteúdo, sempre com o canto inferior direito do carimbo).
    expect(imagens).toHaveLength(4);
    expect(imagens.length).toBeLessThanOrEqual(MAX_IMAGENS_PEDIDO);
    for (const i of imagens) {
      expect(i.mime).toBe('image/jpeg');
      expect([...i.dados.slice(0, 2)]).toEqual([0xff, 0xd8]);
    }
    expect(partes.some((p) => p.tipo === 'texto' && p.texto.includes('linha 2 de 2, coluna 4 de 4, canto inferior direito'))).toBe(true);
  }, 60_000);

  it('folha comum (A4) vai só com a visão geral; foto pequena passa como veio', async () => {
    const { prepararAnexosIa } = await import('./anexosIa');
    const foto = new Uint8Array([0xff, 0xd8, 0xff, 0xe0]);
    const partes = await prepararAnexosIa([
      { mime: 'image/jpeg', dados: foto, nome: 'foto.jpg' },
      { mime: 'application/pdf', dados: pdfComTexto(595, 842, 'Memorial descritivo'), nome: 'Memorial.pdf' },
    ]);
    expect(partes[0]).toEqual({ tipo: 'imagem', mime: 'image/jpeg', dados: foto, nome: 'foto.jpg' });
    expect(partes.filter((p) => p.tipo === 'imagem')).toHaveLength(2);
  }, 60_000);

  it('várias pranchas dividem as vagas de imagem (visão geral + carimbo) e nunca passam do limite do modelo', async () => {
    const { prepararAnexosIa } = await import('./anexosIa');
    const pranchas = [1, 2, 3, 4].map((n) => ({ mime: 'application/pdf', dados: pdfComTexto(2951, 1684, `PRANCHA ARQ 0${n} - Residencial Multifamiliar - planta baixa do pavimento tipo`), nome: `ARQ 0${n}.pdf` }));
    const imagensDe = (partes: Awaited<ReturnType<typeof prepararAnexosIa>>, n: number) =>
      partes.filter((p) => p.tipo === 'imagem' && p.nome.startsWith(`ARQ 0${n}.pdf`)).length;

    const oito = await prepararAnexosIa(pranchas, 8);
    expect(oito.filter((p) => p.tipo === 'imagem')).toHaveLength(8);
    for (const n of [1, 2, 3, 4]) expect(imagensDe(oito, n)).toBe(2);
    expect(oito.some((p) => p.tipo === 'texto' && p.texto.includes('ARQ 04.pdf') && p.texto.includes('canto inferior direito'))).toBe(true);

    // Groq: 3 imagens. A quarta prancha vai só com o texto, avisando.
    const tres = await prepararAnexosIa(pranchas, 3);
    expect(tres.filter((p) => p.tipo === 'imagem')).toHaveLength(3);
    expect(imagensDe(tres, 4)).toBe(0);
    expect(tres.some((p) => p.tipo === 'texto' && p.texto.includes('PRANCHA ARQ 04'))).toBe(true);
    expect(tres.some((p) => p.tipo === 'texto' && p.texto.includes('"ARQ 04.pdf" vai só com o texto'))).toBe(true);
  }, 120_000);

  it('PDF que não abre não derruba a leitura: vira um aviso em texto', async () => {
    const { prepararAnexosIa } = await import('./anexosIa');
    const erro = vi.spyOn(console, 'error').mockImplementation(() => undefined);
    const partes = await prepararAnexosIa([{ mime: 'application/pdf', dados: new Uint8Array([1, 2, 3]), nome: 'quebrado.pdf' }]);
    expect(partes).toEqual([{ tipo: 'texto', texto: 'Não foi possível abrir "quebrado.pdf" para leitura.' }]);
    erro.mockRestore();
  }, 60_000);
});
