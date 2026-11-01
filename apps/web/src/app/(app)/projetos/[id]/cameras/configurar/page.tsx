import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { buscarProjeto, listarAgentes, listarCameras, podeEditarProjeto } from '@/lib/dados';
import { TopoCameras } from '../NavCameras';
import { Agentes } from './Agentes';
import { FormularioCamera } from './FormularioCamera';
import { ListaCameras } from './ListaCameras';

export const metadata: Metadata = { title: 'Configurar câmeras' };

export default async function PaginaConfigurarCameras({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const dados = await buscarProjeto(id);
  if (!dados) notFound();
  const { projeto, papel } = dados;
  const [cameras, agentes, podeConfigurar] = await Promise.all([listarCameras(id), listarAgentes(id), podeEditarProjeto(projeto, papel)]);

  return (
    <div className="flex flex-col gap-6">
      <TopoCameras
        projetoId={id}
        ativa="configurar"
        podeConfigurar={podeConfigurar}
        titulo="Configurar câmeras"
        descricao="O agente é um programa num computador da obra que busca as fotos na rede local e envia para cá. Não precisa abrir porta no roteador."
      />
      {!podeConfigurar ? (
        <p className="rounded-medio border border-linha bg-papel p-4 text-regua">Só o engenheiro da obra ou o admin configuram câmeras.</p>
      ) : (
        <>
          <section aria-labelledby="titulo-agentes" className="rounded-medio border border-linha bg-papel p-4 sm:p-5">
            <h3 id="titulo-agentes" className="mb-4 text-base font-semibold">
              1. Agente da obra
            </h3>
            <Agentes projetoId={id} agentes={agentes} agora={new Date().toISOString()} />
          </section>
          <section aria-labelledby="titulo-lista-cameras" className="rounded-medio border border-linha bg-papel p-4 sm:p-5">
            <h3 id="titulo-lista-cameras" className="mb-4 text-base font-semibold">
              2. Câmeras
            </h3>
            <ListaCameras projetoId={id} cameras={cameras} agentes={agentes} />
          </section>
          <section aria-labelledby="titulo-nova-camera" className="rounded-medio border border-linha bg-papel p-4 sm:p-5">
            <h3 id="titulo-nova-camera" className="mb-4 text-base font-semibold">
              Cadastrar câmera
            </h3>
            <FormularioCamera projetoId={id} agentes={agentes} />
          </section>
        </>
      )}
    </div>
  );
}
