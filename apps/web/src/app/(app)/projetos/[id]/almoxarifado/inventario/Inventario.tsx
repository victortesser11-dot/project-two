'use client';

import { useMemo, useState, useTransition } from 'react';
import { formatarMoeda, formatarQuantidade, lerNumero, normalizarTexto, type ItemComSaldo } from '@obras/shared';
import { registrarInventario } from '../acoes';
import { Botao, classeEntrada } from '@/components/ui';

/** Contagem física: digita o que achou; só os itens com diferença viram ajuste (com o motivo). */
export function Inventario({ projetoId, materiais, hoje }: { projetoId: string; materiais: ItemComSaldo[]; hoje: string }) {
  const [contagem, setContagem] = useState<Record<string, string>>({});
  const [busca, setBusca] = useState('');
  const [motivo, setMotivo] = useState('Inventário');
  const [data, setData] = useState(hoje);
  const [mensagem, setMensagem] = useState<{ tipo: 'ok' | 'erro'; texto: string } | null>(null);
  const [salvando, iniciar] = useTransition();

  const diferencas = useMemo(
    () =>
      materiais
        .map((m) => {
          const bruto = contagem[m.id];
          if (bruto === undefined || bruto.trim() === '') return null;
          const n = lerNumero(bruto, ',');
          if (n === null || Number.isNaN(n) || n < 0) return { item: m, contado: Number.NaN, dif: Number.NaN };
          const dif = Math.round((n - m.quantidade) * 10000) / 10000;
          return dif === 0 ? null : { item: m, contado: n, dif };
        })
        .filter((x) => x !== null),
    [materiais, contagem],
  );
  const invalidas = diferencas.filter((d) => Number.isNaN(d.dif)).length;
  const valorDif = diferencas.reduce((s, d) => (Number.isNaN(d.dif) ? s : s + d.dif * d.item.custo_medio), 0);
  const termo = normalizarTexto(busca);
  const visiveis = materiais.filter((m) => termo === '' || normalizarTexto(`${m.nome} ${m.codigo} ${m.categoria ?? ''}`).includes(termo));

  function salvar() {
    setMensagem(null);
    iniciar(async () => {
      const r = await registrarInventario(
        projetoId,
        data,
        motivo,
        diferencas.map((d) => ({ item_id: d.item.id, quantidade_contada: contagem[d.item.id]! })),
      );
      if (r.ok) {
        setMensagem({ tipo: 'ok', texto: r.mensagem ?? 'Inventário salvo.' });
        setContagem({});
      } else setMensagem({ tipo: 'erro', texto: r.erro });
    });
  }

  return (
    <div className="flex flex-col gap-5">
      <div className="grid gap-4 sm:grid-cols-[10rem_minmax(0,1fr)_minmax(0,1fr)]">
        <div className="flex flex-col gap-1.5">
          <label htmlFor="inv-data" className="text-sm font-semibold">
            Data da contagem
          </label>
          <input id="inv-data" type="date" max={hoje} value={data} onChange={(e) => setData(e.target.value)} className={`${classeEntrada} numeros`} />
        </div>
        <div className="flex flex-col gap-1.5">
          <label htmlFor="inv-motivo" className="text-sm font-semibold">
            Motivo dos ajustes
          </label>
          <input id="inv-motivo" maxLength={500} value={motivo} onChange={(e) => setMotivo(e.target.value)} className={classeEntrada} placeholder="Inventário, perda, quebra, furto…" />
        </div>
        <div className="flex flex-col gap-1.5">
          <label htmlFor="inv-busca" className="text-sm font-semibold">
            Buscar
          </label>
          <input id="inv-busca" type="search" value={busca} onChange={(e) => setBusca(e.target.value)} className={classeEntrada} placeholder="Nome ou código" />
        </div>
      </div>

      <ul className="divide-y divide-linha rounded-medio border border-linha bg-papel">
        {visiveis.map((m) => {
          const d = diferencas.find((x) => x.item.id === m.id);
          return (
            <li key={m.id} className="grid grid-cols-[minmax(0,1fr)_8rem] items-center gap-3 px-4 py-3 sm:grid-cols-[minmax(0,1fr)_9rem_10rem] sm:px-5">
              <div className="min-w-0">
                <label htmlFor={`inv-${m.id}`} className="block truncate font-semibold">
                  {m.nome}
                </label>
                <p className="numeros text-sm text-regua">
                  {m.codigo} · no sistema: {formatarQuantidade(m.quantidade, m.unidade)}
                </p>
              </div>
              <input
                id={`inv-${m.id}`}
                inputMode="decimal"
                placeholder="Contado"
                value={contagem[m.id] ?? ''}
                onChange={(e) => setContagem((c) => ({ ...c, [m.id]: e.target.value }))}
                aria-invalid={d && Number.isNaN(d.dif) ? true : undefined}
                className={`${classeEntrada} numeros text-right`}
              />
              <p className={`numeros col-span-2 text-sm sm:col-span-1 sm:text-right ${d && !Number.isNaN(d.dif) ? (d.dif < 0 ? 'font-semibold text-marcador' : 'font-semibold text-obra-ok') : 'text-regua'}`}>
                {d
                  ? Number.isNaN(d.dif)
                    ? 'Número inválido'
                    : `${d.dif > 0 ? '+' : '−'}${formatarQuantidade(Math.abs(d.dif), m.unidade)} (${formatarMoeda(Math.abs(d.dif) * m.custo_medio)})`
                  : contagem[m.id]
                    ? 'Confere'
                    : ''}
              </p>
            </li>
          );
        })}
      </ul>

      <div className="sticky bottom-0 -mx-4 flex flex-col gap-3 border-t border-linha bg-papel px-4 py-4 sm:mx-0 sm:flex-row sm:items-center sm:justify-between sm:rounded-medio sm:border">
        <p className="numeros text-sm">
          <span className="font-semibold">
            {diferencas.length} {diferencas.length === 1 ? 'item com diferença' : 'itens com diferença'}
          </span>
          {diferencas.length > 0 && (
            <span className={valorDif < 0 ? 'text-marcador' : 'text-obra-ok'}>
              {' '}
              · {valorDif < 0 ? 'perda' : 'sobra'} de {formatarMoeda(Math.abs(valorDif))}
            </span>
          )}
        </p>
        <Botao type="button" onClick={salvar} disabled={salvando || diferencas.length === 0 || invalidas > 0 || motivo.trim().length < 3}>
          {salvando ? 'Salvando…' : 'Salvar inventário'}
        </Botao>
      </div>
      {mensagem && (
        <p role={mensagem.tipo === 'erro' ? 'alert' : 'status'} className={`text-sm ${mensagem.tipo === 'erro' ? 'text-marcador' : 'font-semibold text-obra-ok'}`}>
          {mensagem.texto}
        </p>
      )}
    </div>
  );
}
