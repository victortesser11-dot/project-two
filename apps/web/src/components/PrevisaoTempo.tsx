import {
  Cloud,
  CloudDrizzle,
  CloudFog,
  CloudLightning,
  CloudRain,
  CloudSnow,
  CloudSun,
  Droplets,
  Sun,
  Wind,
  type LucideIcon,
} from 'lucide-react';
import { descricaoTempo, LIMITES_TEMPO, somarDias, type IconeTempo, type PrevisaoTempoDia } from '@obras/shared';

const ICONE: Record<IconeTempo, LucideIcon> = {
  sol: Sun,
  'sol-nuvem': CloudSun,
  nuvem: Cloud,
  nevoa: CloudFog,
  garoa: CloudDrizzle,
  chuva: CloudRain,
  neve: CloudSnow,
  tempestade: CloudLightning,
};
const SEMANA = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb'];

function rotuloDia(data: string, hoje: string): string {
  if (data === hoje) return 'Hoje';
  if (data === somarDias(hoje, 1)) return 'Amanhã';
  return `${SEMANA[new Date(`${data}T12:00:00Z`).getUTCDay()]} ${data.slice(8, 10)}/${data.slice(5, 7)}`;
}

const num = (n: number) => n.toLocaleString('pt-BR', { maximumFractionDigits: 1 });

/**
 * Previsão do tempo na obra (Open-Meteo): um quadro por dia com o tempo, máxima/mínima, chuva e chance, e rajadas.
 * Chuva de 5 mm ou mais e rajada forte ficam destacadas; tudo com texto, não só cor.
 */
export function PrevisaoTempo({ dias, hoje, titulo = 'Tempo nos próximos dias' }: { dias: PrevisaoTempoDia[]; hoje: string; titulo?: string }) {
  if (dias.length === 0) return null;
  return (
    <section aria-labelledby="titulo-previsao-tempo" className="cartao p-4 sm:p-5">
      <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
        <h3 id="titulo-previsao-tempo" className="text-base font-semibold">
          {titulo}
        </h3>
        <p className="text-xs text-regua">Previsão Open-Meteo, atualizada a cada hora</p>
      </div>
      <ul className="numeros grid grid-cols-2 gap-2 text-sm min-[480px]:grid-cols-4 lg:grid-cols-7">
        {dias.map((d) => {
          const { texto, icone } = descricaoTempo(d.codigo);
          const Icone = ICONE[icone];
          const chuva = d.chuva_mm >= 5;
          const vento = (d.rajada_kmh ?? 0) >= LIMITES_TEMPO.rajadaForte;
          const tempestade = icone === 'tempestade';
          return (
            <li
              key={d.data}
              className={`flex flex-col gap-1 rounded-medio border px-3 py-2.5 ${
                tempestade || vento ? 'border-marcador/40 bg-marcador-claro' : chuva ? 'border-cianotipia/30 bg-cianotipia-claro' : 'border-linha bg-concreto/50'
              }`}
            >
              <span className="text-xs font-semibold text-regua">{rotuloDia(d.data, hoje)}</span>
              <span className="flex items-center gap-2">
                <Icone aria-hidden className={`size-6 shrink-0 ${tempestade ? 'text-marcador' : chuva ? 'text-cianotipia' : 'text-grafite'}`} strokeWidth={1.8} />
                <span className="text-base font-semibold">
                  {d.tmax !== null ? `${Math.round(d.tmax)}°` : '—'}
                  <span className="font-normal text-regua"> / {d.tmin !== null ? `${Math.round(d.tmin)}°` : '—'}</span>
                </span>
              </span>
              <span className="text-xs leading-tight">{texto}</span>
              <span className={`flex items-center gap-1 text-xs ${chuva ? 'font-semibold text-cianotipia' : 'text-regua'}`}>
                <Droplets aria-hidden className="size-3.5 shrink-0" />
                {num(d.chuva_mm)} mm{d.probabilidade !== null ? ` · ${Math.round(d.probabilidade)}%` : ''}
              </span>
              {d.rajada_kmh !== null && (
                <span className={`flex items-center gap-1 text-xs ${vento ? 'font-semibold text-marcador' : 'text-regua'}`}>
                  <Wind aria-hidden className="size-3.5 shrink-0" />
                  rajadas {Math.round(d.rajada_kmh)} km/h
                </span>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
