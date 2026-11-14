import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { buscarProjeto, listarArquivos, podeApontarCampo, podeEditarProjeto } from '@/lib/dados';
import { Arquivos } from './Arquivos';

export const metadata: Metadata = { title: 'Arquivos' };

export default async function PaginaArquivos({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const dados = await buscarProjeto(id);
  if (!dados) notFound();
  const { projeto, papel } = dados;
  const [arquivos, podeEditar, podeEnviar] = await Promise.all([
    listarArquivos(projeto.id),
    podeEditarProjeto(projeto, papel),
    podeApontarCampo(projeto, papel),
  ]);

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h2 className="text-xl font-semibold sm:text-2xl">Arquivos da obra</h2>
        <p className="mt-1 max-w-3xl text-regua">
          Projetos (DWG, PDF, IFC), alvará, ART, contratos e orçamentos num lugar só. Todo mundo da obra abre e baixa; engenheiro e mestre enviam.
          Revisão nova entra como nova versão e a anterior fica guardada.
        </p>
      </div>
      <Arquivos projetoId={projeto.id} arquivos={arquivos} podeEditar={podeEditar} podeEnviar={podeEnviar} />
    </div>
  );
}
