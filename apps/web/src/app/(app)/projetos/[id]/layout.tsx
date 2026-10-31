import Link from 'next/link';
import { notFound } from 'next/navigation';
import { hojeIso } from '@obras/shared';
import { buscarProjeto } from '@/lib/dados';
import { SeloStatus } from '@/components/ui';
import { Regua } from '@/components/Regua';
import { AbasProjeto } from './AbasProjeto';

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
  const { projeto } = dados;

  return (
    <div>
      <div className="print:hidden">
        <Link href="/" className="text-sm font-medium text-cianotipia hover:underline underline-offset-4">
          Todas as obras
        </Link>
        <header className="mt-4 grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.2fr)] lg:items-end">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-3">
              <h1 className="text-2xl font-semibold break-words sm:text-3xl">{projeto.nome}</h1>
              <SeloStatus status={projeto.status} />
            </div>
            {projeto.endereco && <p className="mt-2 text-regua">{projeto.endereco}</p>}
          </div>
          <Regua inicio={projeto.data_inicio} fim={projeto.data_fim_prevista} hoje={hojeIso()} />
        </header>
        <div className="mt-8">
          <AbasProjeto projetoId={projeto.id} />
        </div>
      </div>
      <div className="pt-8 print:pt-0">{children}</div>
    </div>
  );
}
