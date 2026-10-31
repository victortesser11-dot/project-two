import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { diasEntre, formatarData, formatarMoeda } from '@obras/shared';
import { buscarEap, buscarProjeto, podeEditarProjeto, resumirEap } from '@/lib/dados';
import { ArvoreEap } from './ArvoreEap';
import { NavCronograma } from './NavCronograma';

export const metadata: Metadata = { title: 'EAP e cronograma' };

export default async function PaginaCronograma({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ importados?: string }>;
}) {
  const { id } = await params;
  const { importados } = await searchParams;
  const dados = await buscarProjeto(id);
  if (!dados) notFound();
  const { projeto, papel } = dados;

  const [itens, podeEditar] = await Promise.all([buscarEap(id), podeEditarProjeto(projeto, papel)]);
  const r = resumirEap(itens);

  const percentualOrcamento =
    r.custoTotal !== null && projeto.orcamento_total ? Math.round((r.custoTotal / Number(projeto.orcamento_total)) * 100) : null;
  const atrasoPrevisto =
    r.fim && projeto.data_fim_prevista && r.fim > projeto.data_fim_prevista ? diasEntre(projeto.data_fim_prevista, r.fim) : 0;
  const qtdImportados = importados ? Number(importados) : 0;

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h2 className="text-xl font-semibold sm:text-2xl">EAP e cronograma</h2>
          <p className="mt-1 text-regua">Etapas e tarefas com datas e custos. Dependências e linha de base ficam no Gantt.</p>
        </div>
        <NavCronograma projetoId={id} ativa="eap" />
      </div>

      {qtdImportados > 0 && (
        <div role="status" className="rounded-medio bg-obra-ok/10 px-4 py-3 text-sm text-obra-ok">
          {qtdImportados === 1 ? '1 item importado.' : `${qtdImportados} itens importados.`} Confira a árvore abaixo.
        </div>
      )}

      {itens.length > 0 && (
        <dl className="numeros grid grid-cols-2 gap-px overflow-hidden rounded-medio border border-linha bg-linha text-sm sm:grid-cols-4">
          <div className="bg-papel px-4 py-3">
            <dt className="text-regua">Estrutura</dt>
            <dd className="mt-0.5 font-semibold">
              {r.etapas} {r.etapas === 1 ? 'etapa' : 'etapas'}, {r.tarefas} {r.tarefas === 1 ? 'tarefa' : 'tarefas'}
            </dd>
          </div>
          <div className="bg-papel px-4 py-3">
            <dt className="text-regua">Custo previsto</dt>
            <dd className="mt-0.5 font-semibold">{formatarMoeda(r.custoTotal)}</dd>
            {percentualOrcamento !== null && (
              <dd className={`text-xs ${percentualOrcamento > 100 ? 'font-semibold text-marcador' : 'text-regua'}`}>
                {percentualOrcamento}% do orçamento do projeto
              </dd>
            )}
          </div>
          <div className="bg-papel px-4 py-3">
            <dt className="text-regua">Prazo da EAP</dt>
            <dd className="mt-0.5 font-semibold">{r.inicio ? `${formatarData(r.inicio)} a ${formatarData(r.fim)}` : '—'}</dd>
            {atrasoPrevisto > 0 && (
              <dd className="text-xs font-semibold text-marcador">
                {atrasoPrevisto} {atrasoPrevisto === 1 ? 'dia' : 'dias'} depois do fim previsto do projeto
              </dd>
            )}
          </div>
          <div className="bg-papel px-4 py-3">
            <dt className="text-regua">A completar</dt>
            <dd className="mt-0.5 font-semibold">
              {r.tarefasSemCusto + r.tarefasSemData === 0 ? 'Nada pendente' : ''}
              {r.tarefasSemCusto > 0 && <span className="block">{r.tarefasSemCusto} sem custo</span>}
              {r.tarefasSemData > 0 && <span className="block">{r.tarefasSemData} sem datas</span>}
            </dd>
          </div>
        </dl>
      )}

      <ArvoreEap projetoId={id} itens={itens} podeEditar={podeEditar} />
    </div>
  );
}
