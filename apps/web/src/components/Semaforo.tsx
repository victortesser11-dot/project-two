import type { CorSemaforo } from '@obras/shared';

const ESTILO: Record<CorSemaforo, { classe: string; rotulo: string }> = {
  verde: { classe: 'bg-obra-ok/10 text-obra-ok', rotulo: 'Em dia' },
  amarelo: { classe: 'bg-atencao-claro text-atencao', rotulo: 'Atenção' },
  vermelho: { classe: 'bg-marcador-claro text-marcador', rotulo: 'Crítica' },
  sem_dados: { classe: 'bg-concreto text-regua', rotulo: 'Sem dados' },
};

/** Semáforo com ícone e rótulo (a cor nunca vai sozinha). */
export function SeloSemaforo({ cor }: { cor: CorSemaforo }) {
  const e = ESTILO[cor];
  return (
    <span className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-semibold whitespace-nowrap ${e.classe}`}>
      <svg aria-hidden viewBox="0 0 12 12" className="size-3" fill="currentColor">
        {cor === 'verde' && <path d="M6 0a6 6 0 1 0 0 12A6 6 0 0 0 6 0Zm-1 8.6L2.4 6l1-1L5 6.6l3.6-3.6 1 1L5 8.6Z" />}
        {cor === 'amarelo' && <path d="M6 .5 11.8 11H.2L6 .5Zm-.7 4v3.2h1.4V4.5H5.3Zm0 4.3v1.4h1.4V8.8H5.3Z" />}
        {cor === 'vermelho' && <path d="M3.5 0h5L12 3.5v5L8.5 12h-5L0 8.5v-5L3.5 0Zm-.2 4.3L5 6 3.3 7.7l1 1L6 7l1.7 1.7 1-1L7 6l1.7-1.7-1-1L6 5 4.3 3.3l-1 1Z" />}
        {cor === 'sem_dados' && <rect x="2" y="5" width="8" height="2" rx="1" />}
      </svg>
      {e.rotulo}
    </span>
  );
}
