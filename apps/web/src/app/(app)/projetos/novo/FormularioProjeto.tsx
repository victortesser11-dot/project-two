'use client';

import Link from 'next/link';
import { useActionState, useState } from 'react';
import { CalendarRange } from 'lucide-react';
import { formatarData, ROTULO_STATUS, STATUS_PROJETO, type Projeto } from '@obras/shared';
import { criarProjeto, editarProjeto, type EstadoFormulario } from '../../acoes';
import { AvisoErro, Botao, Campo, classeBotao, classeEntrada } from '@/components/ui';

type ObraEditada = Pick<Projeto, 'id' | 'nome' | 'endereco' | 'data_inicio' | 'data_fim_prevista' | 'orcamento_total' | 'status'> & {
  /** A obra já tem localização (latitude e longitude) para o clima. */
  temLocalizacao?: boolean;
};

/** Valor do banco ("6400000.00") no jeito que o campo espera ("6.400.000,00"). */
function emReais(valor: number | string | null): string {
  if (valor === null || valor === '') return '';
  const n = Number(valor);
  return Number.isFinite(n) ? n.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : '';
}

/**
 * Formulário da obra: cria (sem `projeto`) ou corrige os dados de uma obra que já existe.
 * `cronograma` (primeiro início e último término das tarefas) oferece preencher as datas com um toque.
 */
export function FormularioProjeto({ projeto, cronograma }: { projeto?: ObraEditada; cronograma?: { inicio: string; fim: string } | null }) {
  const [estado, acao, salvando] = useActionState<EstadoFormulario, FormData>(projeto ? editarProjeto : criarProjeto, {});
  const inicial: Record<string, string | undefined> = projeto
    ? {
        nome: projeto.nome,
        endereco: projeto.endereco ?? '',
        data_inicio: projeto.data_inicio ?? '',
        data_fim_prevista: projeto.data_fim_prevista ?? '',
        orcamento_total: emReais(projeto.orcamento_total),
        status: projeto.status,
      }
    : {};
  const v = estado.valores ?? inicial;
  const e = estado.erros ?? {};
  // Datas controladas, para o botão "Usar as datas do cronograma" preencher as duas.
  const [inicio, setInicio] = useState(v.data_inicio ?? '');
  const [fim, setFim] = useState(v.data_fim_prevista ?? '');
  const difereDoCronograma = cronograma && (inicio !== cronograma.inicio || fim !== cronograma.fim);

  return (
    <form action={acao} className="flex flex-col gap-6" noValidate>
      {projeto && <input type="hidden" name="projeto_id" value={projeto.id} />}
      {estado.erroGeral && <AvisoErro>{estado.erroGeral}</AvisoErro>}

      <Campo rotulo="Nome da obra" nome="nome" erro={e.nome}>
        <input id="nome" name="nome" required autoFocus={!projeto} defaultValue={v.nome} aria-invalid={Boolean(e.nome)} className={classeEntrada} placeholder="Residencial Aurora, bloco B" />
      </Campo>

      <Campo rotulo="Endereço" nome="endereco" erro={e.endereco}>
        <input
          id="endereco"
          name="endereco"
          defaultValue={v.endereco}
          aria-invalid={Boolean(e.endereco)}
          className={classeEntrada}
          autoComplete="street-address"
          placeholder="Av. Brasil, 1200 - Centro - Canoas/RS"
        />
      </Campo>

      {projeto && (
        <Campo
          rotulo="CEP da obra (opcional)"
          nome="cep"
          erro={e.cep}
          dica={
            projeto.temLocalizacao
              ? 'A obra já tem localização para o clima. Informe um CEP só se quiser trocar.'
              : 'Com o CEP, o clima do diário e o alerta de chuva passam a vir sozinhos.'
          }
        >
          <input id="cep" name="cep" inputMode="numeric" defaultValue={v.cep} aria-invalid={Boolean(e.cep)} className={`${classeEntrada} numeros sm:max-w-48`} placeholder="92000-000" autoComplete="postal-code" />
        </Campo>
      )}

      <div className="grid gap-6 sm:grid-cols-2">
        <Campo rotulo="Início" nome="data_inicio" erro={e.data_inicio}>
          <input id="data_inicio" name="data_inicio" type="date" value={inicio} onChange={(ev) => setInicio(ev.target.value)} aria-invalid={Boolean(e.data_inicio)} className={classeEntrada} />
        </Campo>
        <Campo rotulo="Fim previsto" nome="data_fim_prevista" erro={e.data_fim_prevista}>
          <input id="data_fim_prevista" name="data_fim_prevista" type="date" value={fim} onChange={(ev) => setFim(ev.target.value)} aria-invalid={Boolean(e.data_fim_prevista)} className={classeEntrada} />
        </Campo>
      </div>
      {difereDoCronograma && (
        <div className="-mt-2 flex flex-wrap items-center gap-x-4 gap-y-2 rounded-medio bg-cianotipia-claro px-4 py-3 text-sm">
          <p className="min-w-0 flex-1">
            O cronograma vai de <strong className="numeros font-semibold">{formatarData(cronograma.inicio)}</strong> a{' '}
            <strong className="numeros font-semibold">{formatarData(cronograma.fim)}</strong>.
          </p>
          <button
            type="button"
            className={classeBotao('secundario', 'text-sm')}
            onClick={() => {
              setInicio(cronograma.inicio);
              setFim(cronograma.fim);
            }}
          >
            <CalendarRange aria-hidden className="size-4" />
            Usar as datas do cronograma
          </button>
        </div>
      )}

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
          {projeto ? (salvando ? 'Salvando…' : 'Salvar obra') : salvando ? 'Criando projeto…' : 'Criar projeto'}
        </Botao>
        <Link href={projeto ? `/projetos/${projeto.id}` : '/'} className={classeBotao('secundario')}>
          Cancelar
        </Link>
      </div>
    </form>
  );
}
