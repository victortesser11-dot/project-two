import Link from 'next/link';
import { ChevronRight } from 'lucide-react';
import type { Alerta } from '@obras/shared';
import { SeloGravidade } from './SeloGravidade';

/**
 * "O que pede atenção" no painel: os alertas urgentes e de atenção, cada um com o caminho para resolver (linha
 * inteira tocável). O resto fica na central de alertas.
 */
export function ResumoAlertas({ projetoId, alertas }: { projetoId: string; alertas: Alerta[] }) {
  const importantes = alertas.filter((a) => a.gravidade !== 'baixa');
  const base = `/projetos/${projetoId}`;
  if (importantes.length === 0) {
    return (
      <section aria-label="O que pede atenção" className="cartao flex items-center gap-3 px-4 py-4 sm:px-5">
        <span aria-hidden className="flex size-9 items-center justify-center rounded-full bg-concreto text-lg text-obra-ok">
          ✓
        </span>
        <p className="font-semibold">Nada pede atenção agora.</p>
      </section>
    );
  }
  const urgentes = importantes.filter((a) => a.gravidade === 'alta').length;
  const mostrar = importantes.slice(0, 5);
  return (
    <section aria-labelledby="titulo-resumo-alertas" className="cartao">
      <div className="flex flex-wrap items-baseline justify-between gap-3 border-b border-linha px-4 py-3 sm:px-5">
        <h2 id="titulo-resumo-alertas" className="text-base font-semibold">
          O que pede atenção
          <span className="numeros font-normal text-regua">
            {' '}
            ({importantes.length}
            {urgentes > 0 && <span className="text-marcador"> · {urgentes} {urgentes === 1 ? 'urgente' : 'urgentes'}</span>})
          </span>
        </h2>
      </div>
      <ul className="divide-y divide-linha">
        {mostrar.map((a) => (
          <li key={a.chave}>
            <Link
              href={a.caminho ? `${base}/${a.caminho}` : `${base}/alertas`}
              className="flex min-h-14 items-center gap-3 px-4 py-2.5 hover:bg-concreto/50 sm:px-5"
            >
              <span className="flex min-w-0 flex-1 flex-col gap-1 sm:flex-row sm:items-center sm:gap-3">
                <SeloGravidade gravidade={a.gravidade} />
                <span className="min-w-0 text-sm">
                  <span className="font-semibold">{a.titulo}</span>
                  <span className="block truncate text-regua sm:inline sm:before:content-['_·_']">{a.detalhe}</span>
                </span>
              </span>
              <span className="flex shrink-0 items-center gap-1 text-sm font-semibold text-cianotipia">
                Resolver
                <ChevronRight aria-hidden className="size-4" />
              </span>
            </Link>
          </li>
        ))}
      </ul>
      <Link
        href={`${base}/alertas`}
        className="flex min-h-12 items-center justify-center border-t border-linha text-sm font-semibold text-cianotipia hover:bg-concreto/50"
      >
        {importantes.length > mostrar.length ? `Ver todos os ${importantes.length} alertas` : 'Abrir a central de alertas'}
      </Link>
    </section>
  );
}
