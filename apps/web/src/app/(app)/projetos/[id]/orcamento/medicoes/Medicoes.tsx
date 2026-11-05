'use client';

import { useActionState, useState, useTransition } from 'react';
import {
  ROTULO_CRITERIO_MEDICAO,
  type ContratoMedicao,
  type CriterioMedicao,
  type Empreiteira,
  type ItemContratoMedicao,
} from '@obras/shared';
import type { EstadoForm } from '../acoes';
import { atualizarContratoMedicao, criarContratoMedicao, definirItemContrato, gerarMedicao, removerItemContrato } from './acoes';
import { AvisoErro, Botao, Campo, classeEntrada } from '@/components/ui';
import { useConfirmar } from '@/components/Confirmar';
import { avisar } from '@/lib/avisos';

export type EtapaOpcao = { codigo: string; nome: string; tarefas: string[] };
export type TarefaOpcao = { id: string; codigo: string; nome: string; unidade: string | null; quantidade: number | null; custo: number | null };

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

const paraCampo = (n: number) => String(n).replace('.', ',');

/** Novo contrato de medição: com o cliente (itens de toda a EAP) ou com uma empreiteira (etapas escolhidas). */
export function FormularioContrato({
  projetoId,
  temCliente,
  empreiteiras,
  etapas,
}: {
  projetoId: string;
  temCliente: boolean;
  empreiteiras: Empreiteira[];
  etapas: EtapaOpcao[];
}) {
  const [estado, acao, salvando] = useActionState<EstadoForm, FormData>(criarContratoMedicao, {});
  const [parte, setParte] = useState<'cliente' | 'empreiteiro'>(temCliente ? 'empreiteiro' : 'cliente');
  const e = estado.erros ?? {};
  const v = (c: string, p = '') => estado.valores?.[c] ?? p;
  return (
    <form action={acao} className="flex flex-col gap-4" aria-label="Novo contrato de medição">
      <input type="hidden" name="projeto_id" value={projetoId} />
      <fieldset className="flex flex-col gap-2">
        <legend className="mb-1 text-sm font-semibold">Quem é medido</legend>
        <div className="flex flex-wrap gap-2">
          {(['cliente', 'empreiteiro'] as const).map((p) => (
            <label
              key={p}
              className={`flex min-h-11 cursor-pointer items-center gap-2 rounded-medio border px-4 ${
                parte === p ? 'border-cianotipia bg-cianotipia-claro font-semibold' : 'border-linha bg-papel'
              } ${p === 'cliente' && temCliente ? 'pointer-events-none opacity-50' : ''}`}
            >
              <input
                type="radio"
                name="parte"
                value={p}
                checked={parte === p}
                disabled={p === 'cliente' && temCliente}
                onChange={() => setParte(p)}
                className="size-4 accent-cianotipia"
              />
              {p === 'cliente' ? 'O cliente paga a obra' : 'Pagamos uma empreiteira'}
            </label>
          ))}
        </div>
      </fieldset>

      <div className="grid gap-4 sm:grid-cols-2">
        <Campo rotulo={parte === 'cliente' ? 'Nome do cliente' : 'Nome do contrato'} nome="ctr-nome" erro={e.nome}>
          <input id="ctr-nome" name="nome" defaultValue={v('nome')} className={classeEntrada} placeholder={parte === 'cliente' ? 'João e Maria Silva' : 'Empreitada de alvenaria'} />
        </Campo>
        {parte === 'empreiteiro' && (
          <Campo rotulo="Empreiteira" nome="ctr-emp" erro={e.empreiteira_id}>
            <select id="ctr-emp" name="empreiteira_id" defaultValue={v('empreiteira_id')} className={classeEntrada}>
              <option value="">Escolha a empreiteira</option>
              {empreiteiras
                .filter((x) => x.ativa)
                .map((x) => (
                  <option key={x.id} value={x.id}>
                    {x.nome}
                  </option>
                ))}
            </select>
          </Campo>
        )}
      </div>

      <div className="grid gap-4 sm:grid-cols-3">
        {parte === 'cliente' && (
          <Campo rotulo="BDI (%)" nome="ctr-bdi" erro={e.bdi_pct} dica="Somado ao custo para chegar ao preço de venda">
            <input id="ctr-bdi" name="bdi_pct" inputMode="decimal" defaultValue={v('bdi_pct', '0')} className={`${classeEntrada} numeros`} />
          </Campo>
        )}
        <Campo rotulo="Retenção (%)" nome="ctr-ret" erro={e.retencao_pct} dica="Retida em cada medição (garantia)">
          <input id="ctr-ret" name="retencao_pct" inputMode="decimal" defaultValue={v('retencao_pct', parte === 'cliente' ? '0' : '5')} className={`${classeEntrada} numeros`} />
        </Campo>
        <Campo rotulo="Prazo de pagamento (dias)" nome="ctr-prazo" erro={e.prazo_pagamento_dias} dica="Contados da aprovação">
          <input id="ctr-prazo" name="prazo_pagamento_dias" inputMode="numeric" defaultValue={v('prazo_pagamento_dias', '10')} className={`${classeEntrada} numeros`} />
        </Campo>
      </div>

      {parte === 'empreiteiro' && (
        <>
          <fieldset className="flex flex-col gap-2">
            <legend className="mb-1 text-sm font-semibold">Etapas da empreitada</legend>
            <div className="grid gap-1 sm:grid-cols-2">
              {etapas.map((et) => (
                <label key={et.codigo} className="flex min-h-11 items-center gap-3">
                  <input type="checkbox" name="etapas" value={et.tarefas.join(',')} className="size-5 accent-cianotipia" />
                  <span>
                    <span className="numeros text-regua">{et.codigo}</span> {et.nome}{' '}
                    <span className="text-sm text-regua">({et.tarefas.length} tarefas)</span>
                  </span>
                </label>
              ))}
            </div>
            {e.etapas && <p className="text-sm text-marcador">{e.etapas}</p>}
          </fieldset>
          <fieldset className="flex flex-col gap-2">
            <legend className="mb-1 text-sm font-semibold">Preço de partida dos itens</legend>
            <label className="flex min-h-11 items-center gap-3">
              <input type="radio" name="base" value="mao_obra" defaultChecked className="size-4 accent-cianotipia" />
              Mão de obra da composição de custo (quando houver)
            </label>
            <label className="flex min-h-11 items-center gap-3">
              <input type="radio" name="base" value="custo" className="size-4 accent-cianotipia" />
              Custo previsto inteiro da tarefa
            </label>
          </fieldset>
        </>
      )}

      <p className="text-sm text-regua">
        Os itens saem da EAP: tarefa com unidade e quantidade é medida na unidade dela (m², m³, kg…), com preço unitário = valor ÷ quantidade; sem
        unidade, é medida em %. Você ajusta preços e quantidades depois.
      </p>
      <Retorno estado={estado} />
      <div>
        <Botao type="submit" disabled={salvando}>
          {salvando ? 'Criando…' : 'Criar contrato de medição'}
        </Botao>
      </div>
    </form>
  );
}

export function FormularioAtualizarContrato({ projetoId, contrato }: { projetoId: string; contrato: ContratoMedicao }) {
  const [estado, acao, salvando] = useActionState<EstadoForm, FormData>(atualizarContratoMedicao, {});
  const e = estado.erros ?? {};
  return (
    <form action={acao} className="flex flex-col gap-4" aria-label="Ajustar contrato">
      <input type="hidden" name="projeto_id" value={projetoId} />
      <input type="hidden" name="contrato_id" value={contrato.id} />
      <input type="hidden" name="parte" value={contrato.parte} />
      {contrato.empreiteira_id && <input type="hidden" name="empreiteira_id" value={contrato.empreiteira_id} />}
      <div className="grid gap-4 sm:grid-cols-3">
        <Campo rotulo="Nome" nome="aj-nome" erro={e.nome}>
          <input id="aj-nome" name="nome" defaultValue={contrato.nome} className={classeEntrada} />
        </Campo>
        <Campo rotulo="Retenção (%)" nome="aj-ret" erro={e.retencao_pct}>
          <input id="aj-ret" name="retencao_pct" inputMode="decimal" defaultValue={paraCampo(contrato.retencao_pct)} className={`${classeEntrada} numeros`} />
        </Campo>
        <Campo rotulo="Prazo de pagamento (dias)" nome="aj-prazo" erro={e.prazo_pagamento_dias}>
          <input id="aj-prazo" name="prazo_pagamento_dias" inputMode="numeric" defaultValue={contrato.prazo_pagamento_dias} className={`${classeEntrada} numeros`} />
        </Campo>
      </div>
      <Retorno estado={estado} />
      <div>
        <Botao type="submit" variante="secundario" disabled={salvando}>
          {salvando ? 'Salvando…' : 'Salvar contrato'}
        </Botao>
      </div>
    </form>
  );
}

export function FormularioGerarMedicao({ projetoId, contratoId, padrao, minimo }: { projetoId: string; contratoId: string; padrao: string; minimo: string | null }) {
  const [estado, acao, salvando] = useActionState<EstadoForm, FormData>(gerarMedicao, {});
  const e = estado.erros ?? {};
  return (
    <form action={acao} className="flex flex-col gap-3 sm:flex-row sm:items-end" aria-label="Gerar medição">
      <input type="hidden" name="projeto_id" value={projetoId} />
      <input type="hidden" name="contrato_id" value={contratoId} />
      <div className="sm:w-56">
        <Campo rotulo="Medir até o dia" nome="med-fim" erro={e.fim}>
          <input id="med-fim" type="date" name="fim" defaultValue={estado.valores?.fim ?? padrao} min={minimo ?? undefined} max={padrao} className={classeEntrada} />
        </Campo>
      </div>
      <Botao type="submit" disabled={salvando}>
        {salvando ? 'Calculando…' : 'Gerar medição pelo avanço'}
      </Botao>
      <div className="sm:flex-1">
        <Retorno estado={estado} />
      </div>
    </form>
  );
}

/** Editar o item do contrato (critério, unidade, quantidade, preço) ou acrescentar uma tarefa. */
export function FormularioItem({
  projetoId,
  contratoId,
  item,
  tarefas,
}: {
  projetoId: string;
  contratoId: string;
  item?: ItemContratoMedicao;
  tarefas?: TarefaOpcao[];
}) {
  const [estado, acao, salvando] = useActionState<EstadoForm, FormData>(definirItemContrato, {});
  const [criterio, setCriterio] = useState<CriterioMedicao>(item?.criterio ?? 'quantidade');
  const e = estado.erros ?? {};
  const v = (c: string, p = '') => estado.valores?.[c] ?? p;
  return (
    <form action={acao} className="flex flex-col gap-3" aria-label={item ? 'Ajustar item do contrato' : 'Acrescentar item ao contrato'}>
      <input type="hidden" name="projeto_id" value={projetoId} />
      <input type="hidden" name="contrato_id" value={contratoId} />
      {item ? (
        <input type="hidden" name="tarefa_id" value={item.tarefa_id} />
      ) : (
        <Campo rotulo="Tarefa" nome={`it-tarefa-${contratoId}`} erro={e.tarefa_id}>
          <select id={`it-tarefa-${contratoId}`} name="tarefa_id" defaultValue={v('tarefa_id')} className={classeEntrada}>
            <option value="">Escolha a tarefa</option>
            {(tarefas ?? []).map((t) => (
              <option key={t.id} value={t.id}>
                {t.codigo} {t.nome}
              </option>
            ))}
          </select>
        </Campo>
      )}
      <div className="grid gap-3 sm:grid-cols-4">
        <Campo rotulo="Critério" nome={`it-crit-${item?.id ?? 'novo'}`}>
          <select
            id={`it-crit-${item?.id ?? 'novo'}`}
            name="criterio"
            value={criterio}
            onChange={(ev) => setCriterio(ev.target.value as CriterioMedicao)}
            className={classeEntrada}
          >
            {(['quantidade', 'percentual'] as const).map((c) => (
              <option key={c} value={c}>
                {ROTULO_CRITERIO_MEDICAO[c]}
              </option>
            ))}
          </select>
        </Campo>
        {criterio === 'quantidade' ? (
          <>
            <Campo rotulo="Unidade" nome={`it-un-${item?.id ?? 'novo'}`} erro={e.unidade}>
              <input id={`it-un-${item?.id ?? 'novo'}`} name="unidade" defaultValue={v('unidade', item && item.unidade !== '%' ? item.unidade : '')} className={classeEntrada} placeholder="m²" />
            </Campo>
            <Campo rotulo="Quantidade" nome={`it-qtd-${item?.id ?? 'novo'}`} erro={e.quantidade}>
              <input
                id={`it-qtd-${item?.id ?? 'novo'}`}
                name="quantidade"
                inputMode="decimal"
                defaultValue={v('quantidade', item && item.criterio === 'quantidade' ? paraCampo(item.quantidade) : '')}
                className={`${classeEntrada} numeros`}
              />
            </Campo>
            <Campo rotulo="Preço unitário (R$)" nome={`it-pu-${item?.id ?? 'novo'}`} erro={e.preco_unitario}>
              <input
                id={`it-pu-${item?.id ?? 'novo'}`}
                name="preco_unitario"
                inputMode="decimal"
                defaultValue={v('preco_unitario', item && item.criterio === 'quantidade' ? paraCampo(item.preco_unitario) : '')}
                className={`${classeEntrada} numeros`}
              />
            </Campo>
          </>
        ) : (
          <Campo rotulo="Valor do serviço (R$)" nome={`it-valor-${item?.id ?? 'novo'}`} erro={e.valor_total}>
            <input
              id={`it-valor-${item?.id ?? 'novo'}`}
              name="valor_total"
              inputMode="decimal"
              defaultValue={v('valor_total', item ? paraCampo(item.valor_total) : '')}
              className={`${classeEntrada} numeros`}
            />
          </Campo>
        )}
      </div>
      <Retorno estado={estado} />
      <div>
        <Botao type="submit" variante="secundario" disabled={salvando}>
          {salvando ? 'Salvando…' : item ? 'Salvar item' : 'Acrescentar ao contrato'}
        </Botao>
      </div>
    </form>
  );
}

export function RemoverItem({ projetoId, itemId, nome }: { projetoId: string; itemId: string; nome: string }) {
  const [erro, setErro] = useState<string | null>(null);
  const [rodando, iniciar] = useTransition();
  const confirmar = useConfirmar();
  return (
    <div className="flex flex-col gap-2">
      <Botao
        type="button"
        variante="discreto"
        disabled={rodando}
        onClick={async () => {
          const sim = await confirmar({
            titulo: 'Tirar do contrato?',
            texto: `${nome} deixa de ser medido neste contrato. Dá para acrescentar de novo depois.`,
            confirmar: 'Tirar do contrato',
            perigo: true,
          });
          if (!sim) return;
          iniciar(async () => {
            const r = await removerItemContrato(projetoId, itemId);
            setErro(r.ok ? null : r.erro);
            if (r.ok) avisar.ok(`${nome} saiu do contrato.`);
          });
        }}
      >
        Tirar do contrato
      </Botao>
      {erro && <AvisoErro>{erro}</AvisoErro>}
    </div>
  );
}

