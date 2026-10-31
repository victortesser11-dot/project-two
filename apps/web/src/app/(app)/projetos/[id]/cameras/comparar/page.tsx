import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { dataIsoValida, diasEntre, formatarData, fotoMaisPerto, horaDoInstante } from '@obras/shared';
import { assinarFotos, buscarProjeto, diasComFoto, listarCameras, listarFotosCamera, podeEditarProjeto } from '@/lib/dados';
import { SeletorCamera, TopoCameras } from '../NavCameras';
import { Comparador } from './Comparador';
import { classeEntrada } from '@/components/ui';

export const metadata: Metadata = { title: 'Comparar dias' };

export default async function PaginaComparar({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ camera?: string; a?: string; b?: string; hora?: string }>;
}) {
  const { id } = await params;
  const q = await searchParams;
  const dados = await buscarProjeto(id);
  if (!dados) notFound();
  const { projeto, papel } = dados;
  const [cameras, podeConfigurar] = await Promise.all([listarCameras(id), podeEditarProjeto(projeto, papel)]);
  const camera = cameras.find((c) => c.id === q.camera) ?? cameras.find((c) => c.ativa) ?? cameras[0];
  const base = `/projetos/${id}/cameras/comparar`;
  const hora = q.hora && /^\d{2}:\d{2}$/.test(q.hora) ? q.hora : '12:00';

  const dias = camera ? await diasComFoto(id, camera.id) : [];
  const b = q.b && dataIsoValida(q.b) && dias.some((d) => d.data === q.b) ? q.b : dias[0]?.data;
  // Padrão: uma semana antes (ou o dia com foto mais perto disso).
  const padraoA = b ? (dias.find((d) => diasEntre(d.data, b) >= 7) ?? dias[dias.length - 1])?.data : undefined;
  const a = q.a && dataIsoValida(q.a) && dias.some((d) => d.data === q.a) ? q.a : padraoA;

  let par: { antes: { url: string; rotulo: string }; depois: { url: string; rotulo: string } } | null = null;
  if (camera && a && b && a !== b) {
    const [fa, fb] = await Promise.all([
      listarFotosCamera(id, { cameraId: camera.id, de: a, ate: a }),
      listarFotosCamera(id, { cameraId: camera.id, de: b, ate: b }),
    ]);
    const escolhidas = [fotoMaisPerto(fa, hora), fotoMaisPerto(fb, hora)].filter((f) => f !== null);
    const [sa, sb] = await assinarFotos(escolhidas);
    if (sa?.url && sb?.url) {
      par = {
        antes: { url: sa.url, rotulo: `${formatarData(a)} ${horaDoInstante(sa.capturada_em)}` },
        depois: { url: sb.url, rotulo: `${formatarData(b)} ${horaDoInstante(sb.capturada_em)}` },
      };
    }
  }

  return (
    <div className="flex flex-col gap-6">
      <TopoCameras
        projetoId={id}
        ativa="comparar"
        podeConfigurar={podeConfigurar}
        titulo="Comparar dias"
        descricao="A mesma câmera em dois dias, com a foto mais perto do mesmo horário: o que andou na obra entre uma data e outra."
      />
      {!camera ? (
        <p className="rounded-medio border border-linha bg-papel p-4 text-regua">Nenhuma câmera cadastrada.</p>
      ) : (
        <>
          <SeletorCamera cameras={cameras} atual={camera.id} href={(c) => `${base}?camera=${c}`} />
          {dias.length < 2 ? (
            <p className="rounded-medio border border-linha bg-papel p-4 text-regua">É preciso foto de pelo menos dois dias de {camera.nome} para comparar.</p>
          ) : (
            <>
              <form action={base} className="grid gap-3 rounded-medio border border-linha bg-papel p-4 sm:grid-cols-[1fr_1fr_8rem_auto] sm:items-end">
                <input type="hidden" name="camera" value={camera.id} />
                {(
                  [
                    ['a', 'Antes', a],
                    ['b', 'Depois', b],
                  ] as const
                ).map(([nome, rotulo, valor]) => (
                  <div key={nome} className="flex flex-col gap-1.5">
                    <label htmlFor={`dia-${nome}`} className="text-sm font-semibold">
                      {rotulo}
                    </label>
                    <select id={`dia-${nome}`} name={nome} defaultValue={valor} className={`${classeEntrada} numeros`}>
                      {dias.map((d) => (
                        <option key={d.data} value={d.data}>
                          {formatarData(d.data)}
                        </option>
                      ))}
                    </select>
                  </div>
                ))}
                <div className="flex flex-col gap-1.5">
                  <label htmlFor="hora-comparar" className="text-sm font-semibold">
                    Hora
                  </label>
                  <input id="hora-comparar" type="time" name="hora" defaultValue={hora} className={`${classeEntrada} numeros`} />
                </div>
                <button type="submit" className="min-h-11 rounded-medio bg-cianotipia px-4 font-semibold text-white hover:bg-cianotipia-escuro">
                  Comparar
                </button>
              </form>
              {par ? (
                <Comparador antes={par.antes} depois={par.depois} />
              ) : (
                <p className="rounded-medio border border-linha bg-papel p-4 text-regua">Escolha dois dias diferentes.</p>
              )}
            </>
          )}
        </>
      )}
    </div>
  );
}
