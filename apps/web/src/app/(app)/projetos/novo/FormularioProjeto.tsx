'use client';

import Link from 'next/link';
import { useActionState } from 'react';
import { ROTULO_STATUS, STATUS_PROJETO } from '@obras/shared';
import { criarProjeto, type EstadoFormulario } from '../../acoes';
import { AvisoErro, Botao, Campo, classeBotao, classeEntrada } from '@/components/ui';

export function FormularioProjeto() {
  const [estado, acao, salvando] = useActionState<EstadoFormulario, FormData>(criarProjeto, {});
  const v = estado.valores ?? {};
  const e = estado.erros ?? {};

  return (
    <form action={acao} className="flex flex-col gap-6" noValidate>
      {estado.erroGeral && <AvisoErro>{estado.erroGeral}</AvisoErro>}

      <Campo rotulo="Nome da obra" nome="nome" erro={e.nome}>
        <input id="nome" name="nome" required autoFocus defaultValue={v.nome} aria-invalid={Boolean(e.nome)} className={classeEntrada} placeholder="Residencial Aurora, bloco B" />
      </Campo>

      <Campo rotulo="Endereço" nome="endereco" erro={e.endereco}>
        <input id="endereco" name="endereco" defaultValue={v.endereco} aria-invalid={Boolean(e.endereco)} className={classeEntrada} autoComplete="street-address" />
      </Campo>

      <div className="grid gap-6 sm:grid-cols-2">
        <Campo rotulo="Início" nome="data_inicio" erro={e.data_inicio}>
          <input id="data_inicio" name="data_inicio" type="date" defaultValue={v.data_inicio} aria-invalid={Boolean(e.data_inicio)} className={classeEntrada} />
        </Campo>
        <Campo rotulo="Fim previsto" nome="data_fim_prevista" erro={e.data_fim_prevista}>
          <input id="data_fim_prevista" name="data_fim_prevista" type="date" defaultValue={v.data_fim_prevista} aria-invalid={Boolean(e.data_fim_prevista)} className={classeEntrada} />
        </Campo>
      </div>

      <div className="grid gap-6 sm:grid-cols-2">
        <Campo rotulo="Orçamento total (R$)" nome="orcamento_total" erro={e.orcamento_total} dica="Pode ajustar depois, quando montar o orçamento por etapa.">
          <input id="orcamento_total" name="orcamento_total" inputMode="decimal" defaultValue={v.orcamento_total} aria-invalid={Boolean(e.orcamento_total)} className={`${classeEntrada} numeros`} placeholder="4.500.000,00" />
        </Campo>
        <Campo rotulo="Situação" nome="status" erro={e.status}>
          <select id="status" name="status" defaultValue={v.status ?? 'planejamento'} className={classeEntrada}>
            {STATUS_PROJETO.map((s) => (
              <option key={s} value={s}>
                {ROTULO_STATUS[s]}
              </option>
            ))}
          </select>
        </Campo>
      </div>

      <div className="flex flex-wrap items-center gap-3 border-t border-linha pt-6">
        <Botao type="submit" disabled={salvando}>
          {salvando ? 'Criando projeto…' : 'Criar projeto'}
        </Botao>
        <Link href="/" className={classeBotao('secundario')}>
          Cancelar
        </Link>
      </div>
    </form>
  );
}
