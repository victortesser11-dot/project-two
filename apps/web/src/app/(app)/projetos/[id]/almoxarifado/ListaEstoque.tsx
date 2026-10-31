'use client';

import { useMemo, useState } from 'react';
import { formatarMoeda, formatarQuantidade, normalizarTexto, type ItemComSaldo } from '@obras/shared';
import { classeEntrada } from '@/components/ui';

type Filtro = 'todos' | 'saldo' | 'minimo';

/** Lista de materiais com busca e filtro (tudo no aparelho, sem ir ao servidor). */
export function ListaEstoque({ materiais }: { materiais: ItemComSaldo[] }) {
  const [busca, setBusca] = useState('');
  const [filtro, setFiltro] = useState<Filtro>('todos');

  const visiveis = useMemo(() => {
    const termo = normalizarTexto(busca);
    return materiais
      .filter((i) => (filtro === 'saldo' ? i.quantidade > 0 : filtro === 'minimo' ? i.abaixoDoMinimo : true))
      .filter((i) => termo === '' || normalizarTexto(`${i.nome} ${i.codigo} ${i.categoria ?? ''}`).includes(termo))
      .sort((a, b) => Number(b.abaixoDoMinimo) - Number(a.abaixoDoMinimo) || a.nome.localeCompare(b.nome, 'pt-BR'));
  }, [materiais, busca, filtro]);

  const filtros: { chave: Filtro; nome: string; total: number }[] = [
    { chave: 'todos', nome: 'Todos', total: materiais.length },
    { chave: 'saldo', nome: 'Com saldo', total: materiais.filter((i) => i.quantidade > 0).length },
    { chave: 'minimo', nome: 'Abaixo do mínimo', total: materiais.filter((i) => i.abaixoDoMinimo).length },
  ];

  return (
    <section aria-labelledby="titulo-materiais" className="rounded-medio border border-linha bg-papel">
      <div className="flex flex-col gap-3 border-b border-linha px-4 py-3 sm:flex-row sm:items-center sm:justify-between sm:px-5">
        <h3 id="titulo-materiais" className="text-base font-semibold">
          Materiais
        </h3>
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <label htmlFor="busca-estoque" className="sr-only">
            Buscar material
          </label>
          <input
            id="busca-estoque"
            type="search"
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            placeholder="Buscar material"
            className={`${classeEntrada} sm:w-72`}
          />
        </div>
      </div>
      <div role="group" aria-label="Filtrar materiais" className="flex gap-2 overflow-x-auto px-4 pt-3 sm:px-5">
        {filtros.map((f) => (
          <button
            key={f.chave}
            type="button"
            aria-pressed={filtro === f.chave}
            onClick={() => setFiltro(f.chave)}
            className={`numeros min-h-11 shrink-0 rounded-full border px-4 text-sm font-semibold ${
              filtro === f.chave ? 'border-cianotipia bg-cianotipia-claro text-cianotipia' : 'border-linha bg-papel text-regua hover:text-grafite'
            }`}
          >
            {f.nome} ({f.total})
          </button>
        ))}
      </div>
      {visiveis.length === 0 ? (
        <p className="px-4 py-6 text-sm text-regua sm:px-5">Nenhum material com esse filtro.</p>
      ) : (
        <ul className="mt-3 divide-y divide-linha border-t border-linha">
          <li aria-hidden className="hidden grid-cols-[minmax(0,1fr)_8rem_7rem_7rem_7rem] gap-3 px-5 py-2 text-xs font-semibold text-regua sm:grid">
            <span>Material</span>
            <span className="text-right">Saldo</span>
            <span className="text-right">Mínimo</span>
            <span className="text-right">Custo médio</span>
            <span className="text-right">Valor</span>
          </li>
          {visiveis.map((i) => (
            <li
              key={i.id}
              className={`grid grid-cols-[minmax(0,1fr)_auto] gap-x-3 gap-y-0.5 px-4 py-3 sm:grid-cols-[minmax(0,1fr)_8rem_7rem_7rem_7rem] sm:items-center sm:px-5 ${
                i.abaixoDoMinimo ? 'bg-marcador-claro/60' : ''
              }`}
            >
              <div className="min-w-0">
                <p className="truncate font-semibold">
                  {i.nome}
                  {!i.ativo && <span className="ml-2 text-xs font-semibold text-regua">(inativo)</span>}
                </p>
                <p className="numeros truncate text-sm text-regua">
                  {i.codigo}
                  {i.categoria ? ` · ${i.categoria}` : ''}
                </p>
              </div>
              <p className={`numeros text-right font-semibold ${i.abaixoDoMinimo ? 'text-marcador' : ''}`}>{formatarQuantidade(i.quantidade, i.unidade)}</p>
              <p className="numeros col-span-2 text-sm text-regua sm:col-span-1 sm:text-right sm:text-base sm:text-grafite">
                <span className="sm:hidden">{i.estoque_minimo > 0 ? 'Mínimo ' : 'Sem mínimo'}</span>
                {i.estoque_minimo > 0 ? formatarQuantidade(i.estoque_minimo, i.unidade) : <span className="hidden sm:inline">—</span>}
                {i.quantidade > 0 && (
                  <span className="sm:hidden">
                    {' · '}médio {formatarMoeda(i.custo_medio)} · {formatarMoeda(i.valor)}
                  </span>
                )}
              </p>
              <p className="numeros hidden text-right sm:block">{i.quantidade > 0 || i.custo_medio > 0 ? formatarMoeda(i.custo_medio) : '—'}</p>
              <p className="numeros hidden text-right font-semibold sm:block">{i.valor > 0 ? formatarMoeda(i.valor) : '—'}</p>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
