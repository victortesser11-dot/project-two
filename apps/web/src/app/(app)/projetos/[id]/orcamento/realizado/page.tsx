import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { custosNaArvore, formatarMoeda, indicadoresCusto, type TotaisCusto } from '@obras/shared';
import { buscarEap, buscarProjeto, orcadoRealizado, podeFinanceiro } from '@/lib/dados';
import { TopoOrcamento } from '../NavOrcamento';

export const metadata: Metadata = { title: 'Orçado × realizado' };

function Desvio({ t }: { t: TotaisCusto }) {
  const ind = indicadoresCusto(t);
  if (ind.acimaPct === null) return <span className="text-regua">—</span>;
  const acima = ind.acimaPct > 0;
  return (
    <span className={acima ? 'font-semibold text-marcador' : 'font-semibold text-obra-ok'}>
      {acima ? '+' : '−'}
      {String(Math.abs(ind.acimaPct)).replace('.', ',')}%
    </span>
  );
}

export default async function PaginaRealizado({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ nivel?: string }> }) {
  const { id } = await params;
  const { nivel } = await searchParams;
  const dados = await buscarProjeto(id);
  if (!dados) notFound();
  const { projeto, papel } = dados;
  const financeiro = await podeFinanceiro(projeto, papel);
  const topo = (
    <TopoOrcamento
      projetoId={id}
      ativa="realizado"
      financeiro={financeiro}
      titulo="Orçado × comprometido × realizado"
      descricao="Realizado = material aplicado (saídas do almoxarifado) + mão de obra apontada + despesas lançadas. O valor agregado é o orçado da parte já feita: é contra ele que o gasto se compara."
    />
  );
  if (!financeiro) {
    return (
      <div className="flex flex-col gap-6">
        {topo}
        <p className="rounded-medio border border-linha bg-papel p-4 text-regua">Só o engenheiro, o financeiro e o admin veem os custos realizados.</p>
      </div>
    );
  }

  const [itens, linhas] = await Promise.all([buscarEap(id), orcadoRealizado(id)]);
  const { porItem, semTarefa, obra } = custosNaArvore(itens, linhas ?? []);
  const ind = indicadoresCusto(obra);
  const soEtapas = nivel !== 'tudo';
  const visiveis = itens.filter((i) => porItem.has(i.id) && (!soEtapas || i.nivel === 1));
  const base = `/projetos/${id}/orcamento/realizado`;

  return (
    <div className="flex flex-col gap-6">
      {topo}
      <section aria-label="Resumo dos custos" className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <div className="rounded-medio border border-linha bg-papel p-4">
          <h3 className="text-sm font-semibold text-regua">Orçado</h3>
          <p className="numeros mt-1 text-2xl font-semibold">{formatarMoeda(obra.orcado, { compacta: true })}</p>
          <p className="numeros text-sm text-regua">feito vale {formatarMoeda(obra.agregado, { compacta: true })}</p>
        </div>
        <div className="rounded-medio border border-linha bg-papel p-4">
          <h3 className="text-sm font-semibold text-regua">Comprometido</h3>
          <p className="numeros mt-1 text-2xl font-semibold">{formatarMoeda(obra.comprometido, { compacta: true })}</p>
          <p className="numeros text-sm text-regua">
            {obra.orcado > 0 ? `${Math.round((obra.comprometido / obra.orcado) * 100)}% do orçado em contratos e pedidos` : 'contratos e pedidos'}
          </p>
        </div>
        <div className="rounded-medio border border-linha bg-papel p-4">
          <h3 className="text-sm font-semibold text-regua">Realizado</h3>
          <p className="numeros mt-1 text-2xl font-semibold">{formatarMoeda(obra.realizado, { compacta: true })}</p>
          <p className="numeros text-sm text-regua">
            material {formatarMoeda(obra.material, { compacta: true })} · MO {formatarMoeda(obra.mao_obra, { compacta: true })} · despesas{' '}
            {formatarMoeda(obra.despesas, { compacta: true })}
          </p>
        </div>
        <div className={`rounded-medio border p-4 ${ind.acimaPct !== null && ind.acimaPct > 0 ? 'border-marcador/40 bg-marcador-claro' : 'border-linha bg-papel'}`}>
          <h3 className={`text-sm font-semibold ${ind.acimaPct !== null && ind.acimaPct > 0 ? 'text-marcador' : 'text-regua'}`}>Desempenho de custo</h3>
          {ind.acimaPct === null ? (
            <p className="mt-1 text-sm text-regua">Aparece quando houver avanço apontado e custo lançado.</p>
          ) : (
            <>
              <p className="numeros mt-1 text-2xl font-semibold">
                {ind.acimaPct > 0 ? `${String(ind.acimaPct).replace('.', ',')}% acima` : `${String(Math.abs(ind.acimaPct)).replace('.', ',')}% abaixo`}
              </p>
              <p className="numeros text-sm text-regua">
                do que vale o que foi feito
                {ind.projetadoNoTermino !== null && <span className="block">No ritmo atual, termina em {formatarMoeda(ind.projetadoNoTermino, { compacta: true })}</span>}
              </p>
            </>
          )}
        </div>
      </section>

      <div className="flex flex-wrap items-center gap-2">
        {[
          { href: base, nome: 'Etapas', ativo: soEtapas },
          { href: `${base}?nivel=tudo`, nome: 'Etapas e tarefas', ativo: !soEtapas },
        ].map((a) => (
          <Link
            key={a.href}
            href={a.href}
            aria-current={a.ativo ? 'page' : undefined}
            className={`flex min-h-11 items-center rounded-full border px-4 text-sm font-semibold ${a.ativo ? 'border-cianotipia bg-cianotipia-claro text-cianotipia' : 'border-linha bg-papel text-regua hover:text-grafite'}`}
          >
            {a.nome}
          </Link>
        ))}
      </div>

      {visiveis.length === 0 ? (
        <p className="rounded-medio border border-linha bg-papel p-4 text-regua">Sem orçamento nem custos lançados ainda.</p>
      ) : (
        <div className="overflow-x-auto rounded-medio border border-linha bg-papel">
          <table className="numeros w-full min-w-[720px] text-sm">
            <caption className="sr-only">Orçado, comprometido, realizado e valor agregado por item</caption>
            <thead className="bg-concreto">
              <tr>
                <th scope="col" className="px-3 py-2 text-left font-semibold">Item</th>
                <th scope="col" className="px-3 py-2 text-right font-semibold">Orçado</th>
                <th scope="col" className="px-3 py-2 text-right font-semibold">Comprometido</th>
                <th scope="col" className="px-3 py-2 text-right font-semibold">Realizado</th>
                <th scope="col" className="px-3 py-2 text-right font-semibold">Agregado</th>
                <th scope="col" className="px-3 py-2 text-right font-semibold">Gasto × feito</th>
              </tr>
            </thead>
            <tbody>
              {visiveis.map((i) => {
                const t = porItem.get(i.id)!;
                return (
                  <tr key={i.id} className={`border-t border-linha ${i.tipo === 'etapa' ? 'bg-concreto/40 font-semibold' : ''}`}>
                    <th scope="row" className="max-w-72 truncate px-3 py-2 text-left font-[inherit]" style={{ paddingLeft: `${12 + Math.min(i.nivel - 1, 5) * 14}px` }}>
                      <span className="text-regua">{i.codigo}</span> {i.nome}
                    </th>
                    <td className="px-3 py-2 text-right">{formatarMoeda(t.orcado)}</td>
                    <td className="px-3 py-2 text-right">{formatarMoeda(t.comprometido)}</td>
                    <td className="px-3 py-2 text-right">{formatarMoeda(t.realizado)}</td>
                    <td className="px-3 py-2 text-right">{formatarMoeda(t.agregado)}</td>
                    <td className="px-3 py-2 text-right">
                      <Desvio t={t} />
                    </td>
                  </tr>
                );
              })}
              {semTarefa && (
                <tr className="border-t border-linha text-regua">
                  <th scope="row" className="px-3 py-2 text-left font-normal">
                    Sem tarefa (tarefa apagada)
                  </th>
                  <td className="px-3 py-2 text-right">—</td>
                  <td className="px-3 py-2 text-right">{formatarMoeda(semTarefa.comprometido)}</td>
                  <td className="px-3 py-2 text-right">{formatarMoeda(semTarefa.realizado)}</td>
                  <td className="px-3 py-2 text-right">—</td>
                  <td className="px-3 py-2 text-right">—</td>
                </tr>
              )}
            </tbody>
            <tfoot className="border-t-2 border-grafite/20 font-semibold">
              <tr>
                <th scope="row" className="px-3 py-2 text-left">Obra</th>
                <td className="px-3 py-2 text-right">{formatarMoeda(obra.orcado)}</td>
                <td className="px-3 py-2 text-right">{formatarMoeda(obra.comprometido)}</td>
                <td className="px-3 py-2 text-right">{formatarMoeda(obra.realizado)}</td>
                <td className="px-3 py-2 text-right">{formatarMoeda(obra.agregado)}</td>
                <td className="px-3 py-2 text-right">
                  <Desvio t={obra} />
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}
      <p className="text-sm text-regua">
        &quot;Gasto × feito&quot;: quanto o realizado passou (ou ficou abaixo) do valor agregado. Positivo em vermelho é gasto acima do que o serviço feito vale pelo
        orçamento.{' '}
        <Link href={`/projetos/${id}/orcamento/lancamentos`} className="font-semibold text-cianotipia underline underline-offset-4">
          Lançar despesas e contratos
        </Link>
      </p>
    </div>
  );
}
