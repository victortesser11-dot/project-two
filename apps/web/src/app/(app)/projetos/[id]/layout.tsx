import { notFound } from 'next/navigation';
import { buscarProjeto, empresaAtual, podeEditarProjeto } from '@/lib/dados';
import { CabecalhoObra } from './CabecalhoObra';

export async function generateMetadata({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const dados = await buscarProjeto(id).catch(() => null);
  return { title: dados?.projeto.nome ?? 'Projeto' };
}

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export default async function LayoutProjeto({
  params,
  children,
}: {
  params: Promise<{ id: string }>;
  children: React.ReactNode;
}) {
  const { id } = await params;
  if (!UUID.test(id)) notFound();
  const dados = await buscarProjeto(id);
  // RLS devolve vazio tanto para "não existe" quanto para "sem acesso".
  if (!dados) notFound();
  const { projeto, papel } = dados;
  const [podeEditar, empresa] = await Promise.all([podeEditarProjeto(projeto, papel), empresaAtual()]);
  const podeExcluir = empresa?.papel === 'admin' && empresa.id === projeto.empresa_id;

  return (
    <div>
      <CabecalhoObra projeto={projeto} podeEditar={podeEditar} podeExcluir={podeExcluir} />
      <div className="pt-6 print:pt-0">{children}</div>
    </div>
  );
}
