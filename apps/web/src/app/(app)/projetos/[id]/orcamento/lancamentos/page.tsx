import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { formatarMoeda } from '@obras/shared';
import { buscarEap, buscarProjeto, listarCompromissos, listarDespesas, listarEmpreiteiras, podeFinanceiro } from '@/lib/dados';
import { TopoOrcamento } from '../NavOrcamento';
import { FormularioCompromisso, FormularioDespesa, ListaCompromissos, ListaDespesas } from './Lancamentos';

export const metadata: Metadata = { title: 'Despesas e contratos' };

export default async function PaginaLancamentos({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const dados = await buscarProjeto(id);
  if (!dados) notFound();
  const { projeto, papel } = dados;
  const financeiro = await podeFinanceiro(projeto, papel);
  const topo = (
    <TopoOrcamento
      projetoId={id}
      ativa="lancamentos"
      financeiro={financeiro}
      titulo="Despesas e contratos"
      descricao="Despesas que não passam pelo almoxarifado nem pela chamada (aluguel de equipamento, frete, taxas, serviços) e os contratos e pedidos que formam o comprometido."
    />
  );
  if (!financeiro) {
    return (
      <div className="flex flex-col gap-6">
        {topo}
        <p className="rounded-medio border border-linha bg-papel p-4 text-regua">Só o engenheiro, o financeiro e o admin lançam despesas e contratos.</p>
      </div>
    );
  }
  const [itens, despesas, compromissos, empreiteiras] = await Promise.all([
    buscarEap(id),
    listarDespesas(id),
    listarCompromissos(id),
    listarEmpreiteiras(projeto.empresa_id),
  ]);
  const tarefas = itens.filter((i) => i.tipo === 'tarefa').map((t) => ({ id: t.id, codigo: t.codigo, nome: t.nome }));
  const nomeTarefa = Object.fromEntries(tarefas.map((t) => [t.id, `${t.codigo} ${t.nome}`]));
  const pagoPor: Record<string, number> = {};
  for (const d of despesas) if (d.compromisso_id) pagoPor[d.compromisso_id] = (pagoPor[d.compromisso_id] ?? 0) + d.valor;
  const totalDespesas = despesas.reduce((s, d) => s + d.valor, 0);
  const abertos = compromissos.filter((c) => !c.encerrado).reduce((s, c) => s + c.valor, 0);

  return (
    <div className="flex flex-col gap-6">
      {topo}
      {tarefas.length === 0 ? (
        <p className="rounded-medio border border-linha bg-papel p-4 text-regua">Monte a EAP antes: toda despesa e todo contrato vão para uma tarefa.</p>
      ) : (
        <div className="grid gap-6 lg:grid-cols-2 lg:items-start">
          <div className="flex flex-col gap-6">
            <section aria-labelledby="titulo-nova-despesa" className="rounded-medio border border-linha bg-papel p-4 sm:p-5">
              <h3 id="titulo-nova-despesa" className="mb-4 text-base font-semibold">
                Lançar despesa
              </h3>
              <FormularioDespesa projetoId={id} tarefas={tarefas} compromissos={compromissos} />
            </section>
            <section aria-labelledby="titulo-despesas" className="rounded-medio border border-linha bg-papel">
              <div className="flex items-baseline justify-between gap-3 border-b border-linha px-4 py-3 sm:px-5">
                <h3 id="titulo-despesas" className="text-base font-semibold">
                  Despesas
                </h3>
                <span className="numeros text-sm text-regua">{formatarMoeda(totalDespesas)}</span>
              </div>
              <ListaDespesas projetoId={id} despesas={despesas} nomeTarefa={nomeTarefa} />
            </section>
          </div>
          <div className="flex flex-col gap-6">
            <section aria-labelledby="titulo-novo-compromisso" className="rounded-medio border border-linha bg-papel p-4 sm:p-5">
              <h3 id="titulo-novo-compromisso" className="mb-4 text-base font-semibold">
                Lançar contrato ou pedido
              </h3>
              <FormularioCompromisso projetoId={id} tarefas={tarefas} empreiteiras={empreiteiras} />
            </section>
            <section aria-labelledby="titulo-compromissos" className="rounded-medio border border-linha bg-papel">
              <div className="flex items-baseline justify-between gap-3 border-b border-linha px-4 py-3 sm:px-5">
                <h3 id="titulo-compromissos" className="text-base font-semibold">
                  Contratos e pedidos
                </h3>
                <span className="numeros text-sm text-regua">{formatarMoeda(abertos)} em aberto</span>
              </div>
              <ListaCompromissos projetoId={id} compromissos={compromissos} pagoPor={pagoPor} nomeTarefa={nomeTarefa} />
            </section>
          </div>
        </div>
      )}
    </div>
  );
}
