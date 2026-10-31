import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { formatarData, formatarMoeda, ROTULO_TIPO_CUSTO } from '@obras/shared';
import { buscarProjeto, buscarTrabalhador, listarCustos, listarEmpreiteiras, podeEditarProjeto, podeVerCustos } from '@/lib/dados';
import { FormularioCusto, FormularioPessoa } from '../../Formularios';
import { FuncoesObra } from '../../FuncoesObra';

export const metadata: Metadata = { title: 'Pessoa' };

export default async function PaginaPessoa({ params }: { params: Promise<{ id: string; pessoaId: string }> }) {
  const { id, pessoaId } = await params;
  const dados = await buscarProjeto(id);
  if (!dados) notFound();
  const { projeto, papel } = dados;
  const pessoa = await buscarTrabalhador(pessoaId);
  if (!pessoa || pessoa.empresa_id !== projeto.empresa_id) notFound();

  const [empreiteiras, podeGerir, verCustos] = await Promise.all([
    listarEmpreiteiras(projeto.empresa_id),
    podeEditarProjeto(projeto, papel),
    podeVerCustos(projeto, papel),
  ]);
  const custos = verCustos ? (await listarCustos(projeto.empresa_id)).filter((c) => c.trabalhador_id === pessoa.id) : [];
  const empreiteira = empreiteiras.find((e) => e.id === pessoa.empreiteira_id);

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-6">
      <FuncoesObra />
      <Link href={`/projetos/${id}/equipe`} className="flex min-h-11 items-center text-sm font-semibold text-cianotipia hover:underline underline-offset-4">
        ← Equipe
      </Link>
      <div>
        <h2 className="text-xl font-semibold sm:text-2xl">{pessoa.nome}</h2>
        <p className="numeros mt-1 text-regua">
          {pessoa.funcao} · {empreiteira ? empreiteira.nome : 'Equipe própria'}
          {pessoa.cpf_mascarado ? ` · CPF ${pessoa.cpf_mascarado}` : ''}
          {pessoa.telefone ? ` · ${pessoa.telefone}` : ''}
        </p>
      </div>

      {verCustos && (
        <section aria-labelledby="titulo-custos" className="rounded-medio border border-linha bg-papel">
          <h3 id="titulo-custos" className="border-b border-linha px-4 py-3 text-base font-semibold sm:px-5">
            Custo (histórico com vigência)
          </h3>
          {custos.length === 0 ? (
            <p className="px-4 py-4 text-sm text-marcador sm:px-5">Sem custo lançado: as horas desta pessoa ficam sem valor na mão de obra.</p>
          ) : (
            <ul className="numeros divide-y divide-linha text-sm">
              {custos.map((c, i) => (
                <li key={c.vigente_desde} className="flex justify-between gap-3 px-4 py-2.5 sm:px-5">
                  <span>
                    Desde {formatarData(c.vigente_desde)} {i === 0 && <span className="ml-1 rounded bg-obra-ok/10 px-1.5 text-xs font-semibold text-obra-ok">atual</span>}
                  </span>
                  <span className="font-semibold">
                    {formatarMoeda(c.valor)} <span className="font-normal text-regua">{ROTULO_TIPO_CUSTO[c.tipo].toLowerCase()}{c.unidade_producao ? ` (${c.unidade_producao})` : ''}</span>
                  </span>
                </li>
              ))}
            </ul>
          )}
          {podeGerir && (
            <div className="border-t border-linha p-4 sm:p-5">
              <FormularioCusto projetoId={id} pessoaId={pessoa.id} />
              <p className="mt-3 text-xs text-regua">Um custo novo vale da data informada em diante; os dias anteriores mantêm o custo da época.</p>
            </div>
          )}
        </section>
      )}

      {podeGerir && (
        <section aria-labelledby="titulo-dados" className="rounded-medio border border-linha bg-papel p-4 sm:p-5">
          <h3 id="titulo-dados" className="mb-4 text-base font-semibold">
            Dados da pessoa
          </h3>
          <FormularioPessoa projetoId={id} empreiteiras={empreiteiras} pessoa={pessoa} />
        </section>
      )}
    </div>
  );
}
