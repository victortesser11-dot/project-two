import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { fisicoFinanceiro, formatarMoeda, rotuloMes, tabelaFisicoFinanceiro } from '@obras/shared';
import { buscarEap, buscarLinhaBase, buscarProjeto, podeFinanceiro } from '@/lib/dados';
import { TopoOrcamento } from '../NavOrcamento';
import { BaixarPlanilha } from './BaixarPlanilha';

export const metadata: Metadata = { title: 'Físico-financeiro' };

export default async function PaginaFisicoFinanceiro({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ ref?: string }> }) {
  const { id } = await params;
  const { ref } = await searchParams;
  const dados = await buscarProjeto(id);
  if (!dados) notFound();
  const { projeto, papel } = dados;
  const [itens, linhaBase, financeiro] = await Promise.all([buscarEap(id), buscarLinhaBase(id), podeFinanceiro(projeto, papel)]);
  const usarBase = linhaBase !== null && ref !== 'atual';
  const tarefas = itens.filter((i) => i.tipo === 'tarefa');
  const ff = fisicoFinanceiro(
    tarefas.map((t) => ({
      id: t.id,
      custo: usarBase ? (t.custo_base === null ? null : Number(t.custo_base)) : t.custo_previsto === null ? null : Number(t.custo_previsto),
      inicio: usarBase ? t.inicio_base : t.inicio_previsto,
      fim: usarBase ? t.fim_base : t.fim_previsto,
    })),
  );
  const linhas = tabelaFisicoFinanceiro(itens, ff);
  const base = `/projetos/${id}/orcamento/fisico-financeiro`;
  const referencia = usarBase ? 'linha-de-base' : 'previsto-atual';

  return (
    <div className="flex flex-col gap-6">
      <TopoOrcamento
        projetoId={id}
        ativa="fisico-financeiro"
        financeiro={financeiro}
        titulo="Físico-financeiro"
        descricao="O custo de cada tarefa distribuído pelos meses em que ela acontece, na proporção dos dias. É o desembolso previsto mês a mês."
        acoes={
          ff.meses.length > 0 ? (
            <BaixarPlanilha obra={projeto.nome} referencia={referencia} meses={ff.meses} linhas={linhas} porMes={ff.porMes} acumulado={ff.acumulado} />
          ) : undefined
        }
      />
      {linhaBase && (
        <nav aria-label="Referência" className="inline-flex self-start rounded-medio border border-linha bg-concreto p-0.5">
          {[
            { href: base, nome: 'Linha de base', ativo: usarBase },
            { href: `${base}?ref=atual`, nome: 'Previsto atual', ativo: !usarBase },
          ].map((a) => (
            <Link
              key={a.href}
              href={a.href}
              aria-current={a.ativo ? 'page' : undefined}
              className={`flex min-h-10 items-center rounded-[8px] px-4 text-sm font-semibold ${a.ativo ? 'bg-papel text-grafite shadow-[0_0_0_1px_var(--color-linha)]' : 'text-regua hover:text-grafite'}`}
            >
              {a.nome}
            </Link>
          ))}
        </nav>
      )}

      {ff.meses.length === 0 ? (
        <p className="rounded-medio border border-linha bg-papel p-4 text-regua">
          Para distribuir o custo pelos meses, as tarefas precisam de custo e de datas.{' '}
          <Link href={`/projetos/${id}/cronograma`} className="font-semibold text-cianotipia underline underline-offset-4">
            Abrir o cronograma
          </Link>
        </p>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <div className="rounded-medio border border-linha bg-papel p-4">
              <p className="text-sm font-semibold text-regua">Total distribuído</p>
              <p className="numeros mt-1 text-xl font-semibold">{formatarMoeda(ff.total, { compacta: true })}</p>
            </div>
            <div className="rounded-medio border border-linha bg-papel p-4">
              <p className="text-sm font-semibold text-regua">Meses</p>
              <p className="numeros mt-1 text-xl font-semibold">{ff.meses.length}</p>
            </div>
            <div className="rounded-medio border border-linha bg-papel p-4">
              <p className="text-sm font-semibold text-regua">Mês de maior desembolso</p>
              <p className="numeros mt-1 text-xl font-semibold">
                {rotuloMes(ff.meses[ff.porMes.indexOf(Math.max(...ff.porMes))]!)}
              </p>
              <p className="numeros text-sm text-regua">{formatarMoeda(Math.max(...ff.porMes), { compacta: true })}</p>
            </div>
            {ff.semDatas > 0 && (
              <div className="rounded-medio border border-marcador/40 bg-marcador-claro p-4">
                <p className="text-sm font-semibold text-marcador">Sem datas (fora da tabela)</p>
                <p className="numeros mt-1 text-xl font-semibold text-marcador">{formatarMoeda(ff.semDatas, { compacta: true })}</p>
              </div>
            )}
          </div>

          <div className="overflow-x-auto rounded-medio border border-linha bg-papel">
            <table className="numeros w-full min-w-max text-sm">
              <caption className="sr-only">Custo por mês de cada item da EAP</caption>
              <thead className="bg-concreto">
                <tr>
                  <th scope="col" className="sticky left-0 z-10 bg-concreto px-3 py-2 text-left font-semibold">
                    Item
                  </th>
                  {ff.meses.map((m) => (
                    <th key={m} scope="col" className="px-3 py-2 text-right font-semibold whitespace-nowrap">
                      {rotuloMes(m)}
                    </th>
                  ))}
                  <th scope="col" className="px-3 py-2 text-right font-semibold">
                    Total
                  </th>
                </tr>
              </thead>
              <tbody>
                {linhas.map((l) => (
                  <tr key={l.id} className={`border-t border-linha ${l.tipo === 'etapa' ? 'bg-concreto/40 font-semibold' : ''}`}>
                    <th scope="row" className="sticky left-0 z-10 max-w-64 truncate bg-inherit px-3 py-1.5 text-left font-[inherit]" style={{ paddingLeft: `${12 + Math.min(l.nivel - 1, 5) * 14}px`, backgroundColor: 'var(--color-papel)' }}>
                      <span className="text-regua">{l.codigo}</span> {l.nome}
                    </th>
                    {l.valores.map((v, i) => (
                      <td key={i} className={`px-3 py-1.5 text-right ${v === 0 ? 'text-linha' : ''}`}>
                        {v === 0 ? '·' : formatarMoeda(v, { compacta: true })}
                      </td>
                    ))}
                    <td className="px-3 py-1.5 text-right font-semibold">{formatarMoeda(l.total, { compacta: true })}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot className="border-t-2 border-grafite/20">
                <tr className="font-semibold">
                  <th scope="row" className="sticky left-0 bg-papel px-3 py-2 text-left">
                    Total do mês
                  </th>
                  {ff.porMes.map((v, i) => (
                    <td key={i} className="px-3 py-2 text-right">
                      {formatarMoeda(v, { compacta: true })}
                    </td>
                  ))}
                  <td className="px-3 py-2 text-right">{formatarMoeda(ff.total, { compacta: true })}</td>
                </tr>
                <tr className="border-t border-linha text-regua">
                  <th scope="row" className="sticky left-0 bg-papel px-3 py-2 text-left font-normal">
                    Acumulado
                  </th>
                  {ff.acumulado.map((v, i) => (
                    <td key={i} className="px-3 py-2 text-right">
                      {formatarMoeda(v, { compacta: true })} <span className="text-xs">({Math.round((v / ff.total) * 100)}%)</span>
                    </td>
                  ))}
                  <td />
                </tr>
              </tfoot>
            </table>
          </div>
        </>
      )}
    </div>
  );
}
