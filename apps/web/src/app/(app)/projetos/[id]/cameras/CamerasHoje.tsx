import Link from 'next/link';
import { situacaoCamera, type AgenteCamera, type Camera, type FotoCamera, horaCurta, ROTULO_ORIGEM_CAMERA } from '@obras/shared';
import { EnviarFoto } from './EnviarFoto';

const COR: Record<string, string> = {
  ok: 'bg-obra-ok/10 text-obra-ok',
  alerta: 'bg-marcador-claro text-marcador',
  aguardando: 'bg-concreto text-regua',
  desligada: 'bg-concreto text-regua',
};

/** Cartões das câmeras com a última foto e a situação. Recebe tudo pronto (a prévia usa dados de exemplo). */
export function CamerasHoje({
  projetoId,
  cameras,
  agentes,
  ultimas,
  podeEnviar,
  agora = new Date(),
}: {
  projetoId: string;
  cameras: Camera[];
  agentes: AgenteCamera[];
  ultimas: Map<string, FotoCamera>;
  podeEnviar: boolean;
  agora?: Date;
}) {
  const base = `/projetos/${projetoId}/cameras`;
  const porAgente = new Map(agentes.map((a) => [a.id, a]));
  return (
    <ul className="grid gap-4 md:grid-cols-2">
      {cameras.map((c) => {
        const foto = ultimas.get(c.id);
        const s = situacaoCamera(c, c.agente_id ? (porAgente.get(c.agente_id) ?? null) : null, agora);
        return (
          <li key={c.id} className="flex flex-col overflow-hidden rounded-medio border border-linha bg-papel">
            <Link href={`${base}/galeria?camera=${c.id}`} className="relative block aspect-video bg-concreto" aria-label={`Galeria de ${c.nome}`}>
              {foto?.url ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={foto.url} alt={`Última foto de ${c.nome}`} className="h-full w-full object-cover" loading="lazy" />
              ) : (
                <span className="flex h-full items-center justify-center px-4 text-center text-sm text-regua">Ainda sem foto desta câmera</span>
              )}
            </Link>
            <div className="flex flex-1 flex-col gap-3 p-4">
              <div className="flex flex-wrap items-start justify-between gap-2">
                <div className="min-w-0">
                  <h3 className="font-semibold">{c.nome}</h3>
                  <p className="numeros text-sm text-regua">
                    {ROTULO_ORIGEM_CAMERA[c.origem]}
                    {c.origem === 'agente' && ` · ${c.horarios.map(horaCurta).join(', ')}`}
                  </p>
                </div>
                <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${COR[s.nivel]}`}>
                  {s.nivel === 'ok' ? 'Em dia' : s.nivel === 'alerta' ? 'Atenção' : s.nivel === 'desligada' ? 'Desligada' : 'Aguardando'}
                </span>
              </div>
              <p className={`text-sm ${s.nivel === 'alerta' ? 'font-semibold text-marcador' : 'text-grafite'}`}>{s.texto}</p>
              <div className="mt-auto flex flex-wrap gap-2">
                <Link href={`${base}/galeria?camera=${c.id}`} className="inline-flex min-h-11 items-center rounded-medio px-1 text-sm font-semibold text-cianotipia hover:underline underline-offset-4">
                  Galeria
                </Link>
                <Link href={`${base}/comparar?camera=${c.id}`} className="inline-flex min-h-11 items-center rounded-medio px-1 text-sm font-semibold text-cianotipia hover:underline underline-offset-4">
                  Comparar dias
                </Link>
                <Link href={`${base}/timelapse?camera=${c.id}`} className="inline-flex min-h-11 items-center rounded-medio px-1 text-sm font-semibold text-cianotipia hover:underline underline-offset-4">
                  Time-lapse
                </Link>
              </div>
              {podeEnviar && c.ativa && <EnviarFoto projetoId={projetoId} cameraId={c.id} nome={c.nome} />}
            </div>
          </li>
        );
      })}
    </ul>
  );
}
