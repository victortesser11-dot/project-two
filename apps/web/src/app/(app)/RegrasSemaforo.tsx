'use client';

import { useActionState } from 'react';
import type { RegraSemaforo } from '@obras/shared';
import { definirRegras, type EstadoForm } from './projetos/[id]/orcamento/acoes';
import { AvisoErro, Botao, Campo, classeEntrada } from '@/components/ui';

/** Regras do semáforo da empresa (só o admin vê e muda). */
export function RegrasSemaforo({ empresaId, regra }: { empresaId: string; regra: RegraSemaforo }) {
  const [estado, acao, salvando] = useActionState<EstadoForm, FormData>(definirRegras, {});
  const e = estado.erros ?? {};
  const v = (c: keyof RegraSemaforo) => estado.valores?.[c] ?? String(regra[c]).replace('.', ',');
  return (
    <form action={acao} className="flex flex-col gap-4">
      <input type="hidden" name="empresa_id" value={empresaId} />
      <div className="grid gap-4 sm:grid-cols-2">
        <fieldset className="flex flex-col gap-3">
          <legend className="mb-2 text-sm font-semibold">Prazo (dias de atraso)</legend>
          <Campo rotulo="Amarelo a partir de" nome="r-atraso-amarelo" erro={e.atraso_amarelo_dias}>
            <input id="r-atraso-amarelo" name="atraso_amarelo_dias" inputMode="numeric" defaultValue={v('atraso_amarelo_dias')} className={`${classeEntrada} numeros`} />
          </Campo>
          <Campo rotulo="Vermelho a partir de" nome="r-atraso-vermelho" erro={e.atraso_vermelho_dias}>
            <input id="r-atraso-vermelho" name="atraso_vermelho_dias" inputMode="numeric" defaultValue={v('atraso_vermelho_dias')} className={`${classeEntrada} numeros`} />
          </Campo>
        </fieldset>
        <fieldset className="flex flex-col gap-3">
          <legend className="mb-2 text-sm font-semibold">Custo (% gasto acima do que o feito vale)</legend>
          <Campo rotulo="Amarelo a partir de (%)" nome="r-custo-amarelo" erro={e.custo_amarelo_pct}>
            <input id="r-custo-amarelo" name="custo_amarelo_pct" inputMode="decimal" defaultValue={v('custo_amarelo_pct')} className={`${classeEntrada} numeros`} />
          </Campo>
          <Campo rotulo="Vermelho a partir de (%)" nome="r-custo-vermelho" erro={e.custo_vermelho_pct}>
            <input id="r-custo-vermelho" name="custo_vermelho_pct" inputMode="decimal" defaultValue={v('custo_vermelho_pct')} className={`${classeEntrada} numeros`} />
          </Campo>
        </fieldset>
      </div>
      {estado.erroGeral && <AvisoErro>{estado.erroGeral}</AvisoErro>}
      {estado.ok && estado.mensagem && (
        <p role="status" className="text-sm font-semibold text-obra-ok">
          {estado.mensagem}
        </p>
      )}
      <Botao type="submit" disabled={salvando} className="self-start">
        {salvando ? 'Salvando…' : 'Salvar regras'}
      </Botao>
    </form>
  );
}
