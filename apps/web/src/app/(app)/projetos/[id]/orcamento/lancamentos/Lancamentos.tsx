'use client';

import { useActionState, useEffect, useRef, useState, useTransition } from 'react';
import {
  CATEGORIAS_DESPESA,
  formatarData,
  formatarMoeda,
  hojeIso,
  ROTULO_CATEGORIA_DESPESA,
  ROTULO_COMPROMISSO,
  TIPOS_COMPROMISSO,
  type Compromisso,
  type Despesa,
  type Empreiteira,
} from '@obras/shared';
import { encerrarCompromisso, excluirDespesa, registrarDespesa, salvarCompromisso, type EstadoForm } from '../acoes';
import { AvisoErro, Botao, Campo, classeEntrada } from '@/components/ui';

export type TarefaOpcao = { id: string; codigo: string; nome: string };

function SeletorTarefa({ id, tarefas, padrao, erro }: { id: string; tarefas: TarefaOpcao[]; padrao?: string; erro?: string }) {
  return (
    <Campo rotulo="Tarefa" nome={id} erro={erro}>
      <select id={id} name="tarefa_id" defaultValue={padrao ?? ''} className={classeEntrada}>
        <option value="">Escolha a tarefa</option>
        {tarefas.map((t) => (
          <option key={t.id} value={t.id}>
            {t.codigo} {t.nome}
          </option>
        ))}
      </select>
    </Campo>
  );
}

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

export function FormularioDespesa({ projetoId, tarefas, compromissos }: { projetoId: string; tarefas: TarefaOpcao[]; compromissos: Compromisso[] }) {
  const [estado, acao, salvando] = useActionState<EstadoForm, FormData>(registrarDespesa, {});
  const [rodada, setRodada] = useState(0);
  const e = estado.erros ?? {};
  const v = (c: string, p = '') => estado.valores?.[c] ?? p;
  useEffect(() => {
    if (estado.ok) setRodada((r) => r + 1);
  }, [estado]);
  return (
    <form key={rodada} action={acao} className="flex flex-col gap-4" aria-label="Lançar despesa">
      <input type="hidden" name="projeto_id" value={projetoId} />
      <div className="grid gap-4 sm:grid-cols-2">
        <SeletorTarefa id="desp-tarefa" tarefas={tarefas} padrao={v('tarefa_id')} erro={e.tarefa_id} />
        <Campo rotulo="Tipo" nome="desp-categoria" erro={e.categoria}>
          <select id="desp-categoria" name="categoria" defaultValue={v('categoria', 'equipamento')} className={classeEntrada}>
            {CATEGORIAS_DESPESA.map((c) => (
              <option key={c} value={c}>
                {ROTULO_CATEGORIA_DESPESA[c]}
              </option>
            ))}
          </select>
        </Campo>
        <Campo rotulo="Descrição" nome="desp-descricao" erro={e.descricao}>
          <input id="desp-descricao" name="descricao" maxLength={200} defaultValue={v('descricao')} placeholder="Ex.: Aluguel de betoneira (semana)" className={classeEntrada} />
        </Campo>
        <Campo rotulo="Valor (R$)" nome="desp-valor" erro={e.valor}>
          <input id="desp-valor" name="valor" inputMode="decimal" defaultValue={v('valor')} className={`${classeEntrada} numeros`} />
        </Campo>
        <Campo rotulo="Data" nome="desp-data" erro={e.data}>
          <input id="desp-data" name="data" type="date" max={hojeIso()} defaultValue={v('data', hojeIso())} className={`${classeEntrada} numeros`} />
        </Campo>
        <Campo rotulo="Fornecedor" nome="desp-fornecedor" erro={e.fornecedor}>
          <input id="desp-fornecedor" name="fornecedor" maxLength={160} defaultValue={v('fornecedor')} className={classeEntrada} />
        </Campo>
        <Campo rotulo="Documento" nome="desp-documento" erro={e.documento} dica="Nº da nota ou do recibo (opcional)">
          <input id="desp-documento" name="documento" maxLength={60} defaultValue={v('documento')} className={`${classeEntrada} numeros`} />
        </Campo>
        {compromissos.length > 0 && (
          <Campo rotulo="Paga um contrato ou pedido?" nome="desp-compromisso" erro={e.compromisso_id}>
            <select id="desp-compromisso" name="compromisso_id" defaultValue={v('compromisso_id')} className={classeEntrada}>
              <option value="">Não</option>
              {compromissos
                .filter((c) => !c.encerrado)
                .map((c) => (
                  <option key={c.id} value={c.id}>
                    {ROTULO_COMPROMISSO[c.tipo]}: {c.descricao}
                  </option>
                ))}
            </select>
          </Campo>
        )}
      </div>
      <Retorno estado={estado} />
      <Botao type="submit" disabled={salvando} className="self-start">
        {salvando ? 'Lançando…' : 'Lançar despesa'}
      </Botao>
    </form>
  );
}

export function FormularioCompromisso({ projetoId, tarefas, empreiteiras }: { projetoId: string; tarefas: TarefaOpcao[]; empreiteiras: Empreiteira[] }) {
  const [estado, acao, salvando] = useActionState<EstadoForm, FormData>(salvarCompromisso, {});
  const form = useRef<HTMLFormElement>(null);
  const e = estado.erros ?? {};
  const v = (c: string, p = '') => estado.valores?.[c] ?? p;
  useEffect(() => {
    if (estado.ok) form.current?.reset();
  }, [estado]);
  return (
    <form ref={form} action={acao} className="flex flex-col gap-4" aria-label="Lançar contrato ou pedido">
      <input type="hidden" name="projeto_id" value={projetoId} />
      <div className="grid gap-4 sm:grid-cols-2">
        <Campo rotulo="Tipo" nome="comp-tipo" erro={e.tipo}>
          <select id="comp-tipo" name="tipo" defaultValue={v('tipo', 'contrato')} className={classeEntrada}>
            {TIPOS_COMPROMISSO.map((t) => (
              <option key={t} value={t}>
                {ROTULO_COMPROMISSO[t]}
              </option>
            ))}
          </select>
        </Campo>
        <SeletorTarefa id="comp-tarefa" tarefas={tarefas} padrao={v('tarefa_id')} erro={e.tarefa_id} />
        <Campo rotulo="Descrição" nome="comp-descricao" erro={e.descricao}>
          <input id="comp-descricao" name="descricao" maxLength={200} defaultValue={v('descricao')} placeholder="Ex.: Empreitada da alvenaria do térreo" className={classeEntrada} />
        </Campo>
        <Campo rotulo="Valor (R$)" nome="comp-valor" erro={e.valor}>
          <input id="comp-valor" name="valor" inputMode="decimal" defaultValue={v('valor')} className={`${classeEntrada} numeros`} />
        </Campo>
        <Campo rotulo="Data" nome="comp-data" erro={e.data}>
          <input id="comp-data" name="data" type="date" defaultValue={v('data', hojeIso())} className={`${classeEntrada} numeros`} />
        </Campo>
        {empreiteiras.length > 0 && (
          <Campo rotulo="Empreiteira" nome="comp-empreiteira" erro={e.empreiteira_id}>
            <select id="comp-empreiteira" name="empreiteira_id" defaultValue={v('empreiteira_id')} className={classeEntrada}>
              <option value="">Nenhuma (fornecedor)</option>
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
        <Campo rotulo="Fornecedor" nome="comp-fornecedor" erro={e.fornecedor}>
          <input id="comp-fornecedor" name="fornecedor" maxLength={160} defaultValue={v('fornecedor')} className={classeEntrada} />
        </Campo>
        <Campo rotulo="CNPJ" nome="comp-cnpj" erro={e.cnpj} dica="Opcional">
          <input id="comp-cnpj" name="cnpj" inputMode="numeric" defaultValue={v('cnpj')} placeholder="00.000.000/0000-00" className={`${classeEntrada} numeros`} />
        </Campo>
      </div>
      <Retorno estado={estado} />
      <Botao type="submit" disabled={salvando} className="self-start">
        {salvando ? 'Lançando…' : 'Lançar'}
      </Botao>
    </form>
  );
}

export function ListaDespesas({ projetoId, despesas, nomeTarefa }: { projetoId: string; despesas: Despesa[]; nomeTarefa: Record<string, string> }) {
  const [tirando, setTirando] = useState<string | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [ocupado, iniciar] = useTransition();
  if (despesas.length === 0) return <p className="px-4 py-4 text-sm text-regua sm:px-5">Nenhuma despesa lançada.</p>;
  return (
    <>
      {erro && (
        <p role="alert" className="px-4 pt-3 text-sm text-marcador sm:px-5">
          {erro}
        </p>
      )}
      <ul className="divide-y divide-linha">
        {despesas.map((d) => (
          <li key={d.id} className="flex flex-wrap items-center justify-between gap-2 px-4 py-2.5 text-sm sm:px-5">
            <div className="min-w-0">
              <p className="font-semibold">{d.descricao}</p>
              <p className="numeros text-regua">
                {formatarData(d.data)} · {ROTULO_CATEGORIA_DESPESA[d.categoria]} · {d.tarefa_id ? (nomeTarefa[d.tarefa_id] ?? 'Tarefa') : 'Sem tarefa'}
                {d.fornecedor ? ` · ${d.fornecedor}` : ''}
                {d.documento ? ` · ${d.documento}` : ''}
              </p>
            </div>
            <div className="flex items-center gap-2">
              <span className="numeros font-semibold">{formatarMoeda(d.valor)}</span>
              {tirando === d.id ? (
                <>
                  <button
                    type="button"
                    disabled={ocupado}
                    onClick={() =>
                      iniciar(async () => {
                        const r = await excluirDespesa(projetoId, d.id);
                        setErro(r.ok ? null : r.erro);
                        setTirando(null);
                      })
                    }
                    className="min-h-11 rounded-medio bg-marcador px-3 font-semibold text-white"
                  >
                    Tirar mesmo
                  </button>
                  <button type="button" onClick={() => setTirando(null)} className="min-h-11 px-2 font-semibold text-regua">
                    Cancelar
                  </button>
                </>
              ) : (
                <button type="button" onClick={() => setTirando(d.id)} className="min-h-11 px-2 font-semibold text-regua hover:text-marcador">
                  Tirar
                </button>
              )}
            </div>
          </li>
        ))}
      </ul>
    </>
  );
}

export function ListaCompromissos({
  projetoId,
  compromissos,
  pagoPor,
  nomeTarefa,
}: {
  projetoId: string;
  compromissos: Compromisso[];
  pagoPor: Record<string, number>;
  nomeTarefa: Record<string, string>;
}) {
  const [erro, setErro] = useState<string | null>(null);
  const [ocupado, iniciar] = useTransition();
  if (compromissos.length === 0) return <p className="px-4 py-4 text-sm text-regua sm:px-5">Nenhum contrato ou pedido lançado.</p>;
  return (
    <>
      {erro && (
        <p role="alert" className="px-4 pt-3 text-sm text-marcador sm:px-5">
          {erro}
        </p>
      )}
      <ul className="divide-y divide-linha">
        {compromissos.map((c) => {
          const pago = pagoPor[c.id] ?? 0;
          return (
            <li key={c.id} className={`flex flex-wrap items-center justify-between gap-2 px-4 py-2.5 text-sm sm:px-5 ${c.encerrado ? 'bg-concreto/50' : ''}`}>
              <div className="min-w-0">
                <p className="font-semibold">
                  {ROTULO_COMPROMISSO[c.tipo]}: {c.descricao}
                  {c.encerrado && <span className="ml-2 text-xs font-semibold text-regua">(encerrado)</span>}
                </p>
                <p className="numeros text-regua">
                  {formatarData(c.data)} · {c.tarefa_id ? (nomeTarefa[c.tarefa_id] ?? 'Tarefa') : 'Sem tarefa'}
                  {c.fornecedor ? ` · ${c.fornecedor}` : ''} · pago {formatarMoeda(pago)} de {formatarMoeda(c.valor)}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <span className="numeros font-semibold">{formatarMoeda(c.valor)}</span>
                <button
                  type="button"
                  disabled={ocupado}
                  onClick={() =>
                    iniciar(async () => {
                      const r = await encerrarCompromisso(projetoId, c.id, !c.encerrado);
                      setErro(r.ok ? null : r.erro);
                    })
                  }
                  className="min-h-11 rounded-medio border border-campo/60 px-3 font-semibold hover:border-grafite"
                >
                  {c.encerrado ? 'Reabrir' : 'Encerrar'}
                </button>
              </div>
            </li>
          );
        })}
      </ul>
    </>
  );
}
