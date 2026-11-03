import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import {
  formatarData,
  formatarMoeda,
  hojeIso,
  previstoMedidoMensal,
  resumoContrato,
  rotuloMes,
  ROTULO_CRITERIO_MEDICAO,
  situacaoPagamento,
} from '@obras/shared';
import {
  buscarEap,
  buscarProjeto,
  listarContratosMedicao,
  listarEmpreiteiras,
  listarItensContrato,
  listarItensMedidos,
  listarMedicoes,
  podeFinanceiro,
} from '@/lib/dados';
import { TopoOrcamento } from '../NavOrcamento';
import { fmtQtd, SeloSituacao } from './Selo';
import { FormularioAtualizarContrato, FormularioContrato, FormularioGerarMedicao, FormularioItem, RemoverItem, type EtapaOpcao } from './Medicoes';

export const metadata: Metadata = { title: 'Medições' };

export default async function PaginaMedicoes({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ contrato?: string }> }) {
  const { id } = await params;
  const { contrato: contratoPedido } = await searchParams;
  const dados = await buscarProjeto(id);
  if (!dados) notFound();
  const { projeto, papel } = dados;
  const financeiro = await podeFinanceiro(projeto, papel);
  const topo = (
    <TopoOrcamento
      projetoId={id}
      ativa="medicoes"
      financeiro={financeiro}
      titulo="Medições"
      descricao="Quanto o cliente paga (e quanto se paga às empreiteiras) pelo que foi executado: preço por unidade, boletim mensal gerado pelo avanço apontado, aprovação do engenheiro e pagamento."
    />
  );
  if (!financeiro) {
    return (
      <div className="flex flex-col gap-6">
        {topo}
        <p className="rounded-medio border border-linha bg-papel p-4 text-regua">Só o engenheiro, o financeiro e o admin veem as medições.</p>
      </div>
    );
  }

  const [eap, contratos, itens, medicoes, medidos, empreiteiras] = await Promise.all([
    buscarEap(id),
    listarContratosMedicao(id),
    listarItensContrato(id),
    listarMedicoes(id),
    listarItensMedidos(id),
    listarEmpreiteiras(projeto.empresa_id),
  ]);
  const hoje = hojeIso();
  const tarefas = eap.filter((i) => i.tipo === 'tarefa');
  const porId = new Map(eap.map((i) => [i.id, i]));
  // Etapas de primeiro nível com as tarefas de dentro (para escolher a empreitada).
  const etapas: EtapaOpcao[] = eap
    .filter((i) => i.tipo === 'etapa' && i.nivel === 1)
    .map((et) => ({
      codigo: et.codigo,
      nome: et.nome,
      tarefas: tarefas.filter((t) => t.codigo.startsWith(`${et.codigo}.`)).map((t) => t.id),
    }))
    .filter((et) => et.tarefas.length > 0);
  const temCliente = contratos.some((c) => c.parte === 'cliente');

  if (tarefas.length === 0) {
    return (
      <div className="flex flex-col gap-6">
        {topo}
        <p className="rounded-medio border border-linha bg-papel p-4 text-regua">Monte a EAP antes: cada item medido é uma tarefa do cronograma.</p>
      </div>
    );
  }

  if (contratos.length === 0) {
    return (
      <div className="flex flex-col gap-6">
        {topo}
        <section className="rounded-medio border border-linha bg-papel p-4 sm:p-5" aria-labelledby="titulo-novo-contrato">
          <h3 id="titulo-novo-contrato" className="text-base font-semibold">
            Comece pelo contrato com o cliente
          </h3>
          <p className="mt-1 mb-5 max-w-3xl text-regua">
            Cada tarefa da EAP vira um item com critério de medição e preço unitário. Todo mês, o boletim sugere o que foi executado desde a última
            medição; o banco não deixa medir mais do que o avanço apontado. Aprovado pelo engenheiro, o valor fica liberado com o vencimento.
          </p>
          <FormularioContrato projetoId={id} temCliente={false} empreiteiras={empreiteiras} etapas={etapas} />
        </section>
      </div>
    );
  }

  const contrato = contratos.find((c) => c.id === contratoPedido) ?? contratos[0]!;
  const itensC = itens.filter((i) => i.contrato_id === contrato.id);
  const medC = medicoes.filter((m) => m.contrato_id === contrato.id).sort((a, b) => b.numero - a.numero);
  const idsMed = new Set(medC.map((m) => m.id));
  const medidosC = medidos.filter((mi) => idsMed.has(mi.medicao_id));
  const resumo = resumoContrato(itensC, medC, medidosC);
  const datas = new Map(tarefas.map((t) => [t.id, { inicio: t.inicio_base ?? t.inicio_previsto, fim: t.fim_base ?? t.fim_previsto }]));
  const { linhas, semDatas } = previstoMedidoMensal(itensC, datas, medC);
  const maxMes = Math.max(1, ...linhas.map((l) => Math.max(l.previsto, l.medido)));
  const rascunho = medC.find((m) => m.status === 'rascunho');
  const ultimoFim = medC.find((m) => m.status !== 'rascunho')?.fim ?? null;
  const cliente = contrato.parte === 'cliente';
  const noContrato = new Set(itensC.map((i) => i.tarefa_id));
  const foraDoContrato = tarefas
    .filter((t) => !noContrato.has(t.id))
    .map((t) => ({ id: t.id, codigo: t.codigo, nome: t.nome, unidade: t.unidade, quantidade: t.quantidade, custo: t.custo_previsto }));
  const itensOrdenados = [...itensC].sort((a, b) => (porId.get(a.tarefa_id)?.posicao ?? 0) - (porId.get(b.tarefa_id)?.posicao ?? 0));

  const numeros: { rotulo: string; valor: string; detalhe?: string; destaque?: boolean }[] = [
    { rotulo: 'Contratado', valor: formatarMoeda(resumo.contratado), detalhe: `${itensC.length} itens` },
    { rotulo: 'Medido', valor: formatarMoeda(resumo.medido), detalhe: `${resumo.percentualMedido.toLocaleString('pt-BR')}% do contrato` },
    { rotulo: cliente ? 'Recebido' : 'Pago', valor: formatarMoeda(resumo.pago) },
    { rotulo: cliente ? 'Liberado para receber' : 'Liberado para pagar', valor: formatarMoeda(resumo.aPagar), destaque: resumo.aPagar > 0 },
    { rotulo: 'Retido', valor: formatarMoeda(resumo.retido), detalhe: `${contrato.retencao_pct.toLocaleString('pt-BR')}% de cada medição` },
  ];

  return (
    <div className="flex flex-col gap-6">
      {topo}

      <nav aria-label="Contratos de medição" className="flex flex-wrap gap-2">
        {contratos.map((c) => (
          <Link
            key={c.id}
            href={`/projetos/${id}/orcamento/medicoes?contrato=${c.id}`}
            aria-current={c.id === contrato.id ? 'page' : undefined}
            className={`flex min-h-11 items-center rounded-medio border px-4 text-sm ${
              c.id === contrato.id ? 'border-cianotipia bg-cianotipia-claro font-semibold text-cianotipia' : 'border-linha bg-papel hover:border-campo'
            }`}
          >
            {c.parte === 'cliente' ? 'Cliente: ' : 'Empreiteira: '}
            {c.nome}
          </Link>
        ))}
      </nav>

      <dl className="numeros grid grid-cols-2 gap-px overflow-hidden rounded-medio border border-linha bg-linha text-sm lg:grid-cols-5">
        {numeros.map((n) => (
          <div key={n.rotulo} className="bg-papel px-4 py-3">
            <dt className="text-regua">{n.rotulo}</dt>
            <dd className={`mt-0.5 text-lg font-semibold ${n.destaque ? 'text-cianotipia' : ''}`}>{n.valor}</dd>
            {n.detalhe && <dd className="text-xs text-regua">{n.detalhe}</dd>}
          </div>
        ))}
      </dl>

      <section aria-labelledby="titulo-boletins" className="rounded-medio border border-linha bg-papel">
        <div className="flex flex-col gap-4 border-b border-linha px-4 py-4 sm:px-5">
          <h3 id="titulo-boletins" className="text-base font-semibold">
            Boletins de medição
          </h3>
          {rascunho ? (
            <p className="text-sm">
              A medição nº {rascunho.numero} ({formatarData(rascunho.inicio)} a {formatarData(rascunho.fim)}) está em rascunho.{' '}
              <Link href={`/projetos/${id}/orcamento/medicoes/${rascunho.id}`} className="font-semibold text-cianotipia hover:underline underline-offset-4">
                Continuar a medição
              </Link>
            </p>
          ) : (
            <FormularioGerarMedicao projetoId={id} contratoId={contrato.id} padrao={hoje} minimo={ultimoFim} />
          )}
        </div>
        {medC.length === 0 ? (
          <p className="px-4 py-4 text-sm text-regua sm:px-5">Nenhuma medição ainda.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="numeros w-full min-w-[640px] text-left text-sm">
              <thead className="bg-concreto">
                <tr>
                  <th className="px-4 py-2 font-semibold sm:px-5">Nº</th>
                  <th className="px-3 py-2 font-semibold">Período</th>
                  <th className="px-3 py-2 text-right font-semibold">Bruto</th>
                  <th className="px-3 py-2 text-right font-semibold">Líquido</th>
                  <th className="px-3 py-2 font-semibold">Situação</th>
                  <th className="px-3 py-2 font-semibold">Vencimento</th>
                </tr>
              </thead>
              <tbody>
                {medC.map((m) => (
                  <tr key={m.id} className="border-t border-linha">
                    <td className="px-4 py-2.5 sm:px-5">
                      <Link href={`/projetos/${id}/orcamento/medicoes/${m.id}`} className="font-semibold text-cianotipia hover:underline underline-offset-4">
                        Medição {m.numero}
                      </Link>
                    </td>
                    <td className="px-3 py-2.5">
                      {formatarData(m.inicio)} a {formatarData(m.fim)}
                    </td>
                    <td className="px-3 py-2.5 text-right">{formatarMoeda(m.valor_bruto)}</td>
                    <td className="px-3 py-2.5 text-right font-semibold">{formatarMoeda(m.valor_liquido)}</td>
                    <td className="px-3 py-2.5">
                      <SeloSituacao situacao={situacaoPagamento(m, hoje)} parte={contrato.parte} />
                    </td>
                    <td className="px-3 py-2.5">{m.pago_em ? `pago em ${formatarData(m.pago_em)}` : m.vencimento ? formatarData(m.vencimento) : '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <section aria-labelledby="titulo-previsto-medido" className="rounded-medio border border-linha bg-papel">
        <div className="border-b border-linha px-4 py-3 sm:px-5">
          <h3 id="titulo-previsto-medido" className="text-base font-semibold">
            Físico-financeiro: previsto × medido
          </h3>
          <p className="mt-1 text-sm text-regua">
            Previsto: o valor de cada item distribuído pelos dias da tarefa ({tarefas.some((t) => t.inicio_base) ? 'linha de base' : 'cronograma previsto'}).
            Medido: boletins aprovados, no mês do fim do período. {cliente ? 'Recebido' : 'Pago'}: no mês do pagamento.
            {semDatas > 0 && ` ${formatarMoeda(semDatas)} em itens sem datas ficam fora da distribuição.`}
          </p>
        </div>
        {linhas.length === 0 ? (
          <p className="px-4 py-4 text-sm text-regua sm:px-5">As tarefas do contrato ainda não têm datas.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="numeros w-full min-w-[720px] text-left text-sm">
              <thead className="bg-concreto">
                <tr>
                  <th className="px-4 py-2 font-semibold sm:px-5">Mês</th>
                  <th className="px-3 py-2 font-semibold">Previsto × medido</th>
                  <th className="px-3 py-2 text-right font-semibold">Previsto</th>
                  <th className="px-3 py-2 text-right font-semibold">Medido</th>
                  <th className="px-3 py-2 text-right font-semibold">Acumulado previsto</th>
                  <th className="px-3 py-2 text-right font-semibold">Acumulado medido</th>
                  <th className="px-3 py-2 text-right font-semibold">{cliente ? 'Recebido' : 'Pago'}</th>
                </tr>
              </thead>
              <tbody>
                {linhas.map((l) => {
                  const atual = l.mes === hoje.slice(0, 7);
                  return (
                    <tr key={l.mes} className={`border-t border-linha ${atual ? 'bg-cianotipia-claro/50' : ''}`}>
                      <td className="px-4 py-2 sm:px-5">
                        {rotuloMes(l.mes)}
                        {atual && <span className="ml-1 text-xs text-regua">(atual)</span>}
                      </td>
                      <td className="w-48 px-3 py-2" aria-hidden>
                        <div className="flex flex-col gap-1">
                          <div className="h-2 rounded-full bg-[#878d96]/50" style={{ width: `${(l.previsto / maxMes) * 100}%` }} />
                          <div className="h-2 rounded-full bg-cianotipia" style={{ width: `${(l.medido / maxMes) * 100}%` }} />
                        </div>
                      </td>
                      <td className="px-3 py-2 text-right">{formatarMoeda(l.previsto)}</td>
                      <td className="px-3 py-2 text-right font-semibold">{l.medido > 0 ? formatarMoeda(l.medido) : '—'}</td>
                      <td className="px-3 py-2 text-right text-regua">{formatarMoeda(l.previstoAcumulado)}</td>
                      <td className={`px-3 py-2 text-right ${l.medidoAcumulado < l.previstoAcumulado && l.mes <= hoje.slice(0, 7) ? 'text-atencao' : ''}`}>
                        {formatarMoeda(l.medidoAcumulado)}
                      </td>
                      <td className="px-3 py-2 text-right">{l.pago > 0 ? formatarMoeda(l.pago) : '—'}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            <p className="flex flex-wrap gap-x-5 gap-y-1 px-4 py-3 text-xs text-regua sm:px-5">
              <span className="flex items-center gap-2">
                <span className="inline-block h-2 w-5 rounded-full bg-[#878d96]/50" aria-hidden /> Previsto no mês
              </span>
              <span className="flex items-center gap-2">
                <span className="inline-block h-2 w-5 rounded-full bg-cianotipia" aria-hidden /> Medido no mês
              </span>
              <span>Acumulado medido em laranja: abaixo do previsto até o mês.</span>
            </p>
          </div>
        )}
      </section>

      <details className="rounded-medio border border-linha bg-papel">
        <summary className="flex min-h-11 cursor-pointer items-center px-4 font-semibold sm:px-5">
          Itens do contrato ({itensC.length}) · {formatarMoeda(resumo.contratado)}
        </summary>
        <div className="overflow-x-auto border-t border-linha">
          <table className="numeros w-full min-w-[760px] text-left text-sm">
            <thead className="bg-concreto">
              <tr>
                <th className="px-4 py-2 font-semibold sm:px-5">Tarefa</th>
                <th className="px-3 py-2 font-semibold">Critério</th>
                <th className="px-3 py-2 text-right font-semibold">Contratado</th>
                <th className="px-3 py-2 text-right font-semibold">Preço unitário</th>
                <th className="px-3 py-2 text-right font-semibold">Valor</th>
                <th className="px-3 py-2 text-right font-semibold">Medido</th>
              </tr>
            </thead>
            <tbody>
              {itensOrdenados.map((i) => {
                const t = porId.get(i.tarefa_id);
                const medido = resumo.medidoPorItem.get(i.id) ?? 0;
                return (
                  <tr key={i.id} className="border-t border-linha align-top">
                    <td className="px-4 py-2 sm:px-5">
                      <details>
                        <summary className="cursor-pointer">
                          <span className="text-regua">{t?.codigo}</span> {t?.nome ?? 'Tarefa removida'}
                        </summary>
                        <div className="mt-3 flex flex-col gap-3 pb-2">
                          <FormularioItem projetoId={id} contratoId={contrato.id} item={i} />
                          {medido === 0 && <RemoverItem projetoId={id} itemId={i.id} nome={t?.nome ?? 'item'} />}
                        </div>
                      </details>
                    </td>
                    <td className="px-3 py-2 text-regua">{i.criterio === 'percentual' ? '%' : ROTULO_CRITERIO_MEDICAO[i.criterio].split(' (')[0]}</td>
                    <td className="px-3 py-2 text-right">
                      {fmtQtd(i.quantidade)} {i.unidade}
                    </td>
                    <td className="px-3 py-2 text-right">{formatarMoeda(i.preco_unitario)}</td>
                    <td className="px-3 py-2 text-right font-semibold">{formatarMoeda(i.valor_total)}</td>
                    <td className="px-3 py-2 text-right">
                      {medido > 0 ? `${fmtQtd(medido)} ${i.unidade} (${Math.round((medido / i.quantidade) * 100)}%)` : '—'}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {foraDoContrato.length > 0 && (
          <div className="border-t border-linha px-4 py-4 sm:px-5">
            <h4 className="mb-3 text-sm font-semibold">Acrescentar tarefa ao contrato</h4>
            <FormularioItem projetoId={id} contratoId={contrato.id} tarefas={foraDoContrato} />
          </div>
        )}
      </details>

      <details className="rounded-medio border border-linha bg-papel">
        <summary className="flex min-h-11 cursor-pointer items-center px-4 font-semibold sm:px-5">Dados do contrato</summary>
        <div className="border-t border-linha px-4 py-4 sm:px-5">
          {cliente && contrato.bdi_pct > 0 && (
            <p className="mb-4 text-sm text-regua">
              Preços gerados com BDI de {contrato.bdi_pct.toLocaleString('pt-BR')}% sobre o custo. Para mudar um preço, ajuste o item.
            </p>
          )}
          <FormularioAtualizarContrato projetoId={id} contrato={contrato} />
        </div>
      </details>

      <details className="rounded-medio border border-linha bg-papel">
        <summary className="flex min-h-11 cursor-pointer items-center px-4 font-semibold sm:px-5">
          {temCliente ? 'Novo contrato com empreiteira' : 'Novo contrato de medição'}
        </summary>
        <div className="border-t border-linha px-4 py-4 sm:px-5">
          <FormularioContrato projetoId={id} temCliente={temCliente} empreiteiras={empreiteiras} etapas={etapas} />
        </div>
      </details>
    </div>
  );
}
