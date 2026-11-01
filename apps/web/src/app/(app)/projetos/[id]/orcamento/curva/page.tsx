import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { curvaSFinanceira, hojeIso } from '@obras/shared';
import { buscarApontamentos, buscarEap, buscarLinhaBase, buscarProjeto, custoRealizadoPorDia, podeFinanceiro } from '@/lib/dados';
import { CurvaS } from '../../CurvaS';
import { montarPainel } from '../../painel';
import { TopoOrcamento } from '../NavOrcamento';
import { CurvaFinanceira } from '../CurvaFinanceira';

export const metadata: Metadata = { title: 'Curva S' };

export default async function PaginaCurva({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const dados = await buscarProjeto(id);
  if (!dados) notFound();
  const { projeto, papel } = dados;
  const hoje = hojeIso();
  const [itens, linhaBase, apontamentos, financeiro] = await Promise.all([buscarEap(id), buscarLinhaBase(id), buscarApontamentos(id), podeFinanceiro(projeto, papel)]);
  const realizado = financeiro ? await custoRealizadoPorDia(id) : null;
  const tarefas = itens.filter((i) => i.tipo === 'tarefa');
  const usarBase = linhaBase !== null;
  const referencia = usarBase ? 'linha de base' : 'previsto atual';

  const financeira = curvaSFinanceira(
    tarefas.map((t) => ({
      id: t.id,
      custo: usarBase && t.custo_base !== null ? Number(t.custo_base) : t.custo_previsto === null ? null : Number(t.custo_previsto),
      inicio: usarBase && t.inicio_base ? t.inicio_base : t.inicio_previsto,
      fim: usarBase && t.fim_base ? t.fim_base : t.fim_previsto,
    })),
    new Map(tarefas.map((t) => [t.id, Number(t.custo_previsto ?? 0)])),
    realizado ?? [],
    apontamentos,
    hoje,
  );
  const fisica = montarPainel(itens, apontamentos, usarBase, hoje).curva;

  return (
    <div className="flex flex-col gap-6">
      <TopoOrcamento
        projetoId={id}
        ativa="curva"
        financeiro={financeiro}
        titulo="Curva S"
        descricao={`Avanço acumulado da obra, planejado (${referencia}) contra o real: em dinheiro e em % físico.`}
      />
      {financeiro && (
        <section aria-labelledby="titulo-curva-financeira" className="rounded-medio border border-linha bg-papel p-4 sm:p-5">
          <h3 id="titulo-curva-financeira" className="text-base font-semibold">
            Curva S financeira
          </h3>
          <p className="mt-1 mb-4 text-sm text-regua">
            Realizado acima do agregado: gastando mais do que o serviço feito vale. Agregado abaixo do planejado: atrasada.
          </p>
          {financeira.length >= 2 ? (
            <CurvaFinanceira pontos={financeira} hoje={hoje} referencia={referencia} />
          ) : (
            <p className="text-sm text-regua">Aparece quando as tarefas tiverem custo e datas.</p>
          )}
        </section>
      )}
      <section aria-labelledby="titulo-curva-fisica" className="rounded-medio border border-linha bg-papel p-4 sm:p-5">
        <h3 id="titulo-curva-fisica" className="text-base font-semibold">
          Curva S física
        </h3>
        <p className="mt-1 mb-4 text-sm text-regua">% acumulado da obra, planejado contra o apontado em &quot;Hoje&quot;.</p>
        {fisica.length >= 2 ? <CurvaS pontos={fisica} hoje={hoje} referencia={referencia} /> : <p className="text-sm text-regua">Aparece quando as tarefas tiverem datas.</p>}
      </section>
    </div>
  );
}
