'use client';

import { useMemo, useState, useTransition } from 'react';
import type { Trabalhador } from '@obras/shared';
import type { ApontamentoDia } from '@/lib/dados';
import { registrarChamada } from './acoes';
import { Botao, classeEntrada } from '@/components/ui';

type Alocacao = { tarefaId: string; horas: string; quantidade: string };
type Linha = { presente: boolean; alocacoes: Alocacao[] };
type TarefaOpcao = { id: string; codigo: string; nome: string; unidade: string | null };

const JORNADA = '8';

function linhasIniciais(pessoas: Trabalhador[], doDia: ApontamentoDia[], anterior: ApontamentoDia[]): Record<string, Linha> {
  const base = doDia.length > 0 ? doDia : anterior;
  const r: Record<string, Linha> = {};
  for (const p of pessoas) {
    const meus = base.filter((a) => a.trabalhador_id === p.id);
    if (meus.length === 0) {
      r[p.id] = { presente: true, alocacoes: [{ tarefaId: '', horas: JORNADA, quantidade: '' }] };
    } else if (meus.every((a) => !a.presente)) {
      // Faltou ontem: hoje começa como presente, sem tarefa sugerida (a não ser que seja a chamada do próprio dia).
      r[p.id] = doDia.length > 0
        ? { presente: false, alocacoes: [{ tarefaId: '', horas: JORNADA, quantidade: '' }] }
        : { presente: true, alocacoes: [{ tarefaId: '', horas: JORNADA, quantidade: '' }] };
    } else {
      r[p.id] = {
        presente: true,
        alocacoes: meus
          .filter((a) => a.presente)
          .map((a) => ({
            tarefaId: a.tarefa_id ?? '',
            horas: String(a.horas ?? JORNADA).replace('.', ','),
            quantidade: doDia.length > 0 && a.quantidade !== null ? String(a.quantidade).replace('.', ',') : '',
          })),
      };
    }
  }
  return r;
}

const numero = (t: string) => Number(t.replace(/\./g, '').replace(',', '.'));

export function ChamadaDia({
  projetoId,
  data,
  pessoas,
  tarefas,
  empreiteiras,
  doDia,
  anterior,
  dataAnterior,
}: {
  projetoId: string;
  data: string;
  pessoas: Trabalhador[];
  tarefas: TarefaOpcao[];
  empreiteiras: Record<string, string>;
  doDia: ApontamentoDia[];
  anterior: ApontamentoDia[];
  dataAnterior: string | null;
}) {
  const [linhas, setLinhas] = useState(() => linhasIniciais(pessoas, doDia, anterior));
  const [marcados, setMarcados] = useState<Set<string>>(new Set());
  const [tarefaLote, setTarefaLote] = useState('');
  const [mensagem, setMensagem] = useState<{ tipo: 'ok' | 'erro'; texto: string } | null>(null);
  const [salvando, iniciar] = useTransition();
  const porTarefa = useMemo(() => new Map(tarefas.map((t) => [t.id, t])), [tarefas]);

  const presentes = pessoas.filter((p) => linhas[p.id]?.presente).length;
  const semTarefa = pessoas.filter((p) => linhas[p.id]?.presente && linhas[p.id]!.alocacoes.some((a) => !a.tarefaId)).map((p) => p.id);

  function mudar(id: string, f: (l: Linha) => Linha) {
    setLinhas((atual) => ({ ...atual, [id]: f(atual[id]!) }));
    setMensagem(null);
  }
  function mudarAlocacao(id: string, i: number, campo: keyof Alocacao, valor: string) {
    mudar(id, (l) => ({ ...l, alocacoes: l.alocacoes.map((a, j) => (j === i ? { ...a, [campo]: valor } : a)) }));
  }
  function marcarTodos(presente: boolean) {
    setLinhas((atual) => Object.fromEntries(Object.entries(atual).map(([id, l]) => [id, { ...l, presente }])));
  }
  function aplicarTarefa() {
    if (!tarefaLote || marcados.size === 0) return;
    setLinhas((atual) => {
      const novo = { ...atual };
      for (const id of marcados) novo[id] = { presente: true, alocacoes: [{ tarefaId: tarefaLote, horas: JORNADA, quantidade: '' }] };
      return novo;
    });
    setMarcados(new Set());
  }

  function salvar() {
    if (semTarefa.length > 0) {
      setMensagem({ tipo: 'erro', texto: `Escolha a tarefa de ${semTarefa.length === 1 ? '1 pessoa' : `${semTarefa.length} pessoas`} (destacadas em laranja).` });
      return;
    }
    const corpo = pessoas.map((p) => {
      const l = linhas[p.id]!;
      return {
        trabalhador_id: p.id,
        presente: l.presente,
        alocacoes: l.presente
          ? l.alocacoes.map((a) => ({ tarefa_id: a.tarefaId, horas: numero(a.horas), quantidade: a.quantidade.trim() ? numero(a.quantidade) : null }))
          : [],
      };
    });
    iniciar(async () => {
      const r = await registrarChamada(projetoId, data, corpo);
      setMensagem(r.ok ? { tipo: 'ok', texto: r.mensagem ?? 'Chamada salva.' } : { tipo: 'erro', texto: r.erro });
    });
  }

  if (pessoas.length === 0) {
    return (
      <div className="rounded-medio border border-dashed border-campo/60 px-5 py-10 text-center">
        <p className="font-semibold">A obra ainda não tem equipe</p>
        <p className="mt-1 text-sm text-regua">O engenheiro inclui as pessoas na página Equipe.</p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4 pb-24">
      <div className="flex flex-col gap-3 rounded-medio border border-linha bg-concreto/60 p-3 sm:flex-row sm:flex-wrap sm:items-center">
        <div className="flex gap-2">
          <Botao type="button" variante="secundario" onClick={() => marcarTodos(true)}>
            Todos vieram
          </Botao>
          <Botao type="button" variante="secundario" onClick={() => marcarTodos(false)}>
            Ninguém veio
          </Botao>
        </div>
        <div className="flex flex-1 flex-col gap-2 sm:flex-row sm:items-center">
          <label htmlFor="tarefa-lote" className="text-sm font-semibold sm:whitespace-nowrap">
            Tarefa para os marcados ({marcados.size})
          </label>
          <select id="tarefa-lote" value={tarefaLote} onChange={(e) => setTarefaLote(e.target.value)} className={`${classeEntrada} sm:min-w-0 sm:flex-1`}>
            <option value="">Escolha a tarefa</option>
            {tarefas.map((t) => (
              <option key={t.id} value={t.id}>
                {t.codigo} {t.nome}
              </option>
            ))}
          </select>
          <Botao type="button" onClick={aplicarTarefa} disabled={!tarefaLote || marcados.size === 0}>
            Aplicar
          </Botao>
        </div>
      </div>
      {doDia.length === 0 && dataAnterior && (
        <p className="text-sm text-regua">Tarefas e horas sugeridas a partir da última chamada. Ajuste só o que mudou.</p>
      )}

      <ul className="flex flex-col gap-2">
        {pessoas.map((p) => {
          const l = linhas[p.id]!;
          const faltaTarefa = semTarefa.includes(p.id);
          const empresa = p.empreiteira_id ? empreiteiras[p.empreiteira_id] : null;
          return (
            <li
              key={p.id}
              className={`rounded-medio border bg-papel p-3 ${faltaTarefa ? 'border-marcador' : l.presente ? 'border-linha' : 'border-linha bg-concreto/50'}`}
            >
              <div className="flex items-center gap-3">
                <input
                  type="checkbox"
                  aria-label={`Marcar ${p.nome} para aplicar a tarefa`}
                  checked={marcados.has(p.id)}
                  onChange={(e) =>
                    setMarcados((m) => {
                      const n = new Set(m);
                      if (e.target.checked) n.add(p.id);
                      else n.delete(p.id);
                      return n;
                    })
                  }
                  className="size-5 shrink-0 accent-cianotipia"
                />
                <div className="min-w-0 flex-1">
                  <p className="font-semibold break-words">{p.nome}</p>
                  <p className="text-sm text-regua">
                    {p.funcao}
                    {empresa ? ` · ${empresa}` : ''}
                  </p>
                </div>
                <div role="group" aria-label={`Presença de ${p.nome}`} className="inline-flex shrink-0 rounded-medio border border-linha p-0.5">
                  <button
                    type="button"
                    aria-pressed={l.presente}
                    onClick={() => mudar(p.id, (x) => ({ ...x, presente: true }))}
                    className={`min-h-11 rounded-[8px] px-3 text-sm font-semibold ${l.presente ? 'bg-obra-ok text-white' : 'text-regua'}`}
                  >
                    Veio
                  </button>
                  <button
                    type="button"
                    aria-pressed={!l.presente}
                    onClick={() => mudar(p.id, (x) => ({ ...x, presente: false }))}
                    className={`min-h-11 rounded-[8px] px-3 text-sm font-semibold ${!l.presente ? 'bg-marcador text-white' : 'text-regua'}`}
                  >
                    Faltou
                  </button>
                </div>
              </div>

              {l.presente && (
                <div className="mt-3 flex flex-col gap-2">
                  {l.alocacoes.map((a, i) => {
                    const t = porTarefa.get(a.tarefaId);
                    return (
                      <div key={i} className="grid grid-cols-[minmax(0,1fr)_4.5rem] gap-2 sm:grid-cols-[minmax(0,1fr)_5rem_6rem_auto]">
                        <label className="sr-only" htmlFor={`t-${p.id}-${i}`}>
                          Tarefa de {p.nome}
                        </label>
                        <select
                          id={`t-${p.id}-${i}`}
                          value={a.tarefaId}
                          onChange={(e) => mudarAlocacao(p.id, i, 'tarefaId', e.target.value)}
                          className={`${classeEntrada} ${!a.tarefaId ? 'border-marcador' : ''}`}
                        >
                          <option value="">Escolha a tarefa</option>
                          {tarefas.map((x) => (
                            <option key={x.id} value={x.id}>
                              {x.codigo} {x.nome}
                            </option>
                          ))}
                        </select>
                        <label className="sr-only" htmlFor={`h-${p.id}-${i}`}>
                          Horas
                        </label>
                        <div className="relative">
                          <input
                            id={`h-${p.id}-${i}`}
                            inputMode="decimal"
                            value={a.horas}
                            onChange={(e) => mudarAlocacao(p.id, i, 'horas', e.target.value)}
                            className={`${classeEntrada} numeros pr-6 text-right`}
                          />
                          <span className="pointer-events-none absolute top-1/2 right-2 -translate-y-1/2 text-sm text-regua">h</span>
                        </div>
                        {t?.unidade ? (
                          <>
                            <label className="sr-only" htmlFor={`q-${p.id}-${i}`}>
                              Quantidade feita em {t.unidade}
                            </label>
                            <input
                              id={`q-${p.id}-${i}`}
                              inputMode="decimal"
                              placeholder={`Qtd. ${t.unidade}`}
                              value={a.quantidade}
                              onChange={(e) => mudarAlocacao(p.id, i, 'quantidade', e.target.value)}
                              className={`${classeEntrada} numeros text-right`}
                            />
                          </>
                        ) : (
                          <span className="hidden sm:block" />
                        )}
                        {l.alocacoes.length > 1 ? (
                          <button
                            type="button"
                            onClick={() => mudar(p.id, (x) => ({ ...x, alocacoes: x.alocacoes.filter((_, j) => j !== i) }))}
                            className="min-h-11 px-2 text-sm font-semibold text-marcador"
                          >
                            Tirar
                          </button>
                        ) : (
                          <span className="hidden sm:block" />
                        )}
                      </div>
                    );
                  })}
                  <button
                    type="button"
                    onClick={() =>
                      mudar(p.id, (x) => {
                        // Divide o dia: metade das horas da última tarefa vai para a nova.
                        const ultima = x.alocacoes[x.alocacoes.length - 1]!;
                        const h = numero(ultima.horas) || 8;
                        const metade = String(Math.round((h / 2) * 2) / 2).replace('.', ',');
                        const resto = String(h - Math.round((h / 2) * 2) / 2).replace('.', ',');
                        return {
                          ...x,
                          alocacoes: [...x.alocacoes.slice(0, -1), { ...ultima, horas: resto }, { tarefaId: '', horas: metade, quantidade: '' }],
                        };
                      })
                    }
                    className="min-h-11 self-start text-sm font-semibold text-cianotipia hover:underline underline-offset-4"
                  >
                    Dividir o dia com outra tarefa
                  </button>
                </div>
              )}
            </li>
          );
        })}
      </ul>

      <div className="fixed inset-x-0 bottom-0 z-30 border-t border-linha bg-papel/95 px-4 py-3 backdrop-blur print:hidden">
        <div className="mx-auto flex max-w-3xl flex-wrap items-center justify-between gap-3">
          <p className="numeros text-sm">
            <strong className="font-semibold">{presentes}</strong> de {pessoas.length} vieram
            {mensagem && (
              <span role={mensagem.tipo === 'erro' ? 'alert' : 'status'} className={`block ${mensagem.tipo === 'erro' ? 'text-marcador' : 'text-obra-ok'}`}>
                {mensagem.texto}
              </span>
            )}
          </p>
          <Botao type="button" onClick={salvar} disabled={salvando}>
            {salvando ? 'Salvando…' : 'Salvar chamada'}
          </Botao>
        </div>
      </div>
    </div>
  );
}
