'use client';

import { useState, useTransition } from 'react';
import type { LinhaEfetivo } from '@obras/shared';
import { salvarEfetivo } from './acoes';
import { Botao, classeEntrada } from '@/components/ui';

const FUNCOES = [
  'Pedreiro', 'Servente', 'Carpinteiro', 'Armador', 'Eletricista', 'Encanador', 'Pintor',
  'Gesseiro', 'Azulejista', 'Mestre de obras', 'Encarregado', 'Operador de máquina', 'Motorista', 'Técnico de segurança',
];

type Linha = { funcao: string; empresa_terceira: string; quantidade: string };

/** Equipe do dia por função e empreiteira (manual até a chamada diária do sprint 3). */
export function EditorEfetivo({ projetoId, data, inicial }: { projetoId: string; data: string; inicial: LinhaEfetivo[] }) {
  const [linhas, setLinhas] = useState<Linha[]>(
    inicial.length > 0
      ? inicial.map((l) => ({ funcao: l.funcao, empresa_terceira: l.empresa_terceira ?? '', quantidade: String(l.quantidade) }))
      : [{ funcao: '', empresa_terceira: '', quantidade: '' }],
  );
  const [mensagem, setMensagem] = useState<{ tipo: 'ok' | 'erro'; texto: string } | null>(null);
  const [salvando, iniciar] = useTransition();

  const total = linhas.reduce((s, l) => s + (Number.parseInt(l.quantidade, 10) || 0), 0);

  function mudar(i: number, campo: keyof Linha, valor: string) {
    setLinhas((atual) => atual.map((l, j) => (j === i ? { ...l, [campo]: valor } : l)));
    setMensagem(null);
  }

  function salvar() {
    const preenchidas = linhas.filter((l) => l.funcao.trim() !== '' || l.quantidade.trim() !== '');
    iniciar(async () => {
      const r = await salvarEfetivo(
        projetoId,
        data,
        preenchidas.map((l) => ({ funcao: l.funcao, empresa_terceira: l.empresa_terceira, quantidade: l.quantidade })),
      );
      setMensagem(r.ok ? { tipo: 'ok', texto: r.mensagem ?? 'Equipe salva.' } : { tipo: 'erro', texto: r.erro });
    });
  }

  return (
    <section aria-labelledby="titulo-equipe" className="flex flex-col gap-4 rounded-medio border border-linha bg-papel p-4 sm:p-5">
      <div className="flex items-baseline justify-between gap-3">
        <h3 id="titulo-equipe" className="text-base font-semibold">
          Equipe
        </h3>
        <span className="numeros text-sm text-regua">
          {total} {total === 1 ? 'pessoa' : 'pessoas'}
        </span>
      </div>
      <datalist id="funcoes-obra">
        {FUNCOES.map((f) => (
          <option key={f} value={f} />
        ))}
      </datalist>
      <ul className="flex flex-col gap-3">
        {linhas.map((l, i) => (
          <li key={i} className="grid grid-cols-[minmax(0,1fr)_5rem_auto] gap-2 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_6rem_auto]">
            <label className="sr-only" htmlFor={`funcao-${i}`}>
              Função
            </label>
            <input
              id={`funcao-${i}`}
              list="funcoes-obra"
              value={l.funcao}
              onChange={(e) => mudar(i, 'funcao', e.target.value)}
              placeholder="Função"
              maxLength={80}
              className={classeEntrada}
            />
            <label className="sr-only" htmlFor={`empresa-${i}`}>
              Empreiteira
            </label>
            <input
              id={`empresa-${i}`}
              value={l.empresa_terceira}
              onChange={(e) => mudar(i, 'empresa_terceira', e.target.value)}
              placeholder="Empreiteira (vazio = própria)"
              maxLength={120}
              className={`${classeEntrada} col-span-3 row-start-2 sm:col-span-1 sm:row-start-auto`}
            />
            <label className="sr-only" htmlFor={`qtd-${i}`}>
              Quantidade
            </label>
            <input
              id={`qtd-${i}`}
              inputMode="numeric"
              value={l.quantidade}
              onChange={(e) => mudar(i, 'quantidade', e.target.value.replace(/\D/g, ''))}
              placeholder="Qtd."
              className={`${classeEntrada} numeros text-right`}
            />
            <button
              type="button"
              onClick={() => setLinhas((a) => (a.length === 1 ? [{ funcao: '', empresa_terceira: '', quantidade: '' }] : a.filter((_, j) => j !== i)))}
              aria-label={`Remover linha ${i + 1}`}
              className="flex size-11 items-center justify-center rounded-medio text-regua hover:bg-concreto hover:text-marcador"
            >
              <svg aria-hidden viewBox="0 0 16 16" className="size-4" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="m4 4 8 8M12 4l-8 8" />
              </svg>
            </button>
          </li>
        ))}
      </ul>
      <div className="flex flex-wrap items-center gap-3">
        <Botao type="button" variante="secundario" onClick={() => setLinhas((a) => [...a, { funcao: '', empresa_terceira: '', quantidade: '' }])}>
          Adicionar função
        </Botao>
        <Botao type="button" onClick={salvar} disabled={salvando}>
          {salvando ? 'Salvando…' : 'Salvar equipe'}
        </Botao>
        {mensagem && (
          <p role={mensagem.tipo === 'erro' ? 'alert' : 'status'} className={`text-sm ${mensagem.tipo === 'erro' ? 'text-marcador' : 'text-obra-ok'}`}>
            {mensagem.texto}
          </p>
        )}
      </div>
    </section>
  );
}
