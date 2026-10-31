import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { formatarData, formatarMoeda, formatarQuantidade, ROTULO_MOVIMENTO, TIPOS_MOVIMENTO_ESTOQUE, type TipoMovimentoEstoque } from '@obras/shared';
import { buscarEap, buscarProjeto, listarEquipeProjeto, listarItensEstoque, listarMovimentos } from '@/lib/dados';
import { TopoAlmoxarifado } from '../NavAlmoxarifado';

export const metadata: Metadata = { title: 'Movimentos do almoxarifado' };

const LIMITE = 500;

export default async function PaginaMovimentos({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ tipo?: string }> }) {
  const { id } = await params;
  const { tipo: tipoBruto } = await searchParams;
  const tipo = TIPOS_MOVIMENTO_ESTOQUE.includes(tipoBruto as TipoMovimentoEstoque) ? (tipoBruto as TipoMovimentoEstoque) : null;
  const dados = await buscarProjeto(id);
  if (!dados) notFound();
  const { projeto } = dados;
  const [movimentos, itens, eap, equipe] = await Promise.all([listarMovimentos(id), listarItensEstoque(projeto.empresa_id), buscarEap(id), listarEquipeProjeto(id)]);
  const filtrados = (tipo ? movimentos.filter((m) => m.tipo === tipo) : movimentos).slice(0, LIMITE);
  const porItem = new Map(itens.map((i) => [i.id, i]));
  const nomeTarefa = new Map(eap.map((t) => [t.id, `${t.codigo} ${t.nome}`]));
  const pessoa = new Map(equipe.map((p) => [p.id, p.nome]));
  const base = `/projetos/${id}/almoxarifado/movimentos`;
  const total = filtrados.reduce((s, m) => s + m.valor_total, 0);

  return (
    <div className="flex flex-col gap-6">
      <TopoAlmoxarifado
        projetoId={id}
        ativa="movimentos"
        titulo="Movimentos"
        descricao="Tudo o que entrou, saiu ou foi ajustado nesta obra. Movimento não se edita: correção é um ajuste de inventário."
      />
      <nav aria-label="Filtrar por tipo" className="flex gap-2 overflow-x-auto">
        {[{ chave: null, nome: 'Todos' }, ...TIPOS_MOVIMENTO_ESTOQUE.map((t) => ({ chave: t, nome: `${ROTULO_MOVIMENTO[t]}s` }))].map((f) => (
          <Link
            key={f.chave ?? 'todos'}
            href={f.chave ? `${base}?tipo=${f.chave}` : base}
            aria-current={tipo === f.chave ? 'page' : undefined}
            className={`flex min-h-11 shrink-0 items-center rounded-full border px-4 text-sm font-semibold ${
              tipo === f.chave ? 'border-cianotipia bg-cianotipia-claro text-cianotipia' : 'border-linha bg-papel text-regua hover:text-grafite'
            }`}
          >
            {f.nome}
          </Link>
        ))}
      </nav>

      {filtrados.length === 0 ? (
        <p className="rounded-medio border border-linha bg-papel p-4 text-regua">Nenhum movimento {tipo ? 'desse tipo ' : ''}ainda.</p>
      ) : (
        <section aria-label="Lista de movimentos" className="rounded-medio border border-linha bg-papel">
          <ul className="divide-y divide-linha">
            {filtrados.map((m) => {
              const it = porItem.get(m.item_id);
              const quem = m.trabalhador_id ? pessoa.get(m.trabalhador_id) : m.responsavel;
              const detalhe =
                m.tipo === 'entrada'
                  ? [m.fornecedor, m.nota_fiscal && `NF ${m.nota_fiscal}`].filter(Boolean).join(' · ')
                  : m.tipo === 'saida'
                    ? [m.tarefa_id ? (nomeTarefa.get(m.tarefa_id) ?? 'Tarefa removida') : null, quem].filter(Boolean).join(' · ')
                    : m.observacao;
              const sinal = m.tipo === 'saida' || m.quantidade < 0 ? '−' : '+';
              return (
                <li key={m.id} className="grid grid-cols-[minmax(0,1fr)_auto] gap-x-4 gap-y-0.5 px-4 py-3 sm:grid-cols-[6rem_6rem_minmax(0,1fr)_9rem_8rem] sm:items-center sm:px-5">
                  <p className="numeros text-sm text-regua sm:order-none sm:text-base sm:text-grafite">{formatarData(m.data)}</p>
                  <p className="text-right text-sm font-semibold sm:text-left">
                    <span
                      className={`inline-flex rounded-full px-2.5 py-0.5 text-xs ${
                        m.tipo === 'entrada' ? 'bg-obra-ok/10 text-obra-ok' : m.tipo === 'saida' ? 'bg-cianotipia-claro text-cianotipia' : 'bg-marcador-claro text-marcador'
                      }`}
                    >
                      {ROTULO_MOVIMENTO[m.tipo]}
                    </span>
                  </p>
                  <div className="min-w-0">
                    <p className="truncate font-semibold">{it?.nome ?? 'Item removido'}</p>
                    {detalhe && <p className="truncate text-sm text-regua">{detalhe}</p>}
                  </div>
                  <p className="numeros text-right font-semibold">
                    {sinal}
                    {formatarQuantidade(Math.abs(m.quantidade), it?.unidade)}
                  </p>
                  <p className="numeros col-span-2 text-right text-sm text-regua sm:col-span-1 sm:text-base sm:text-grafite">
                    {formatarMoeda(m.valor_total)}
                    <span className="block text-xs text-regua">{formatarMoeda(m.valor_unitario)}/{it?.unidade ?? 'un'}</span>
                  </p>
                </li>
              );
            })}
          </ul>
          <p className="numeros border-t border-linha px-4 py-3 text-sm text-regua sm:px-5">
            {filtrados.length} {filtrados.length === 1 ? 'movimento' : 'movimentos'}
            {filtrados.length === LIMITE && ' (os mais recentes)'} · {formatarMoeda(total)}
          </p>
        </section>
      )}
    </div>
  );
}
