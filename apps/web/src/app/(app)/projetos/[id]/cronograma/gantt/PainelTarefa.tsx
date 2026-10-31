'use client';

import Link from 'next/link';
import { useActionState, useState, useTransition } from 'react';
import {
  diasEntre,
  formatarData,
  formatarMoeda,
  ROTULO_DEPENDENCIA,
  SIGLA_DEPENDENCIA,
  TIPOS_DEPENDENCIA,
  type Dependencia,
  type ItemEap,
} from '@obras/shared';
import { removerDependencia, salvarDependencia, type EstadoDependencia } from '../acoes';
import { AvisoErro, Botao, Campo, classeEntrada } from '@/components/ui';
import { desvioDaBase } from './escala';

function textoDefasagem(d: number) {
  if (d === 0) return '';
  return d > 0 ? ` + ${d} ${d === 1 ? 'dia' : 'dias'}` : ` − ${-d} ${d === -1 ? 'dia' : 'dias'}`;
}

/** Detalhes de uma tarefa no Gantt e as ligações dela com outras tarefas. */
export function PainelTarefa({
  projetoId,
  tarefa,
  itens,
  dependencias,
  podeEditar,
  onFechar,
}: {
  projetoId: string;
  tarefa: ItemEap;
  itens: ItemEap[];
  dependencias: Dependencia[];
  podeEditar: boolean;
  onFechar: () => void;
}) {
  const porId = new Map(itens.map((i) => [i.id, i]));
  const antes = dependencias.filter((d) => d.sucessora_id === tarefa.id);
  const depois = dependencias.filter((d) => d.predecessora_id === tarefa.id);
  const desvio = desvioDaBase(tarefa);
  const duracao = tarefa.inicio_previsto && tarefa.fim_previsto ? diasEntre(tarefa.inicio_previsto, tarefa.fim_previsto) + 1 : null;

  const [estado, acao, salvando] = useActionState<EstadoDependencia, FormData>(salvarDependencia, {});
  const [removendo, setRemovendo] = useState<string | null>(null);
  const [mensagem, setMensagem] = useState<{ tipo: 'ok' | 'erro'; texto: string } | null>(null);
  const [, iniciar] = useTransition();

  const ligadas = new Set(antes.map((d) => d.predecessora_id));
  const candidatas = itens.filter((i) => i.tipo === 'tarefa' && i.id !== tarefa.id && !ligadas.has(i.id));

  function remover(d: Dependencia) {
    setRemovendo(d.id);
    setMensagem(null);
    iniciar(async () => {
      const r = await removerDependencia(projetoId, d.id);
      setRemovendo(null);
      setMensagem(r.ok ? { tipo: 'ok', texto: r.mensagem ?? 'Ligação removida.' } : { tipo: 'erro', texto: r.erro });
    });
  }

  const e = estado.erros ?? {};

  return (
    <section
      aria-labelledby="titulo-tarefa"
      className="rounded-medio border border-cianotipia/40 bg-papel"
    >
      <header className="flex items-start justify-between gap-3 border-b border-linha px-4 py-3 sm:px-5">
        <div className="min-w-0">
          <p className="numeros text-xs text-regua">Tarefa {tarefa.codigo}</p>
          <h3 id="titulo-tarefa" className="text-base font-semibold break-words">
            {tarefa.nome}
          </h3>
        </div>
        <button
          type="button"
          onClick={onFechar}
          className="flex size-11 shrink-0 items-center justify-center rounded-medio text-regua hover:bg-concreto hover:text-grafite"
          aria-label="Fechar detalhes da tarefa"
        >
          <svg aria-hidden viewBox="0 0 16 16" className="size-4" fill="none" stroke="currentColor" strokeWidth="2">
            <path d="m4 4 8 8M12 4l-8 8" />
          </svg>
        </button>
      </header>

      <dl className="numeros grid grid-cols-2 gap-px bg-linha text-sm sm:grid-cols-4">
        <Dado rotulo="Previsto" valor={tarefa.inicio_previsto ? `${formatarData(tarefa.inicio_previsto)} a ${formatarData(tarefa.fim_previsto)}` : 'Sem datas'} />
        <Dado rotulo="Duração" valor={duracao !== null ? `${duracao} ${duracao === 1 ? 'dia' : 'dias'}` : '—'} />
        <Dado
          rotulo="Linha de base"
          valor={tarefa.inicio_base ? `${formatarData(tarefa.inicio_base)} a ${formatarData(tarefa.fim_base)}` : 'Fora da base'}
          nota={
            desvio === null || desvio === 0
              ? desvio === 0
                ? 'Termina na data da base'
                : undefined
              : desvio > 0
                ? `${desvio} ${desvio === 1 ? 'dia' : 'dias'} depois da base`
                : `${-desvio} ${desvio === -1 ? 'dia' : 'dias'} antes da base`
          }
          alerta={desvio !== null && desvio > 0}
        />
        <Dado rotulo="Custo previsto" valor={formatarMoeda(tarefa.custo_previsto)} />
      </dl>

      <div className="grid gap-6 px-4 py-5 sm:px-5 lg:grid-cols-2">
        <div className="flex flex-col gap-4">
          <ListaLigacoes
            titulo="Depende de"
            vazio="Não depende de nenhuma tarefa."
            ligacoes={antes}
            outra={(d) => porId.get(d.predecessora_id)}
            podeEditar={podeEditar}
            removendo={removendo}
            onRemover={remover}
          />
          <ListaLigacoes
            titulo="Libera"
            vazio="Nenhuma tarefa espera por esta."
            ligacoes={depois}
            outra={(d) => porId.get(d.sucessora_id)}
            podeEditar={podeEditar}
            removendo={removendo}
            onRemover={remover}
          />
          {mensagem && (
            <p role={mensagem.tipo === 'erro' ? 'alert' : 'status'} className={`text-sm ${mensagem.tipo === 'erro' ? 'text-marcador' : 'text-obra-ok'}`}>
              {mensagem.texto}
            </p>
          )}
          {podeEditar && (
            <p className="text-sm">
              <Link href={`/projetos/${projetoId}/cronograma`} className="font-semibold text-cianotipia hover:underline underline-offset-4">
                Mudar datas e custo na EAP
              </Link>
            </p>
          )}
        </div>

        {podeEditar && (
          <form action={acao} className="flex flex-col gap-4 rounded-medio bg-concreto/70 p-4" aria-label="Ligar a uma tarefa anterior">
            <input type="hidden" name="projeto_id" value={projetoId} />
            <input type="hidden" name="sucessora_id" value={tarefa.id} />
            <p className="font-semibold">Ligar a uma tarefa anterior</p>
            {candidatas.length === 0 ? (
              <p className="text-sm text-regua">Não há outras tarefas para ligar.</p>
            ) : (
              <>
                <Campo rotulo="Tarefa anterior" nome="dep-predecessora" erro={e.predecessora_id}>
                  <select
                    id="dep-predecessora"
                    name="predecessora_id"
                    required
                    defaultValue=""
                    className={classeEntrada}
                    aria-invalid={e.predecessora_id ? true : undefined}
                  >
                    <option value="" disabled>
                      Escolha a tarefa
                    </option>
                    {candidatas.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.codigo} {c.nome}
                      </option>
                    ))}
                  </select>
                </Campo>
                <Campo rotulo="Esta tarefa…" nome="dep-tipo" erro={e.tipo}>
                  <select id="dep-tipo" name="tipo" defaultValue="ti" className={classeEntrada}>
                    {TIPOS_DEPENDENCIA.map((t) => (
                      <option key={t} value={t}>
                        {ROTULO_DEPENDENCIA[t]}
                      </option>
                    ))}
                  </select>
                </Campo>
                <Campo
                  rotulo="Defasagem (dias)"
                  nome="dep-defasagem"
                  erro={e.defasagem_dias}
                  dica="Dias corridos de espera. Ex.: 7 para cura do concreto. Negativo adianta."
                >
                  <input
                    id="dep-defasagem"
                    name="defasagem_dias"
                    inputMode="numeric"
                    placeholder="0"
                    className={classeEntrada}
                    aria-invalid={e.defasagem_dias ? true : undefined}
                  />
                </Campo>
                {estado.erroGeral && <AvisoErro>{estado.erroGeral}</AvisoErro>}
                {estado.ok && estado.mensagem && (
                  <p role="status" className="text-sm text-obra-ok">
                    {estado.mensagem}
                  </p>
                )}
                <Botao type="submit" disabled={salvando} className="self-start">
                  {salvando ? 'Ligando…' : 'Ligar tarefas'}
                </Botao>
              </>
            )}
          </form>
        )}
      </div>
    </section>
  );
}

function Dado({ rotulo, valor, nota, alerta }: { rotulo: string; valor: string; nota?: string; alerta?: boolean }) {
  return (
    <div className="bg-papel px-4 py-3 sm:px-5">
      <dt className="text-regua">{rotulo}</dt>
      <dd className="mt-0.5 font-semibold">{valor}</dd>
      {nota && <dd className={`text-xs ${alerta ? 'font-semibold text-marcador' : 'text-regua'}`}>{nota}</dd>}
    </div>
  );
}

function ListaLigacoes({
  titulo,
  vazio,
  ligacoes,
  outra,
  podeEditar,
  removendo,
  onRemover,
}: {
  titulo: string;
  vazio: string;
  ligacoes: Dependencia[];
  outra: (d: Dependencia) => ItemEap | undefined;
  podeEditar: boolean;
  removendo: string | null;
  onRemover: (d: Dependencia) => void;
}) {
  return (
    <div>
      <h4 className="text-sm font-semibold">{titulo}</h4>
      {ligacoes.length === 0 ? (
        <p className="mt-1 text-sm text-regua">{vazio}</p>
      ) : (
        <ul className="mt-2 flex flex-col divide-y divide-linha rounded-medio border border-linha">
          {ligacoes.map((d) => {
            const item = outra(d);
            return (
              <li key={d.id} className="flex items-center justify-between gap-3 px-3 py-2 text-sm">
                <span className="min-w-0">
                  <span className="numeros mr-1.5 text-xs text-regua">{item?.codigo}</span>
                  <span className="break-words">{item?.nome ?? 'Tarefa removida'}</span>
                  <span className="numeros ml-2 inline-block rounded bg-cianotipia-claro px-1.5 text-xs font-semibold text-cianotipia">
                    {SIGLA_DEPENDENCIA[d.tipo]}
                    {textoDefasagem(d.defasagem_dias)}
                  </span>
                </span>
                {podeEditar && (
                  <button
                    type="button"
                    onClick={() => onRemover(d)}
                    disabled={removendo === d.id}
                    className="min-h-11 shrink-0 px-2 text-sm font-semibold text-marcador hover:underline underline-offset-4 disabled:text-regua"
                  >
                    {removendo === d.id ? 'Removendo…' : 'Remover'}
                  </button>
                )}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
