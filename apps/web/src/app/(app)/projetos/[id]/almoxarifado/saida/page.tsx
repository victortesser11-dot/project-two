import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { formatarData, formatarMoeda, formatarQuantidade, hojeIso, itensComSaldo } from '@obras/shared';
import { buscarEap, buscarProjeto, listarEquipeProjeto, listarItensEstoque, listarMovimentos, listarSaldos, podeMovimentarEstoque } from '@/lib/dados';
import { tarefasDoDia } from '../../hoje/selecao';
import { TopoAlmoxarifado } from '../NavAlmoxarifado';
import { FormularioSaida, type GruposTarefas } from './FormularioSaida';

export const metadata: Metadata = { title: 'Saída de material' };

export default async function PaginaSaida({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ item?: string }> }) {
  const { id } = await params;
  const { item } = await searchParams;
  const dados = await buscarProjeto(id);
  if (!dados) notFound();
  const { projeto, papel } = dados;
  const hoje = hojeIso();

  const [itens, saldos, eap, equipe, movimentos, podeMovimentar] = await Promise.all([
    listarItensEstoque(projeto.empresa_id),
    listarSaldos(id),
    buscarEap(id),
    listarEquipeProjeto(id),
    listarMovimentos(id, 300),
    podeMovimentarEstoque(projeto, papel),
  ]);
  const materiais = itensComSaldo(
    itens.filter((i) => i.tipo === 'material' && i.ativo),
    saldos,
  )
    .filter((i) => i.quantidade > 0)
    .sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));

  const dia = tarefasDoDia(eap, hoje);
  const destaque = new Set([...dia.emAndamento, ...dia.atrasadas, ...dia.proximas].map((t) => t.id));
  const grupos: GruposTarefas[] = [
    { rotulo: 'Em andamento hoje', tarefas: dia.emAndamento },
    { rotulo: 'Atrasadas', tarefas: dia.atrasadas },
    { rotulo: 'Começam nos próximos dias', tarefas: dia.proximas },
    { rotulo: 'Outras tarefas', tarefas: eap.filter((t) => t.tipo === 'tarefa' && !destaque.has(t.id)) },
  ];
  const tarefas = eap.filter((t) => t.tipo === 'tarefa');
  const nomeTarefa = new Map(tarefas.map((t) => [t.id, `${t.codigo} ${t.nome}`]));
  const porItem = new Map(itens.map((i) => [i.id, i]));
  const pessoa = new Map(equipe.map((p) => [p.id, p.nome]));
  const saidas = movimentos.filter((m) => m.tipo === 'saida').slice(0, 12);

  return (
    <div className="flex flex-col gap-6">
      <TopoAlmoxarifado
        projetoId={id}
        ativa="saida"
        titulo="Saída de material"
        descricao="Toda saída vai para uma tarefa: é assim que o custo de material chega ao orçado × realizado. Sai pelo custo médio da obra."
      />
      {!podeMovimentar ? (
        <p className="rounded-medio border border-linha bg-papel p-4 text-regua">Só o engenheiro e o almoxarife da obra registram saídas.</p>
      ) : tarefas.length === 0 ? (
        <p className="rounded-medio border border-linha bg-papel p-4 text-regua">
          A obra ainda não tem tarefas. Monte a EAP no{' '}
          <Link href={`/projetos/${id}/cronograma`} className="font-semibold text-cianotipia underline underline-offset-4">
            cronograma
          </Link>{' '}
          para registrar saídas.
        </p>
      ) : materiais.length === 0 ? (
        <p className="rounded-medio border border-linha bg-papel p-4 text-regua">
          Nenhum material com saldo nesta obra.{' '}
          <Link href={`/projetos/${id}/almoxarifado/entrada`} className="font-semibold text-cianotipia underline underline-offset-4">
            Dar entrada
          </Link>
        </p>
      ) : (
        <section className="rounded-medio border border-linha bg-papel p-4 sm:p-5">
          <FormularioSaida projetoId={id} materiais={materiais} grupos={grupos} equipe={equipe.filter((p) => p.na_obra)} hoje={hoje} itemInicial={item} />
        </section>
      )}

      {saidas.length > 0 && (
        <section aria-labelledby="titulo-ultimas-saidas" className="rounded-medio border border-linha bg-papel">
          <h3 id="titulo-ultimas-saidas" className="border-b border-linha px-4 py-3 text-base font-semibold sm:px-5">
            Últimas saídas
          </h3>
          <ul className="divide-y divide-linha text-sm">
            {saidas.map((m) => {
              const it = porItem.get(m.item_id);
              const quem = m.trabalhador_id ? pessoa.get(m.trabalhador_id) : m.responsavel;
              return (
                <li key={m.id} className="flex justify-between gap-3 px-4 py-2.5 sm:px-5">
                  <span className="min-w-0">
                    <span className="block truncate font-semibold">{it?.nome ?? 'Item removido'}</span>
                    <span className="numeros block truncate text-regua">
                      {formatarData(m.data)} · {m.tarefa_id ? (nomeTarefa.get(m.tarefa_id) ?? 'Tarefa removida') : 'Sem tarefa'}
                      {quem ? ` · ${quem}` : ''}
                    </span>
                  </span>
                  <span className="numeros shrink-0 text-right">
                    <span className="block font-semibold">{formatarQuantidade(m.quantidade, it?.unidade)}</span>
                    <span className="text-regua">{formatarMoeda(m.valor_total)}</span>
                  </span>
                </li>
              );
            })}
          </ul>
        </section>
      )}
    </div>
  );
}
