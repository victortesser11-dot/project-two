import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { formatarCnpj } from '@obras/shared';
import { buscarProjeto, listarEmpreiteiras, listarTrabalhadores, podeEditarProjeto } from '@/lib/dados';
import { FormularioEmpreiteira } from '../Formularios';

export const metadata: Metadata = { title: 'Empreiteiras' };

export default async function PaginaEmpreiteiras({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const dados = await buscarProjeto(id);
  if (!dados) notFound();
  const { projeto, papel } = dados;
  const [empreiteiras, pessoas, podeGerir] = await Promise.all([
    listarEmpreiteiras(projeto.empresa_id),
    listarTrabalhadores(projeto.empresa_id),
    podeEditarProjeto(projeto, papel),
  ]);
  const qtd = (empId: string) => pessoas.filter((p) => p.empreiteira_id === empId && p.ativo).length;

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-6">
      <Link href={`/projetos/${id}/equipe`} className="flex min-h-11 items-center text-sm font-semibold text-cianotipia hover:underline underline-offset-4">
        ← Equipe
      </Link>
      <div>
        <h2 className="text-xl font-semibold sm:text-2xl">Empreiteiras</h2>
        <p className="mt-1 text-regua">Cadastro da empresa, vale para todas as obras. Com o CNPJ, a situação vem da Receita.</p>
      </div>
      {empreiteiras.length === 0 ? (
        <p className="rounded-medio border border-dashed border-campo/60 px-5 py-8 text-center text-sm text-regua">Nenhuma empreiteira cadastrada.</p>
      ) : (
        <ul className="divide-y divide-linha rounded-medio border border-linha bg-papel">
          {empreiteiras.map((e) => {
            const irregular = e.situacao_cnpj && e.situacao_cnpj !== 'ATIVA';
            return (
              <li key={e.id} className="flex flex-wrap items-center justify-between gap-2 px-4 py-3 sm:px-5">
                <div>
                  <p className="font-semibold">{e.nome}</p>
                  <p className="numeros text-sm text-regua">
                    {e.cnpj ? `CNPJ ${formatarCnpj(e.cnpj)}` : 'Sem CNPJ'}
                    {e.telefone ? ` · ${e.telefone}` : ''} · {qtd(e.id)} {qtd(e.id) === 1 ? 'pessoa' : 'pessoas'}
                  </p>
                </div>
                {e.situacao_cnpj && (
                  <span
                    className={`rounded-full px-2.5 py-0.5 text-xs font-semibold ${irregular ? 'bg-marcador-claro text-marcador' : 'bg-obra-ok/10 text-obra-ok'}`}
                  >
                    Receita: {e.situacao_cnpj}
                  </span>
                )}
              </li>
            );
          })}
        </ul>
      )}
      {podeGerir && (
        <section aria-labelledby="titulo-nova-emp" className="rounded-medio border border-linha bg-papel p-4 sm:p-5">
          <h3 id="titulo-nova-emp" className="mb-4 text-base font-semibold">
            Cadastrar empreiteira
          </h3>
          <FormularioEmpreiteira projetoId={id} />
        </section>
      )}
    </div>
  );
}
