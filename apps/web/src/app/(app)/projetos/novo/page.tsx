import type { Metadata } from 'next';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { empresaAtual } from '@/lib/dados';
import { FormularioProjeto } from './FormularioProjeto';

export const metadata: Metadata = { title: 'Novo projeto' };

export default async function NovoProjeto() {
  if (!(await empresaAtual())) redirect('/');

  return (
    <section className="mx-auto max-w-2xl">
      <Link href="/" className="text-sm font-medium text-cianotipia hover:underline underline-offset-4">
        Voltar para as obras
      </Link>
      <h1 className="mt-4 text-3xl font-bold">Novo projeto</h1>
      <p className="mt-3 mb-8 text-regua">
        Comece pelo básico. Cronograma, câmeras, almoxarifado e equipe são configurados dentro do projeto.
      </p>
      <div className="rounded-medio border border-linha bg-papel p-5 sm:p-8">
        <FormularioProjeto />
      </div>
    </section>
  );
}
