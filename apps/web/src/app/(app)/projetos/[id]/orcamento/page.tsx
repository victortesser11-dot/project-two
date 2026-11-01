import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { formatarData, formatarMoeda, somarNaArvore, dataDoInstante } from '@obras/shared';
import { buscarEap, buscarProjeto, listarComposicoes, listarVersoesOrcamento, podeEditarProjeto, podeFinanceiro } from '@/lib/dados';
import { ArvoreOrcamento, type LinhaArvore } from './ArvoreOrcamento';
import { FormularioVersao } from './Formularios';
import { TopoOrcamento } from './NavOrcamento';

export const metadata: Metadata = { title: 'Orçamento' };

export default async function PaginaOrcamento({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ versao?: string }> }) {
  const { id } = await params;
  const { versao: versaoId } = await searchParams;
  const dados = await buscarProjeto(id);
  if (!dados) notFound();
  const { projeto, papel } = dados;
  const [itens, composicoes, versoes, podeEditar, financeiro] = await Promise.all([
    buscarEap(id),
    listarComposicoes(id),
    listarVersoesOrcamento(id),
    podeEditarProjeto(projeto, papel),
    podeFinanceiro(projeto, papel),
  ]);

  const tarefas = itens.filter((i) => i.tipo === 'tarefa');
  const previsto = tarefas.reduce((s, t) => s + Number(t.custo_previsto ?? 0), 0);
  const orcamento = projeto.orcamento_total === null ? null : Number(projeto.orcamento_total);
  const porTarefa = new Map(composicoes.map((c) => [c.tarefa_id, c]));
  const somas = somarNaArvore(
    itens,
    new Map(composicoes.map((c) => [c.tarefa_id, { material: c.material, mao_obra: c.mao_obra, equipamento: c.equipamento, outros: c.outros }])),
  );
  const totalComp = composicoes.reduce(
    (s, c) => ({ material: s.material + c.material, mao_obra: s.mao_obra + c.mao_obra, equipamento: s.equipamento + c.equipamento, outros: s.outros + c.outros }),
    { material: 0, mao_obra: 0, equipamento: 0, outros: 0 },
  );
  const composto = totalComp.material + totalComp.mao_obra + totalComp.equipamento + totalComp.outros;
  const semComposicao = tarefas.filter((t) => !porTarefa.has(t.id) && Number(t.custo_previsto ?? 0) > 0);
  const valorSemComposicao = semComposicao.reduce((s, t) => s + Number(t.custo_previsto), 0);

  const versao = versoes.find((v) => v.id === versaoId) ?? null;
  const naVersao = new Map((versao?.itens ?? []).map((i) => [i.id, i.custo === null ? null : Number(i.custo)]));
  const linhas: LinhaArvore[] = itens.map((item) => ({
    item,
    composicao: porTarefa.get(item.id),
    somaComposicao: item.tipo === 'etapa' ? somas.get(item.id) : undefined,
    naVersao: versao ? (naVersao.get(item.id) ?? null) : undefined,
  }));
  const base = `/projetos/${id}/orcamento`;
  const pct = (v: number) => (composto > 0 ? `${Math.round((v / composto) * 100)}%` : '—');

  return (
    <div className="flex flex-col gap-6">
      <TopoOrcamento
        projetoId={id}
        ativa="orcamento"
        financeiro={financeiro}
        titulo="Orçamento"
        descricao="O custo previsto de cada tarefa, separado em material, mão de obra e equipamento, somando nas etapas. Guarde versões para comparar as revisões."
      />

      {tarefas.length === 0 ? (
        <p className="rounded-medio border border-linha bg-papel p-4 text-regua">
          A obra ainda não tem EAP.{' '}
          <Link href={`/projetos/${id}/cronograma`} className="font-semibold text-cianotipia underline underline-offset-4">
            Monte ou importe a EAP
          </Link>{' '}
          com os custos das tarefas.
        </p>
      ) : (
        <>
          <section aria-label="Resumo do orçamento" className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <div className="rounded-medio border border-linha bg-papel p-4">
              <h3 className="text-sm font-semibold text-regua">Previsto na EAP</h3>
              <p className="numeros mt-1 text-2xl font-semibold">{formatarMoeda(previsto, { compacta: true })}</p>
              <p className="numeros text-sm text-regua">
                {orcamento !== null ? (
                  <>
                    Orçamento da obra {formatarMoeda(orcamento, { compacta: true })}
                    {previsto > orcamento ? (
                      <span className="block font-semibold text-marcador">{formatarMoeda(previsto - orcamento, { compacta: true })} acima</span>
                    ) : (
                      <span className="block">{formatarMoeda(orcamento - previsto, { compacta: true })} de folga</span>
                    )}
                  </>
                ) : (
                  'Sem orçamento total na obra'
                )}
              </p>
            </div>
            <div className="rounded-medio border border-linha bg-papel p-4 lg:col-span-2">
              <h3 className="text-sm font-semibold text-regua">Composição do custo</h3>
              {composto > 0 ? (
                <dl className="numeros mt-2 grid grid-cols-2 gap-x-6 gap-y-1 text-sm sm:grid-cols-4">
                  {(
                    [
                      ['Material', totalComp.material],
                      ['Mão de obra', totalComp.mao_obra],
                      ['Equipamento', totalComp.equipamento],
                      ['Outros', totalComp.outros],
                    ] as const
                  ).map(([rotulo, v]) => (
                    <div key={rotulo}>
                      <dt className="text-regua">{rotulo}</dt>
                      <dd className="font-semibold">
                        {formatarMoeda(v, { compacta: true })} <span className="font-normal text-regua">{pct(v)}</span>
                      </dd>
                    </div>
                  ))}
                </dl>
              ) : (
                <p className="mt-1 text-sm text-regua">Nenhuma tarefa com o custo separado ainda. {podeEditar ? 'Toque numa tarefa abaixo para separar.' : ''}</p>
              )}
              {semComposicao.length > 0 && (
                <p className="numeros mt-2 text-sm text-regua">
                  {semComposicao.length} {semComposicao.length === 1 ? 'tarefa' : 'tarefas'} só com o total ({formatarMoeda(valorSemComposicao, { compacta: true })})
                </p>
              )}
            </div>
          </section>

          <section aria-labelledby="titulo-versoes" className="rounded-medio border border-linha bg-papel p-4 sm:p-5">
            <h3 id="titulo-versoes" className="text-base font-semibold">
              Versões do orçamento
            </h3>
            {versoes.length === 0 ? (
              <p className="mt-1 text-sm text-regua">Nenhuma versão guardada. Guarde a primeira quando o orçamento for aprovado.</p>
            ) : (
              <ul className="mt-3 flex flex-wrap gap-2">
                <li>
                  <Link
                    href={base}
                    aria-current={!versao ? 'page' : undefined}
                    className={`flex min-h-11 items-center rounded-full border px-4 text-sm font-semibold ${!versao ? 'border-cianotipia bg-cianotipia-claro text-cianotipia' : 'border-linha bg-papel text-regua hover:text-grafite'}`}
                  >
                    Sem comparar
                  </Link>
                </li>
                {versoes.map((v) => (
                  <li key={v.id}>
                    <Link
                      href={`${base}?versao=${v.id}`}
                      aria-current={versao?.id === v.id ? 'page' : undefined}
                      className={`numeros flex min-h-11 items-center rounded-full border px-4 text-sm font-semibold ${
                        versao?.id === v.id ? 'border-cianotipia bg-cianotipia-claro text-cianotipia' : 'border-linha bg-papel text-regua hover:text-grafite'
                      }`}
                    >
                      {v.nome} · {formatarData(dataDoInstante(v.criado_em))} · {formatarMoeda(v.total, { compacta: true })}
                    </Link>
                  </li>
                ))}
              </ul>
            )}
            {versao && (
              <p className="numeros mt-3 text-sm">
                Comparando com <span className="font-semibold">{versao.nome}</span>: hoje {formatarMoeda(previsto)} ×{' '}
                {formatarMoeda(versao.total)} na versão (
                <span className={previsto > versao.total ? 'font-semibold text-marcador' : 'font-semibold text-obra-ok'}>
                  {previsto >= versao.total ? '+' : '−'}
                  {formatarMoeda(Math.abs(previsto - versao.total))}
                </span>
                ).
              </p>
            )}
            {podeEditar && (
              <div className="mt-4">
                <FormularioVersao projetoId={id} />
              </div>
            )}
          </section>

          <ArvoreOrcamento projetoId={id} linhas={linhas} podeEditar={podeEditar} comparando={versao?.nome ?? null} />
        </>
      )}
    </div>
  );
}
