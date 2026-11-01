'use client';

import { useActionState, useEffect, useState } from 'react';
import type { ComposicaoCusto } from '@obras/shared';
import { definirComposicao, salvarVersao, type EstadoForm } from './acoes';
import { AvisoErro, Botao, Campo, classeEntrada } from '@/components/ui';

const brl = (v: number | null | undefined) => (v === null || v === undefined || v === 0 ? '' : v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }));

function Retorno({ estado }: { estado: EstadoForm }) {
  if (estado.erroGeral) return <AvisoErro>{estado.erroGeral}</AvisoErro>;
  if (estado.ok && estado.mensagem)
    return (
      <p role="status" className="text-sm font-semibold text-obra-ok">
        {estado.mensagem}
      </p>
    );
  return null;
}

/** Composição do custo de uma tarefa: o total vira o custo previsto dela. */
export function FormularioComposicao({
  projetoId,
  tarefaId,
  composicao,
  custoAtual,
  aoSalvar,
}: {
  projetoId: string;
  tarefaId: string;
  composicao: ComposicaoCusto | undefined;
  custoAtual: number | null;
  aoSalvar?: () => void;
}) {
  const [estado, acao, salvando] = useActionState<EstadoForm, FormData>(definirComposicao, {});
  const e = estado.erros ?? {};
  useEffect(() => {
    if (estado.ok) aoSalvar?.();
  }, [estado, aoSalvar]);
  const campos: [keyof ComposicaoCusto, string][] = [
    ['material', 'Material'],
    ['mao_obra', 'Mão de obra'],
    ['equipamento', 'Equipamento'],
    ['outros', 'Outros'],
  ];
  return (
    <form action={acao} className="flex flex-col gap-3" aria-label="Composição do custo da tarefa">
      <input type="hidden" name="projeto_id" value={projetoId} />
      <input type="hidden" name="tarefa_id" value={tarefaId} />
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {campos.map(([nome, rotulo]) => (
          <Campo key={nome} rotulo={`${rotulo} (R$)`} nome={`comp-${tarefaId}-${nome}`} erro={e[nome]}>
            <input
              id={`comp-${tarefaId}-${nome}`}
              name={nome}
              inputMode="decimal"
              defaultValue={estado.valores?.[nome] ?? brl(composicao?.[nome] as number | undefined)}
              className={`${classeEntrada} numeros text-right`}
            />
          </Campo>
        ))}
      </div>
      <p className="text-sm text-regua">
        {composicao
          ? 'O custo da tarefa é a soma destes valores. Apague todos para voltar a digitar o total direto na EAP.'
          : custoAtual
            ? 'Hoje a tarefa tem só o total. Ao separar, o total passa a ser a soma.'
            : 'Separe o custo para ver quanto da obra é material, mão de obra e equipamento.'}
      </p>
      <Retorno estado={estado} />
      <Botao type="submit" disabled={salvando} className="self-start">
        {salvando ? 'Salvando…' : 'Salvar composição'}
      </Botao>
    </form>
  );
}

export function FormularioVersao({ projetoId }: { projetoId: string }) {
  const [estado, acao, salvando] = useActionState<EstadoForm, FormData>(salvarVersao, {});
  const [nome, setNome] = useState('');
  useEffect(() => {
    if (estado.ok) setNome('');
  }, [estado]);
  return (
    <form action={acao} className="flex flex-col gap-2">
      <input type="hidden" name="projeto_id" value={projetoId} />
      <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
        <div className="flex flex-1 flex-col gap-1.5">
          <label htmlFor="nome-versao" className="text-sm font-semibold">
            Nome da versão
          </label>
          <input id="nome-versao" name="nome" value={nome} onChange={(e) => setNome(e.target.value)} maxLength={80} placeholder="Ex.: Orçamento aprovado pelo cliente" className={classeEntrada} />
        </div>
        <Botao type="submit" disabled={salvando || nome.trim().length < 2}>
          {salvando ? 'Guardando…' : 'Guardar versão de hoje'}
        </Botao>
      </div>
      {estado.erros?.nome && <p className="text-sm text-marcador">{estado.erros.nome}</p>}
      <Retorno estado={estado} />
    </form>
  );
}
