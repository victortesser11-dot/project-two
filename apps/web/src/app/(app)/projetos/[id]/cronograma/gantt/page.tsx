import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { hojeIso } from '@obras/shared';
import { buscarDependencias, buscarEap, buscarLinhaBase, buscarProjeto, podeEditarProjeto } from '@/lib/dados';
import { NavCronograma } from '../NavCronograma';
import { Gantt } from './Gantt';

export const metadata: Metadata = { title: 'Gantt' };

export default async function PaginaGantt({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const dados = await buscarProjeto(id);
  if (!dados) notFound();
  const { projeto, papel } = dados;

  const [itens, dependencias, linhaBase, podeEditar] = await Promise.all([
    buscarEap(id),
    buscarDependencias(id),
    buscarLinhaBase(id),
    podeEditarProjeto(projeto, papel),
  ]);

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h2 className="text-xl font-semibold sm:text-2xl">Gantt</h2>
          <p className="mt-1 text-regua">
            Toque numa tarefa para ver as ligações. Ao atrasar uma tarefa, as que dependem dela andam junto.
          </p>
        </div>
        <NavCronograma projetoId={id} ativa="gantt" />
      </div>
      <Gantt
        projetoId={id}
        itens={itens}
        dependencias={dependencias}
        linhaBase={linhaBase}
        podeEditar={podeEditar}
        hoje={hojeIso()}
      />
    </div>
  );
}
