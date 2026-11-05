import type { GravidadeAlerta } from '@obras/shared';

const ESTILO: Record<GravidadeAlerta, { classe: string; rotulo: string; icone: string }> = {
  alta: { classe: 'bg-marcador-claro text-marcador', rotulo: 'Urgente', icone: '!' },
  media: { classe: 'bg-atencao-claro text-atencao', rotulo: 'Atenção', icone: '▲' },
  baixa: { classe: 'bg-concreto text-regua', rotulo: 'Aviso', icone: 'i' },
};

/** Gravidade com ícone e rótulo (nunca só a cor). */
export function SeloGravidade({ gravidade }: { gravidade: GravidadeAlerta }) {
  const e = ESTILO[gravidade];
  return (
    <span className={`inline-flex w-fit shrink-0 items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-semibold whitespace-nowrap ${e.classe}`}>
      <span aria-hidden className="font-bold">
        {e.icone}
      </span>
      {e.rotulo}
    </span>
  );
}
