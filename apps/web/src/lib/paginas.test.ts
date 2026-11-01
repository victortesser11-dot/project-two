import { describe, expect, it } from 'vitest';
import { emPaginas, LINHAS_POR_PAGINA } from './paginas';

/** Imita o PostgREST: devolve no máximo 1.000 linhas por pedido. */
function tabela(total: number) {
  const linhas = Array.from({ length: total }, (_, i) => i);
  const pedidos: [number, number][] = [];
  const consulta = async (de: number, ate: number) => {
    pedidos.push([de, ate]);
    return { data: linhas.slice(de, Math.min(ate + 1, de + LINHAS_POR_PAGINA)), error: null };
  };
  return { consulta, pedidos };
}

describe('emPaginas', () => {
  it('junta todas as páginas além do limite de 1.000 linhas', async () => {
    const { consulta, pedidos } = tabela(2500);
    const { data } = await emPaginas(consulta);
    expect(data).toHaveLength(2500);
    expect(data.at(-1)).toBe(2499);
    expect(pedidos).toEqual([
      [0, 999],
      [1000, 1999],
      [2000, 2999],
    ]);
  });

  it('exatamente 1.000 linhas: pede a página seguinte e para na vazia', async () => {
    const { consulta, pedidos } = tabela(1000);
    expect((await emPaginas(consulta)).data).toHaveLength(1000);
    expect(pedidos).toHaveLength(2);
  });

  it('respeita o máximo pedido', async () => {
    const { consulta, pedidos } = tabela(5000);
    const { data } = await emPaginas(consulta, 1200);
    expect(data).toHaveLength(1200);
    expect(pedidos).toEqual([
      [0, 999],
      [1000, 1199],
    ]);
  });

  it('erro numa página devolve o erro (e o que já tinha vindo)', async () => {
    let n = 0;
    const r = await emPaginas<number>(async () =>
      n++ === 0 ? { data: Array(1000).fill(1), error: null } : { data: null, error: { message: 'caiu' } },
    );
    expect(r.error?.message).toBe('caiu');
    expect(r.data).toHaveLength(1000);
  });
});
