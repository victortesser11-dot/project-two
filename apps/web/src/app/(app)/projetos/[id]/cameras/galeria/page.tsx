import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { dataIsoValida, diaDaSemana, formatarData, formatarDataLonga, horaDoInstante } from '@obras/shared';
import { assinarFotos, buscarProjeto, diasComFoto, listarCameras, listarFotosCamera, podeEditarProjeto } from '@/lib/dados';
import { SeletorCamera, TopoCameras } from '../NavCameras';
import { BotaoTirarFoto } from './BotaoTirarFoto';
import { classeEntrada } from '@/components/ui';

export const metadata: Metadata = { title: 'Galeria das câmeras' };

export default async function PaginaGaleria({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ camera?: string; data?: string }>;
}) {
  const { id } = await params;
  const q = await searchParams;
  const dados = await buscarProjeto(id);
  if (!dados) notFound();
  const { projeto, papel } = dados;
  const [cameras, podeConfigurar] = await Promise.all([listarCameras(id), podeEditarProjeto(projeto, papel)]);
  const camera = cameras.find((c) => c.id === q.camera) ?? cameras.find((c) => c.ativa) ?? cameras[0];
  const base = `/projetos/${id}/cameras/galeria`;

  const topo = (
    <TopoCameras
      projetoId={id}
      ativa="galeria"
      podeConfigurar={podeConfigurar}
      titulo="Galeria"
      descricao="Todas as fotos de cada câmera, dia a dia. Toque numa foto para ver no tamanho original."
    />
  );
  if (!camera) {
    return (
      <div className="flex flex-col gap-6">
        {topo}
        <p className="rounded-medio border border-linha bg-papel p-4 text-regua">Nenhuma câmera cadastrada.</p>
      </div>
    );
  }

  const dias = await diasComFoto(id, camera.id);
  const data = q.data && dataIsoValida(q.data) ? q.data : (dias[0]?.data ?? null);
  const i = dias.findIndex((d) => d.data === data);
  const anterior = i >= 0 ? dias[i + 1] : dias.find((d) => data !== null && d.data < data);
  const proximo = i > 0 ? dias[i - 1] : i < 0 ? [...dias].reverse().find((d) => data !== null && d.data > data) : undefined;
  const fotos = data ? await assinarFotos((await listarFotosCamera(id, { cameraId: camera.id, de: data, ate: data })).reverse()) : [];
  const link = (c: string, d?: string | null) => `${base}?camera=${c}${d ? `&data=${d}` : ''}`;

  return (
    <div className="flex flex-col gap-6">
      {topo}
      <SeletorCamera cameras={cameras} atual={camera.id} href={(c) => link(c)} />

      {dias.length === 0 ? (
        <p className="rounded-medio border border-linha bg-papel p-4 text-regua">{camera.nome} ainda não tem fotos.</p>
      ) : (
        <>
          <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-2">
              {anterior ? (
                <Link href={link(camera.id, anterior.data)} className="flex size-11 items-center justify-center rounded-medio border border-campo/60 bg-papel hover:border-grafite" aria-label={`Dia anterior com foto: ${formatarData(anterior.data)}`}>
                  <svg aria-hidden viewBox="0 0 16 16" className="size-4" fill="none" stroke="currentColor" strokeWidth="2"><path d="M10 3 5 8l5 5" /></svg>
                </Link>
              ) : (
                <span className="size-11" />
              )}
              <h3 className="numeros text-base font-semibold sm:text-lg">{data ? `${formatarDataLonga(data)}` : ''}</h3>
              {proximo ? (
                <Link href={link(camera.id, proximo.data)} className="flex size-11 items-center justify-center rounded-medio border border-campo/60 bg-papel hover:border-grafite" aria-label={`Próximo dia com foto: ${formatarData(proximo.data)}`}>
                  <svg aria-hidden viewBox="0 0 16 16" className="size-4" fill="none" stroke="currentColor" strokeWidth="2"><path d="m6 3 5 5-5 5" /></svg>
                </Link>
              ) : (
                <span className="size-11" />
              )}
            </div>
            <form action={base} className="flex items-end gap-2">
              <input type="hidden" name="camera" value={camera.id} />
              <label htmlFor="ir-data" className="sr-only">
                Ir para o dia
              </label>
              <input id="ir-data" type="date" name="data" defaultValue={data ?? ''} className={`${classeEntrada} numeros`} />
              <button type="submit" className="min-h-11 rounded-medio border border-campo/60 bg-papel px-4 font-semibold hover:border-grafite">
                Ir
              </button>
            </form>
          </div>

          <nav aria-label="Dias com foto" className="-mx-4 overflow-x-auto px-4 sm:mx-0 sm:px-0">
            <ul className="flex min-w-max gap-2">
              {dias.slice(0, 30).map((d) => (
                <li key={d.data}>
                  <Link
                    href={link(camera.id, d.data)}
                    aria-current={d.data === data ? 'page' : undefined}
                    className={`numeros flex min-h-11 flex-col items-center justify-center rounded-medio border px-3 py-1 text-xs ${
                      d.data === data ? 'border-cianotipia bg-cianotipia-claro text-cianotipia' : 'border-linha bg-papel text-regua hover:text-grafite'
                    }`}
                  >
                    <span className="font-semibold">{formatarData(d.data).slice(0, 5)}</span>
                    <span>{diaDaSemana(d.data).slice(0, 3)} · {d.fotos}</span>
                  </Link>
                </li>
              ))}
            </ul>
          </nav>

          {fotos.length === 0 ? (
            <p className="rounded-medio border border-linha bg-papel p-4 text-regua">Sem fotos de {camera.nome} neste dia.</p>
          ) : (
            <ul className="grid gap-4 sm:grid-cols-2">
              {fotos.map((f) => (
                <li key={f.id} className="overflow-hidden rounded-medio border border-linha bg-papel">
                  {f.url ? (
                    <a href={f.url} target="_blank" rel="noreferrer" className="block aspect-video bg-concreto">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={f.url} alt={`${camera.nome} às ${horaDoInstante(f.capturada_em)}`} loading="lazy" className="h-full w-full object-cover" />
                    </a>
                  ) : (
                    <div className="flex aspect-video items-center justify-center bg-concreto text-sm text-regua">Arquivo indisponível</div>
                  )}
                  <div className="flex items-center justify-between gap-2 px-3 py-1.5">
                    <p className="numeros text-sm">
                      <span className="font-semibold">{horaDoInstante(f.capturada_em)}</span>
                      <span className="text-regua"> · {f.origem === 'manual' ? 'pelo celular' : 'agente'}</span>
                    </p>
                    {podeConfigurar && <BotaoTirarFoto projetoId={id} fotoId={f.id} />}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </div>
  );
}
