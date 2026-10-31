'use client';

import { useMemo, useState, useTransition } from 'react';
import { formatarMoeda, lerNumero, type ItemEstoque } from '@obras/shared';
import { registrarEntrada } from '../acoes';
import { Botao, classeEntrada } from '@/components/ui';

type Linha = { item_id: string; quantidade: string; valor_unitario: string };
const vazia = (): Linha => ({ item_id: '', quantidade: '', valor_unitario: '' });

/** Entrada sem XML: compra no balcão, nota em papel, transferência de outra obra. */
export function EntradaManual({ projetoId, materiais, hoje }: { projetoId: string; materiais: ItemEstoque[]; hoje: string }) {
  const [linhas, setLinhas] = useState<Linha[]>([vazia()]);
  const [cab, setCab] = useState({ data: hoje, fornecedor: '', cnpj_fornecedor: '', nota_fiscal: '' });
  const [mensagem, setMensagem] = useState<{ tipo: 'ok' | 'erro'; texto: string } | null>(null);
  const [enviando, iniciar] = useTransition();
  const porId = useMemo(() => new Map(materiais.map((m) => [m.id, m])), [materiais]);
  const ordenados = useMemo(() => [...materiais].sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR')), [materiais]);

  const total = linhas.reduce((s, l) => {
    const q = lerNumero(l.quantidade, ',');
    const v = lerNumero(l.valor_unitario, ',');
    return s + (q && v && Number.isFinite(q * v) ? q * v : 0);
  }, 0);

  function mudar(i: number, campo: keyof Linha, valor: string) {
    setLinhas((a) => a.map((l, j) => (j === i ? { ...l, [campo]: valor } : l)));
    setMensagem(null);
  }

  function enviar() {
    const preenchidas = linhas.filter((l) => l.item_id || l.quantidade || l.valor_unitario);
    iniciar(async () => {
      const r = await registrarEntrada(projetoId, {
        ...cab,
        itens: preenchidas.map((l) => ({ item_id: l.item_id || null, quantidade: l.quantidade, valor_unitario: l.valor_unitario || '0' })),
      });
      if (r.ok) {
        setMensagem({ tipo: 'ok', texto: r.mensagem ?? 'Entrada registrada.' });
        setLinhas([vazia()]);
        setCab({ data: cab.data, fornecedor: '', cnpj_fornecedor: '', nota_fiscal: '' });
      } else setMensagem({ tipo: 'erro', texto: r.erro });
    });
  }

  return (
    <div className="flex flex-col gap-5">
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <div className="flex flex-col gap-1.5">
          <label htmlFor="m-data" className="text-sm font-semibold">
            Data da entrada
          </label>
          <input id="m-data" type="date" max={hoje} value={cab.data} onChange={(e) => setCab({ ...cab, data: e.target.value })} className={`${classeEntrada} numeros`} />
        </div>
        <div className="flex flex-col gap-1.5">
          <label htmlFor="m-fornecedor" className="text-sm font-semibold">
            Fornecedor
          </label>
          <input id="m-fornecedor" maxLength={160} value={cab.fornecedor} onChange={(e) => setCab({ ...cab, fornecedor: e.target.value })} className={classeEntrada} />
        </div>
        <div className="flex flex-col gap-1.5">
          <label htmlFor="m-cnpj" className="text-sm font-semibold">
            CNPJ do fornecedor <span className="font-normal text-regua">(opcional)</span>
          </label>
          <input
            id="m-cnpj"
            inputMode="numeric"
            placeholder="00.000.000/0000-00"
            value={cab.cnpj_fornecedor}
            onChange={(e) => setCab({ ...cab, cnpj_fornecedor: e.target.value })}
            className={`${classeEntrada} numeros`}
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <label htmlFor="m-nf" className="text-sm font-semibold">
            Nº da nota <span className="font-normal text-regua">(opcional)</span>
          </label>
          <input id="m-nf" maxLength={40} value={cab.nota_fiscal} onChange={(e) => setCab({ ...cab, nota_fiscal: e.target.value })} className={`${classeEntrada} numeros`} />
        </div>
      </div>

      <ul className="flex flex-col gap-3" aria-label="Itens da entrada">
        {linhas.map((l, i) => {
          const item = porId.get(l.item_id);
          return (
            <li key={i} className="grid grid-cols-2 gap-2 rounded-medio border border-linha bg-papel p-3 sm:grid-cols-[minmax(0,1fr)_8rem_9rem_auto] sm:items-end sm:border-0 sm:p-0">
              <div className="col-span-2 flex flex-col gap-1.5 sm:col-span-1">
                <label htmlFor={`m-item-${i}`} className="text-sm font-semibold sm:sr-only">
                  Material
                </label>
                <select id={`m-item-${i}`} value={l.item_id} onChange={(e) => mudar(i, 'item_id', e.target.value)} className={classeEntrada}>
                  <option value="">Escolha o material</option>
                  {ordenados.map((m) => (
                    <option key={m.id} value={m.id}>
                      {m.nome} ({m.unidade})
                    </option>
                  ))}
                </select>
              </div>
              <div className="flex flex-col gap-1.5">
                <label htmlFor={`m-qtd-${i}`} className="text-sm font-semibold sm:sr-only">
                  Quantidade{item ? ` (${item.unidade})` : ''}
                </label>
                <input
                  id={`m-qtd-${i}`}
                  inputMode="decimal"
                  placeholder={item ? `Qtd. (${item.unidade})` : 'Qtd.'}
                  value={l.quantidade}
                  onChange={(e) => mudar(i, 'quantidade', e.target.value)}
                  className={`${classeEntrada} numeros text-right`}
                />
              </div>
              <div className="flex flex-col gap-1.5">
                <label htmlFor={`m-valor-${i}`} className="text-sm font-semibold sm:sr-only">
                  Valor unitário (R$)
                </label>
                <input
                  id={`m-valor-${i}`}
                  inputMode="decimal"
                  placeholder="R$ por unidade"
                  value={l.valor_unitario}
                  onChange={(e) => mudar(i, 'valor_unitario', e.target.value)}
                  className={`${classeEntrada} numeros text-right`}
                />
              </div>
              <button
                type="button"
                onClick={() => setLinhas((a) => (a.length === 1 ? [vazia()] : a.filter((_, j) => j !== i)))}
                aria-label={`Remover linha ${i + 1}`}
                className="col-span-2 flex min-h-11 items-center justify-center rounded-medio text-sm text-regua hover:bg-concreto hover:text-marcador sm:col-span-1 sm:size-11"
              >
                <svg aria-hidden viewBox="0 0 16 16" className="size-4" fill="none" stroke="currentColor" strokeWidth="2">
                  <path d="m4 4 8 8M12 4l-8 8" />
                </svg>
                <span className="ml-2 sm:hidden">Remover linha</span>
              </button>
            </li>
          );
        })}
      </ul>

      <div className="flex flex-wrap items-center gap-3">
        <Botao type="button" variante="secundario" onClick={() => setLinhas((a) => [...a, vazia()])}>
          Adicionar item
        </Botao>
        <Botao type="button" onClick={enviar} disabled={enviando}>
          {enviando ? 'Dando entrada…' : 'Dar entrada'}
        </Botao>
        <span className="numeros text-sm text-regua">Total {formatarMoeda(total)}</span>
      </div>
      {mensagem && (
        <p role={mensagem.tipo === 'erro' ? 'alert' : 'status'} className={`text-sm ${mensagem.tipo === 'erro' ? 'text-marcador' : 'font-semibold text-obra-ok'}`}>
          {mensagem.texto}
        </p>
      )}
    </div>
  );
}
