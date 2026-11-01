import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { formatarData, periodoTimelapse, quadrosTimelapse } from '@obras/shared';
import { assinarFotos, buscarProjeto, listarCameras, listarFotosCamera, podeEditarProjeto } from '@/lib/dados';
import { SeletorCamera, TopoCameras } from '../NavCameras';
import { Timelapse } from './Timelapse';

export const metadata: Metadata = { title: 'Time-lapse' };

export default async function PaginaTimelapse({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ camera?: string; periodo?: string; hora?: string }>;
}) {
  const { id } = await params;
  const q = await searchParams;
  const dados = await buscarProjeto(id);
  if (!dados) notFound();
  const { projeto, papel } = dados;
  const [cameras, podeConfigurar] = await Promise.all([listarCameras(id), podeEditarProjeto(projeto, papel)]);
  const camera = cameras.find((c) => c.id === q.camera) ?? cameras.find((c) => c.ativa) ?? cameras[0];
  const periodo = q.periodo === 'obra' ? 'obra' : 'semana';
  const hora = q.hora && /^\d{2}:\d{2}$/.test(q.hora) ? q.hora : '12:00';
  const base = `/projetos/${id}/cameras/timelapse`;
  const link = (p: Record<string, string>) => `${base}?${new URLSearchParams({ camera: camera?.id ?? '', periodo, hora, ...p })}`;

  let quadros: { url: string; rotulo: string }[] = [];
  if (camera) {
    const fotos = await listarFotosCamera(id, { cameraId: camera.id });
    const escolhidas = quadrosTimelapse(fotos, { ...periodoTimelapse(periodo, fotos[0]?.data ?? null), alvo: hora });
    quadros = (await assinarFotos(escolhidas)).filter((f) => f.url).map((f) => ({ url: f.url!, rotulo: formatarData(f.data) }));
  }

  return (
    <div className="flex flex-col gap-6">
      <TopoCameras
        projetoId={id}
        ativa="timelapse"
        podeConfigurar={podeConfigurar}
        titulo="Time-lapse"
        descricao="Uma foto por dia, sempre perto do mesmo horário, passando em sequência: a obra crescendo em segundos."
      />
      {!camera ? (
        <p className="rounded-medio border border-linha bg-papel p-4 text-regua">Nenhuma câmera cadastrada.</p>
      ) : (
        <>
          <SeletorCamera cameras={cameras} atual={camera.id} href={(c) => link({ camera: c })} />
          <div className="flex flex-wrap items-center gap-2">
            {(
              [
                ['semana', 'Última semana'],
                ['obra', 'Obra inteira'],
              ] as const
            ).map(([p, nome]) => (
              <Link
                key={p}
                href={link({ periodo: p })}
                aria-current={periodo === p ? 'page' : undefined}
                className={`flex min-h-11 items-center rounded-full border px-4 text-sm font-semibold ${
                  periodo === p ? 'border-cianotipia bg-cianotipia-claro text-cianotipia' : 'border-linha bg-papel text-regua hover:text-grafite'
                }`}
              >
                {nome}
              </Link>
            ))}
            <span className="ml-2 text-sm text-regua">Foto de cada dia perto de:</span>
            {['07:00', '12:00', '17:00'].map((h) => (
              <Link
                key={h}
                href={link({ hora: h })}
                aria-current={hora === h ? 'page' : undefined}
                className={`numeros flex min-h-11 items-center rounded-full border px-3 text-sm font-semibold ${
                  hora === h ? 'border-cianotipia bg-cianotipia-claro text-cianotipia' : 'border-linha bg-papel text-regua hover:text-grafite'
                }`}
              >
                {h}
              </Link>
            ))}
          </div>
          {quadros.length < 2 ? (
            <p className="rounded-medio border border-linha bg-papel p-4 text-regua">
              O time-lapse aparece quando {camera.nome} tiver foto em pelo menos dois dias {periodo === 'semana' ? 'da última semana' : ''}.
            </p>
          ) : (
            <Timelapse key={`${camera.id}-${periodo}-${hora}`} quadros={quadros} />
          )}
        </>
      )}
    </div>
  );
}
