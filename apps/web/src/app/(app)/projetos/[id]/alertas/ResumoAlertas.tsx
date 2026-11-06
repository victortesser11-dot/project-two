import Link from 'next/link';
import type { Alerta } from '@obras/shared';
import { SeloGravidade } from './SeloGravidade';

/** Os alertas mais importantes no topo do painel, com link para a central. */
export function ResumoAlertas({ projetoId, alertas }: { projetoId: string; alertas: Alerta[] }) {
  const importantes = alertas.filter((a) => a.gravidade !== 'baixa');
  if (importantes.length === 0) return null;
  const urgentes = importantes.filter((a) => a.gravidade === 'alta').length;
  return (
    <section aria-labelledby="titulo-resumo-alertas" className="cartao">
      <div className="flex flex-wrap items-baseline justify-between gap-3 border-b border-linha px-4 py-3 sm:px-5">
        <h2 id="titulo-resumo-alertas" className="text-base font-semibold">
          {importantes.length} {importantes.length === 1 ? 'alerta' : 'alertas'}
          {urgentes > 0 && <span className="font-normal text-marcador"> · {urgentes} {urgentes === 1 ? 'urgente' : 'urgentes'}</span>}
        </h2>
        <Link href={`/projetos/${projetoId}/alertas`} className="text-sm font-semibold text-cianotipia hover:underline underline-offset-4">
          Ver todos e justificar
        </Link>
      </div>
      <ul className="divide-y divide-linha">
        {importantes.slice(0, 3).map((a) => (
          <li key={a.chave} className="flex flex-col gap-1 px-4 py-2.5 sm:flex-row sm:items-center sm:gap-3 sm:px-5">
            <SeloGravidade gravidade={a.gravidade} />
            <span className="min-w-0 truncate text-sm">
              <span className="font-semibold">{a.titulo}</span> <span className="text-regua">— {a.detalhe}</span>
            </span>
          </li>
        ))}
      </ul>
    </section>
  );
}
