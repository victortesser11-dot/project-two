'use client';

import { useActionState, useEffect, useMemo, useRef, useState, useTransition } from 'react';
import { formatarQuantidade, normalizarTexto, UNIDADES_ESTOQUE, type ItemEstoque, type TipoItemEstoque } from '@obras/shared';
import { definirItemAtivo, salvarItem, type EstadoForm } from '../acoes';
import { AvisoErro, Botao, Campo, classeEntrada } from '@/components/ui';

export function FormularioItem({
  projetoId,
  item,
  tipoInicial = 'material',
  categorias,
  aoSalvar,
}: {
  projetoId: string;
  item?: ItemEstoque;
  tipoInicial?: TipoItemEstoque;
  categorias: string[];
  aoSalvar?: () => void;
}) {
  const [estado, acao, salvando] = useActionState<EstadoForm, FormData>(salvarItem, {});
  const [tipo, setTipo] = useState<TipoItemEstoque>(item?.tipo ?? tipoInicial);
  const form = useRef<HTMLFormElement>(null);
  const e = estado.erros ?? {};
  const v = (c: string, original = '') => estado.valores?.[c] ?? original;
  const id = (c: string) => `${item ? `editar-${item.id}` : 'novo'}-${c}`;
  useEffect(() => {
    if (estado.ok) {
      if (!item) form.current?.reset();
      aoSalvar?.();
    }
  }, [estado, item, aoSalvar]);

  return (
    <form ref={form} action={acao} className="flex flex-col gap-4" aria-label={item ? `Editar ${item.nome}` : 'Cadastrar item'}>
      <input type="hidden" name="projeto_id" value={projetoId} />
      {item && <input type="hidden" name="item_id" value={item.id} />}
      <input type="hidden" name="tipo" value={tipo} />
      {!item && (
        <fieldset className="flex flex-col gap-1.5">
          <legend className="text-sm font-semibold">Tipo</legend>
          <div className="inline-flex self-start rounded-medio border border-linha bg-concreto p-0.5">
            {(['material', 'ferramenta'] as const).map((t) => (
              <label
                key={t}
                className={`flex min-h-10 cursor-pointer items-center rounded-[8px] px-4 text-sm font-semibold has-[:focus-visible]:ring-2 has-[:focus-visible]:ring-cianotipia ${
                  tipo === t ? 'bg-papel text-grafite shadow-[0_0_0_1px_var(--color-linha)]' : 'text-regua'
                }`}
              >
                <input type="radio" name="tipo-escolha" value={t} checked={tipo === t} onChange={() => setTipo(t)} className="sr-only" />
                {t === 'material' ? 'Material' : 'Ferramenta'}
              </label>
            ))}
          </div>
        </fieldset>
      )}
      <datalist id="categorias-estoque">
        {categorias.map((c) => (
          <option key={c} value={c} />
        ))}
      </datalist>
      <datalist id="unidades-catalogo">
        {UNIDADES_ESTOQUE.map((u) => (
          <option key={u} value={u} />
        ))}
      </datalist>
      <div className="grid gap-4 sm:grid-cols-2">
        <Campo rotulo="Nome" nome={id('nome')} erro={e.nome}>
          <input id={id('nome')} name="nome" required maxLength={200} defaultValue={v('nome', item?.nome)} className={classeEntrada} />
        </Campo>
        <Campo rotulo="Código" nome={id('codigo')} erro={e.codigo} dica={item ? undefined : `Vazio = automático (${tipo === 'ferramenta' ? 'FER' : 'MAT'}-0001…)`}>
          <input id={id('codigo')} name="codigo" maxLength={30} defaultValue={v('codigo', item?.codigo)} className={`${classeEntrada} numeros`} autoCapitalize="characters" />
        </Campo>
        {tipo === 'material' ? (
          <>
            <Campo rotulo="Unidade" nome={id('unidade')} erro={e.unidade} dica="Ex.: sc, kg, m³, un">
              <input id={id('unidade')} name="unidade" required list="unidades-catalogo" maxLength={20} defaultValue={v('unidade', item?.unidade ?? '')} className={classeEntrada} />
            </Campo>
            <Campo rotulo="Estoque mínimo" nome={id('minimo')} erro={e.estoque_minimo} dica="Abaixo disso, o item aparece em alerta. Vale para cada obra.">
              <input
                id={id('minimo')}
                name="estoque_minimo"
                inputMode="decimal"
                defaultValue={v('estoque_minimo', item && item.estoque_minimo > 0 ? String(item.estoque_minimo).replace('.', ',') : '')}
                className={`${classeEntrada} numeros`}
              />
            </Campo>
            <Campo rotulo="NCM" nome={id('ncm')} erro={e.ncm} dica="Opcional; vem da NF-e">
              <input id={id('ncm')} name="ncm" inputMode="numeric" maxLength={10} defaultValue={v('ncm', item?.ncm ?? '')} className={`${classeEntrada} numeros`} />
            </Campo>
          </>
        ) : (
          <Campo rotulo="Patrimônio" nome={id('patrimonio')} erro={e.patrimonio} dica="Opcional: o número da plaqueta, se houver">
            <input id={id('patrimonio')} name="patrimonio" maxLength={40} defaultValue={v('patrimonio', item?.patrimonio ?? '')} className={`${classeEntrada} numeros`} />
          </Campo>
        )}
        <Campo rotulo="Categoria" nome={id('categoria')} erro={e.categoria} dica="Opcional (ex.: Cimento e argamassa, Elétrica)">
          <input id={id('categoria')} name="categoria" list="categorias-estoque" maxLength={80} defaultValue={v('categoria', item?.categoria ?? '')} className={classeEntrada} />
        </Campo>
      </div>
      {estado.erroGeral && <AvisoErro>{estado.erroGeral}</AvisoErro>}
      {estado.ok && estado.mensagem && (
        <p role="status" className="text-sm font-semibold text-obra-ok">
          {estado.mensagem}
        </p>
      )}
      <Botao type="submit" disabled={salvando} className="self-start">
        {salvando ? 'Salvando…' : item ? 'Salvar item' : tipo === 'ferramenta' ? 'Cadastrar ferramenta' : 'Cadastrar material'}
      </Botao>
    </form>
  );
}

function BotaoAtivo({ projetoId, item }: { projetoId: string; item: ItemEstoque }) {
  const [erro, setErro] = useState<string | null>(null);
  const [salvando, iniciar] = useTransition();
  return (
    <>
      <Botao
        type="button"
        variante="secundario"
        disabled={salvando}
        onClick={() =>
          iniciar(async () => {
            const r = await definirItemAtivo(projetoId, item.id, !item.ativo);
            setErro(r.ok ? null : r.erro);
          })
        }
      >
        {item.ativo ? (item.tipo === 'ferramenta' ? 'Dar baixa' : 'Desativar') : 'Reativar'}
      </Botao>
      {erro && (
        <p role="alert" className="text-sm text-marcador">
          {erro}
        </p>
      )}
    </>
  );
}

export function ListaCatalogo({ projetoId, itens, podeGerir }: { projetoId: string; itens: ItemEstoque[]; podeGerir: boolean }) {
  const [busca, setBusca] = useState('');
  const [editando, setEditando] = useState<string | null>(null);
  const categorias = useMemo(() => [...new Set(itens.map((i) => i.categoria).filter((c): c is string => !!c))].sort(), [itens]);
  const termo = normalizarTexto(busca);
  const visiveis = itens.filter((i) => termo === '' || normalizarTexto(`${i.nome} ${i.codigo} ${i.categoria ?? ''} ${i.patrimonio ?? ''}`).includes(termo));

  return (
    <section aria-labelledby="titulo-catalogo" className="rounded-medio border border-linha bg-papel">
      <div className="flex flex-col gap-3 border-b border-linha px-4 py-3 sm:flex-row sm:items-center sm:justify-between sm:px-5">
        <h3 id="titulo-catalogo" className="text-base font-semibold">
          {itens.length} {itens.length === 1 ? 'item' : 'itens'}
        </h3>
        <label htmlFor="busca-catalogo" className="sr-only">
          Buscar no catálogo
        </label>
        <input id="busca-catalogo" type="search" value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar" className={`${classeEntrada} sm:w-72`} />
      </div>
      {visiveis.length === 0 ? (
        <p className="px-4 py-6 text-sm text-regua sm:px-5">Nenhum item.</p>
      ) : (
        <ul className="divide-y divide-linha">
          {visiveis.map((i) => (
            <li key={i.id} className={`flex flex-col gap-3 px-4 py-3 sm:px-5 ${i.ativo ? '' : 'bg-concreto/50'}`}>
              <div className="flex flex-wrap items-center justify-between gap-2">
                <div className="min-w-0">
                  <p className="font-semibold">
                    {i.nome}
                    {!i.ativo && <span className="ml-2 text-xs font-semibold text-regua">{i.tipo === 'ferramenta' ? '(baixada)' : '(inativo)'}</span>}
                  </p>
                  <p className="numeros text-sm text-regua">
                    {i.codigo} · {i.tipo === 'ferramenta' ? 'Ferramenta' : i.unidade}
                    {i.categoria ? ` · ${i.categoria}` : ''}
                    {i.tipo === 'material' && i.estoque_minimo > 0 ? ` · mínimo ${formatarQuantidade(i.estoque_minimo, i.unidade)}` : ''}
                    {i.patrimonio ? ` · patrimônio ${i.patrimonio}` : ''}
                    {i.ncm ? ` · NCM ${i.ncm}` : ''}
                  </p>
                </div>
                {podeGerir && (
                  <div className="flex flex-wrap items-center gap-2">
                    <Botao type="button" variante="secundario" onClick={() => setEditando(editando === i.id ? null : i.id)} aria-expanded={editando === i.id}>
                      {editando === i.id ? 'Fechar' : 'Editar'}
                    </Botao>
                    <BotaoAtivo projetoId={projetoId} item={i} />
                  </div>
                )}
              </div>
              {editando === i.id && (
                <div className="rounded-medio border border-linha p-3 sm:p-4">
                  <FormularioItem projetoId={projetoId} item={i} categorias={categorias} aoSalvar={() => setEditando(null)} />
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
