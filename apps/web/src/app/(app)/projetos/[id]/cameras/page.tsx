import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { buscarProjeto, listarAgentes, listarCameras, podeApontarCampo, podeEditarProjeto, ultimasFotos } from '@/lib/dados';
import { CamerasHoje } from './CamerasHoje';
import { TopoCameras } from './NavCameras';

export const metadata: Metadata = { title: 'Câmeras' };

export default async function PaginaCameras({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const dados = await buscarProjeto(id);
  if (!dados) notFound();
  const { projeto, papel } = dados;
  const [cameras, agentes, ultimas, podeConfigurar, podeEnviar] = await Promise.all([
    listarCameras(id),
    listarAgentes(id),
    ultimasFotos(id),
    podeEditarProjeto(projeto, papel),
    podeApontarCampo(projeto, papel),
  ]);
  const ativas = cameras.filter((c) => c.ativa);

  return (
    <div className="flex flex-col gap-6">
      <TopoCameras
        projetoId={id}
        ativa="cameras"
        podeConfigurar={podeConfigurar}
        titulo="Câmeras"
        descricao="A última foto de cada câmera e se ela está em dia. As fotos chegam sozinhas pelo agente da obra nos horários definidos; o celular serve de reserva."
      />
      {ativas.length === 0 ? (
        <section className="rounded-medio border border-linha bg-papel p-5">
          <h3 className="text-base font-semibold">Nenhuma câmera cadastrada</h3>
          <p className="mt-1 max-w-2xl text-regua">
            Cadastre as câmeras da obra (Intelbras direto ou pelo NVR) e o agente que vai buscar as fotos. Sem agente ainda? Cadastre uma câmera
            &quot;foto pelo celular&quot; e comece pela foto diária tirada à mão, sempre do mesmo ponto.
          </p>
          {podeConfigurar && (
            <Link
              href={`/projetos/${id}/cameras/configurar`}
              className="mt-4 inline-flex min-h-11 items-center justify-center rounded-medio bg-cianotipia px-4 font-semibold text-white hover:bg-cianotipia-escuro"
            >
              Configurar câmeras
            </Link>
          )}
        </section>
      ) : (
        <CamerasHoje projetoId={id} cameras={ativas} agentes={agentes} ultimas={ultimas} podeEnviar={podeEnviar} />
      )}
    </div>
  );
}
