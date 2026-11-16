/**
 * Esqueleto mostrado na hora do clique, enquanto o servidor monta a tela (loading.tsx). Sem ele, o clique não dava
 * sinal nenhum até a página inteira chegar. Só formas cinza: sem texto que mude de lugar quando o conteúdo entra.
 */
export function Carregando({ variante = 'painel' }: { variante?: 'painel' | 'lista' }) {
  const bloco = 'rounded-medio bg-concreto motion-safe:animate-pulse';
  return (
    <div role="status" aria-live="polite" className="flex flex-col gap-6">
      <span className="sr-only">Carregando…</span>
      {variante === 'painel' ? (
        <>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
            {[0, 1, 2, 3].map((i) => (
              <div key={i} className="cartao flex items-center gap-3 p-4">
                <span className={`size-10 shrink-0 ${bloco}`} />
                <span className="flex flex-1 flex-col gap-2">
                  <span className={`h-3 w-2/3 ${bloco}`} />
                  <span className={`h-5 w-1/2 ${bloco}`} />
                </span>
              </div>
            ))}
          </div>
          <div className="cartao flex flex-col gap-4 p-5">
            <span className={`h-4 w-40 ${bloco}`} />
            <span className={`h-3 w-full ${bloco}`} />
            <span className={`h-40 w-full ${bloco}`} />
          </div>
        </>
      ) : (
        <div className="cartao divide-y divide-linha">
          {[0, 1, 2, 3, 4, 5].map((i) => (
            <div key={i} className="flex items-center gap-4 px-5 py-4">
              <span className={`h-4 flex-1 ${bloco}`} />
              <span className={`h-4 w-24 ${bloco}`} />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
