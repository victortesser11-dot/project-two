import { notFound } from 'next/navigation';
import { moduloPorSlug } from '../modulos';

// Rota provisória dos módulos que ainda não foram construídos.
export default async function ModuloEmBreve({ params }: { params: Promise<{ id: string; modulo: string }> }) {
  const { modulo: slug } = await params;
  const modulo = moduloPorSlug(slug);
  if (!modulo) notFound();

  return (
    <section className="max-w-xl rounded-medio border border-dashed border-regua/50 px-6 py-10">
      <h2 className="text-2xl font-bold">{modulo.nome}</h2>
      <p className="mt-3 text-regua">{modulo.resumo}</p>
      <p className="mt-6 text-sm font-semibold">Entra no sprint {modulo.sprint} do MVP.</p>
    </section>
  );
}
