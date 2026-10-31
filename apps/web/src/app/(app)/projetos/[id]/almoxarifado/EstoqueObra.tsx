import Link from 'next/link';
import {
  formatarData,
  formatarMoeda,
  formatarQuantidade,
  itensComSaldo,
  resumoMaterial,
  ROTULO_MOVIMENTO,
  situacaoEmprestimo,
  type EmprestimoFerramenta,
  type ItemEap,
  type ItemEstoque,
  type MovimentoEstoque,
  type SaldoEstoque,
} from '@obras/shared';
import { classeLinkPrimario, classeLinkSecundario, TopoAlmoxarifado } from './NavAlmoxarifado';
import { ListaEstoque } from './ListaEstoque';

/** Estoque da obra com os dados prontos (a página busca; a prévia usa dados de exemplo). */
export function EstoqueObra({
  projetoId: id,
  itens,
  saldos,
  movimentos,
  emprestimos,
  eap,
  podeMovimentar,
  hoje,
}: {
  projetoId: string;
  itens: ItemEstoque[];
  saldos: SaldoEstoque[];
  movimentos: MovimentoEstoque[];
  emprestimos: EmprestimoFerramenta[];
  eap: Pick<ItemEap, 'id' | 'codigo' | 'nome'>[];
  podeMovimentar: boolean;
  hoje: string;
}) {
  const base = `/projetos/${id}/almoxarifado`;
  const materiais = itensComSaldo(
    itens.filter((i) => i.tipo === 'material'),
    saldos,
  ).filter((i) => i.ativo || i.quantidade > 0);
  const resumo = resumoMaterial(movimentos);
  const emEstoque = materiais.reduce((s, i) => s + i.valor, 0);
  const abaixo = materiais.filter((i) => i.abaixoDoMinimo);
  const atrasadas = emprestimos.filter((e) => situacaoEmprestimo(e, hoje).atrasado).length;
  const nomeItem = new Map(itens.map((i) => [i.id, i]));
  const nomeTarefa = new Map(eap.map((t) => [t.id, `${t.codigo} ${t.nome}`]));
  const porTarefa = [...resumo.porTarefa.entries()].sort((a, b) => b[1] - a[1]).slice(0, 8);
  const recentes = movimentos.slice(0, 6);

  const acoes = podeMovimentar ? (
    <>
      <Link href={`${base}/saida`} className={classeLinkPrimario}>
        Registrar saída
      </Link>
      <Link href={`${base}/entrada`} className={classeLinkSecundario}>
        Dar entrada
      </Link>
      <Link href={`${base}/inventario`} className={classeLinkSecundario}>
        Fazer inventário
      </Link>
    </>
  ) : undefined;

  return (
    <div className="flex flex-col gap-8">
      <TopoAlmoxarifado
        projetoId={id}
        ativa="estoque"
        titulo="Estoque da obra"
        descricao="Saldo e custo médio de cada material, o que já foi aplicado nas tarefas e as ferramentas que estão fora."
        acoes={acoes}
      />

      {itens.length === 0 ? (
        <section className="rounded-medio border border-linha bg-papel p-5">
          <h3 className="text-base font-semibold">O catálogo ainda está vazio</h3>
          <p className="mt-1 max-w-2xl text-regua">
            Cadastre os materiais e ferramentas da empresa ou suba o XML de uma NF-e: os itens da nota entram no catálogo e no estoque desta obra de uma vez.
          </p>
          {podeMovimentar && (
            <div className="mt-4 flex flex-wrap gap-2">
              <Link href={`${base}/entrada`} className={classeLinkPrimario}>
                Dar entrada com o XML da NF-e
              </Link>
              <Link href={`${base}/catalogo`} className={classeLinkSecundario}>
                Cadastrar no catálogo
              </Link>
            </div>
          )}
        </section>
      ) : (
        <>
          <section aria-label="Resumo do almoxarifado" className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <div className="rounded-medio border border-linha bg-papel p-4">
              <h3 className="text-sm font-semibold text-regua">Em estoque</h3>
              <p className="numeros mt-1 text-2xl font-semibold">{formatarMoeda(emEstoque, { compacta: true })}</p>
              <p className="numeros text-sm text-regua">{materiais.filter((i) => i.quantidade > 0).length} materiais com saldo</p>
            </div>
            <div className="rounded-medio border border-linha bg-papel p-4">
              <h3 className="text-sm font-semibold text-regua">Aplicado nas tarefas</h3>
              <p className="numeros mt-1 text-2xl font-semibold">{formatarMoeda(resumo.aplicado, { compacta: true })}</p>
              <p className="numeros text-sm text-regua">de {formatarMoeda(resumo.comprado, { compacta: true })} comprados</p>
            </div>
            <div className={`rounded-medio border p-4 ${abaixo.length > 0 ? 'border-marcador/40 bg-marcador-claro' : 'border-linha bg-papel'}`}>
              <h3 className={`text-sm font-semibold ${abaixo.length > 0 ? 'text-marcador' : 'text-regua'}`}>Abaixo do mínimo</h3>
              <p className={`numeros mt-1 text-2xl font-semibold ${abaixo.length > 0 ? 'text-marcador' : ''}`}>{abaixo.length}</p>
              <p className="text-sm text-regua">{abaixo.length > 0 ? 'Hora de pedir' : 'Tudo acima do mínimo'}</p>
            </div>
            <Link
              href={`${base}/ferramentas`}
              className={`rounded-medio border p-4 hover:border-grafite ${atrasadas > 0 ? 'border-marcador/40 bg-marcador-claro' : 'border-linha bg-papel'}`}
            >
              <h3 className={`text-sm font-semibold ${atrasadas > 0 ? 'text-marcador' : 'text-regua'}`}>Ferramentas fora</h3>
              <p className="numeros mt-1 text-2xl font-semibold">{emprestimos.length}</p>
              <p className={`text-sm ${atrasadas > 0 ? 'font-semibold text-marcador' : 'text-regua'}`}>
                {atrasadas > 0 ? `${atrasadas} com devolução atrasada` : 'Nenhuma atrasada'}
              </p>
            </Link>
          </section>

          {resumo.perdas > 0 && (
            <p className="numeros -mt-4 text-sm text-regua">
              Perdas no inventário: <span className="font-semibold text-marcador">{formatarMoeda(resumo.perdas)}</span>
              {resumo.sobras > 0 && <> · sobras encontradas: {formatarMoeda(resumo.sobras)}</>}
            </p>
          )}

          <ListaEstoque materiais={materiais} />

          <div className="grid gap-6 lg:grid-cols-2">
            <section aria-labelledby="titulo-por-tarefa" className="rounded-medio border border-linha bg-papel">
              <h3 id="titulo-por-tarefa" className="border-b border-linha px-4 py-3 text-base font-semibold sm:px-5">
                Material aplicado por tarefa
              </h3>
              {porTarefa.length === 0 ? (
                <p className="px-4 py-4 text-sm text-regua sm:px-5">Nenhuma saída registrada ainda.</p>
              ) : (
                <ul className="numeros divide-y divide-linha text-sm">
                  {porTarefa.map(([tarefa, valor]) => (
                    <li key={tarefa} className="flex justify-between gap-3 px-4 py-2.5 sm:px-5">
                      <span className="min-w-0 truncate">{nomeTarefa.get(tarefa) ?? 'Tarefa removida'}</span>
                      <span className="shrink-0 font-semibold">{formatarMoeda(valor)}</span>
                    </li>
                  ))}
                </ul>
              )}
            </section>
            <section aria-labelledby="titulo-recentes" className="rounded-medio border border-linha bg-papel">
              <div className="flex items-baseline justify-between gap-3 border-b border-linha px-4 py-3 sm:px-5">
                <h3 id="titulo-recentes" className="text-base font-semibold">
                  Últimos movimentos
                </h3>
                <Link href={`${base}/movimentos`} className="text-sm font-semibold text-cianotipia hover:underline underline-offset-4">
                  Ver todos
                </Link>
              </div>
              {recentes.length === 0 ? (
                <p className="px-4 py-4 text-sm text-regua sm:px-5">Nenhum movimento ainda.</p>
              ) : (
                <ul className="divide-y divide-linha text-sm">
                  {recentes.map((m) => {
                    const item = nomeItem.get(m.item_id);
                    return (
                      <li key={m.id} className="flex justify-between gap-3 px-4 py-2.5 sm:px-5">
                        <span className="min-w-0">
                          <span className="block truncate font-semibold">{item?.nome ?? 'Item removido'}</span>
                          <span className="numeros text-regua">
                            {formatarData(m.data)} · {ROTULO_MOVIMENTO[m.tipo]}
                            {m.tarefa_id ? ` · ${nomeTarefa.get(m.tarefa_id) ?? ''}` : m.fornecedor ? ` · ${m.fornecedor}` : ''}
                          </span>
                        </span>
                        <span className={`numeros shrink-0 text-right font-semibold ${m.tipo === 'saida' || m.quantidade < 0 ? '' : 'text-obra-ok'}`}>
                          {m.tipo === 'saida' ? '−' : m.quantidade > 0 ? '+' : '−'}
                          {formatarQuantidade(Math.abs(m.quantidade), item?.unidade)}
                        </span>
                      </li>
                    );
                  })}
                </ul>
              )}
            </section>
          </div>
        </>
      )}
    </div>
  );
}
