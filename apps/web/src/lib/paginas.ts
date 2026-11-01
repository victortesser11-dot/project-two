/**
 * O Supabase entrega no máximo 1.000 linhas por pedido (max_rows do PostgREST) e corta o resto
 * sem avisar, mesmo com .limit() maior. Toda lista que pode passar disso vem por aqui, página por
 * página. A consulta precisa de ordem estável (termine com uma coluna única) para nada repetir ou sumir.
 */
export const LINHAS_POR_PAGINA = 1000;

type Pagina<T> = PromiseLike<{ data: T[] | null; error: { message: string } | null }>;

export async function emPaginas<T>(
  consulta: (de: number, ate: number) => Pagina<T>,
  maximo = 100_000,
): Promise<{ data: T[]; error: { message: string } | null }> {
  const linhas: T[] = [];
  for (let de = 0; de < maximo; de += LINHAS_POR_PAGINA) {
    const ate = Math.min(de + LINHAS_POR_PAGINA, maximo) - 1;
    const { data, error } = await consulta(de, ate);
    if (error) return { data: linhas, error };
    const pagina = data ?? [];
    linhas.push(...pagina);
    if (pagina.length < ate - de + 1) break;
  }
  return { data: linhas, error: null };
}
