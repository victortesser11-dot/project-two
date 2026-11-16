import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { buscarEap, buscarProjeto, podeEditarProjeto } from '@/lib/dados';
import { FormularioProjeto } from '../../novo/FormularioProjeto';

export const metadata: Metadata = { title: 'Dados da obra' };

/** Corrigir nome, endereço, datas, orçamento e situação da obra (engenheiro da obra e admin da empresa). */
export default async function EditarObra({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const dados = await buscarProjeto(id);
  if (!dados) notFound();
  const { projeto, papel } = dados;
  if (!(await podeEditarProjeto(projeto, papel))) redirect(`/projetos/${id}`);

  // Primeiro início e último término das tarefas: sugestão para as datas da obra.
  const tarefas = (await buscarEap(id)).filter((i) => i.tipo === 'tarefa');
  const inicios = tarefas.map((t) => t.inicio_previsto).filter((d): d is string => Boolean(d)).sort();
  const fins = tarefas.map((t) => t.fim_previsto).filter((d): d is string => Boolean(d)).sort();
  const cronograma = inicios.length > 0 && fins.length > 0 ? { inicio: inicios[0]!, fim: fins.at(-1)! } : null;

  return (
    <section className="mx-auto max-w-2xl">
      <Link href={`/projetos/${id}`} className="text-sm font-medium text-cianotipia underline-offset-4 hover:underline">
        Voltar para o painel
      </Link>
      <h2 className="mt-4 text-xl font-semibold sm:text-2xl">Dados da obra</h2>
      <p className="mt-1 mb-6 text-regua">
        Endereço, datas e situação aparecem no cabeçalho, na régua de prazo e na lista de obras. O endereço também ajuda a trazer o clima
        para o diário.
      </p>
      <div className="cartao p-5 sm:p-8">
        <FormularioProjeto projeto={{ ...projeto, temLocalizacao: projeto.latitude != null && projeto.longitude != null }} cronograma={cronograma} />
      </div>
    </section>
  );
}
