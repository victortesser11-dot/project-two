import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { buscarEap, buscarProjeto, exigirUsuario, podeApontarCampo } from '@/lib/dados';
import { etapaDe } from './selecao';
import { ListaHoje } from './ListaHoje';

export const metadata: Metadata = { title: 'Tarefas de hoje' };

export default async function PaginaHoje({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const dados = await buscarProjeto(id);
  if (!dados) notFound();
  const { projeto, papel } = dados;
  const [itens, podeApontar, { usuario }] = await Promise.all([buscarEap(id), podeApontarCampo(projeto, papel), exigirUsuario()]);
  const etapas = Object.fromEntries(etapaDe(itens));

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-6">
      <div>
        <h2 className="text-xl font-semibold sm:text-2xl">Tarefas de hoje</h2>
        <p className="mt-1 text-regua">
          {podeApontar
            ? 'Aponte o avanço de cada frente. Sem sinal, o apontamento fica no aparelho e sobe sozinho depois.'
            : 'O que está previsto para hoje e o avanço apontado pela obra.'}
        </p>
      </div>
      {itens.some((i) => i.tipo === 'tarefa') ? (
        <ListaHoje projetoId={id} usuarioId={usuario.id} itens={itens} etapas={etapas} podeApontar={podeApontar} />
      ) : (
        <div className="rounded-medio border border-dashed border-campo/60 px-5 py-10 text-center">
          <p className="font-semibold">A obra ainda não tem tarefas</p>
          <p className="mt-1 text-sm text-regua">
            Monte ou importe a EAP no{' '}
            <Link href={`/projetos/${id}/cronograma`} className="font-semibold text-cianotipia underline underline-offset-4">
              cronograma
            </Link>
            .
          </p>
        </div>
      )}
    </div>
  );
}
