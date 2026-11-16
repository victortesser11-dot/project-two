'use client';

import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { CircleAlert, LoaderCircle, ScanEye, ShieldAlert, Sparkles } from 'lucide-react';
import { ROTULO_SITUACAO_FOTO, type SituacaoFoto } from '@obras/shared';
import { Botao } from '@/components/ui';
import { avisar } from '@/lib/avisos';
import { confirmarAvancosDaIa, lerFotosDoDiaComIa, type LeituraFotosPronta } from './acoesIa';

const COR_SITUACAO: Record<SituacaoFoto, string> = {
  concluida: 'bg-obra-ok/10 text-obra-ok',
  avancou: 'bg-cianotipia-claro text-cianotipia',
  sem_evidencia: 'bg-atencao-claro text-atencao',
  nao_visivel: 'bg-concreto text-regua',
};

/**
 * "Ler as fotos com IA" no diário do dia: a IA compara as fotos com as tarefas previstas e sugere o avanço. O
 * engenheiro ou o mestre confere, ajusta o % e grava; o avanço entra pela função de sempre (registrar_avanco).
 */
export function LeituraFotosIa({
  projetoId,
  data,
  qtdFotos,
  anterior,
  restantesHoje,
  podeGravar,
}: {
  projetoId: string;
  data: string;
  qtdFotos: number;
  anterior: LeituraFotosPronta | null;
  restantesHoje: number;
  /** Diário ainda não assinado. */
  podeGravar: boolean;
}) {
  const [leitura, setLeitura] = useState<LeituraFotosPronta | null>(anterior);
  const [erro, setErro] = useState<string | null>(null);
  const [lendo, iniciar] = useTransition();

  function ler() {
    setErro(null);
    iniciar(async () => {
      const r = await lerFotosDoDiaComIa(projetoId, data);
      if (!r.ok) {
        setErro(r.erro);
        return;
      }
      setLeitura(r.valor);
      avisar.ok('Leitura das fotos pronta. Confira o avanço sugerido.');
    });
  }

  return (
    <section aria-labelledby="titulo-fotos-ia" className="cartao overflow-hidden">
      <div className="flex flex-col gap-3 px-4 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-5">
        <div className="flex items-start gap-3">
          <span aria-hidden className="flex size-10 shrink-0 items-center justify-center rounded-medio bg-cianotipia-claro text-cianotipia">
            <Sparkles className="size-5" />
          </span>
          <div>
            <h3 id="titulo-fotos-ia" className="text-base font-semibold">
              Ler as fotos com IA
            </h3>
            <p className="text-sm text-regua">
              A IA olha as fotos do dia e sugere o avanço das tarefas previstas. Você confere antes de gravar.
            </p>
          </div>
        </div>
        <div className="flex flex-col items-start gap-1 sm:items-end">
          <Botao type="button" className="whitespace-nowrap" variante={leitura ? 'secundario' : 'primario'} onClick={ler} disabled={lendo || restantesHoje <= 0}>
            {lendo ? <LoaderCircle aria-hidden className="size-4 animate-spin" /> : <ScanEye aria-hidden className="size-4" />}
            {lendo ? 'Lendo as fotos…' : leitura ? 'Ler de novo' : `Ler ${qtdFotos === 1 ? 'a foto' : `as ${qtdFotos} fotos`}`}
          </Botao>
          <span className="numeros text-xs text-regua" aria-live="polite">
            {lendo ? 'Pode levar até um minuto.' : restantesHoje > 0 ? `Restam ${restantesHoje} leituras hoje` : 'Acabaram as leituras de hoje'}
          </span>
        </div>
      </div>

      {erro && (
        <p role="alert" className="mx-4 mb-4 flex items-start gap-2 rounded-medio bg-marcador-claro px-4 py-3 text-sm text-marcador sm:mx-5">
          <CircleAlert aria-hidden className="mt-0.5 size-4 shrink-0" />
          {erro}
        </p>
      )}

      {leitura && <ResultadoFotos key={leitura.id} projetoId={projetoId} data={data} leitura={leitura} podeGravar={podeGravar} />}
    </section>
  );
}

function ResultadoFotos({
  projetoId,
  data,
  leitura: { leitura, linhas },
  podeGravar,
}: {
  projetoId: string;
  data: string;
  leitura: LeituraFotosPronta;
  podeGravar: boolean;
}) {
  const router = useRouter();
  // Marcadas de início: a IA viu avanço acima do que já estava apontado.
  const [escolha, setEscolha] = useState<Record<string, { marcada: boolean; pct: string }>>(() =>
    Object.fromEntries(
      linhas.map((l) => [
        l.tarefa.id,
        {
          marcada: (l.situacao === 'avancou' || l.situacao === 'concluida') && l.percentual_sugerido !== null && l.percentual_sugerido > Math.round(l.tarefa.percentual),
          pct: l.percentual_sugerido !== null ? String(l.percentual_sugerido) : '',
        },
      ]),
    ),
  );
  const [gravando, iniciar] = useTransition();
  const marcadas = linhas.filter((l) => escolha[l.tarefa.id]?.marcada);

  function gravar() {
    const itens = marcadas.map((l) => ({ tarefaId: l.tarefa.id, percentual: Number(escolha[l.tarefa.id]!.pct.replace(',', '.')) }));
    if (itens.some((i) => !Number.isFinite(i.percentual) || i.percentual < 0 || i.percentual > 100)) {
      avisar.erro('Informe o % de 0 a 100 nas tarefas marcadas.');
      return;
    }
    iniciar(async () => {
      const r = await confirmarAvancosDaIa(projetoId, data, itens);
      if (!r.ok) {
        avisar.erro(r.erro);
        return;
      }
      avisar.ok(`Avanço gravado em ${r.valor} ${r.valor === 1 ? 'tarefa' : 'tarefas'}.`);
      setEscolha((e) => Object.fromEntries(Object.entries(e).map(([k, v]) => [k, { ...v, marcada: false }])));
      router.refresh();
    });
  }

  return (
    <div className="flex flex-col gap-5 border-t border-linha bg-concreto/40 px-4 py-5 sm:px-5">
      <div className="flex flex-col gap-2">
        <p>{leitura.resumo || 'A IA não descreveu as fotos.'}</p>
        <div className="numeros flex flex-wrap gap-2 text-sm">
          {leitura.pessoas !== null && (
            <span className="rounded-medio border border-linha bg-papel px-3 py-1.5">
              <span className="text-regua">Pessoas nas fotos: </span>
              <strong className="font-semibold">{leitura.pessoas}</strong>
            </span>
          )}
          {leitura.maquinas.length > 0 && (
            <span className="rounded-medio border border-linha bg-papel px-3 py-1.5">
              <span className="text-regua">Máquinas: </span>
              {leitura.maquinas.join(', ')}
            </span>
          )}
        </div>
      </div>

      {leitura.riscos.length > 0 && (
        <div className="rounded-medio border border-marcador/30 bg-marcador-claro px-4 py-3 text-sm text-marcador">
          <p className="flex items-center gap-2 font-semibold">
            <ShieldAlert aria-hidden className="size-4" />
            Pontos de segurança e atenção
          </p>
          <ul className="mt-1 list-disc pl-5">
            {leitura.riscos.map((r, i) => (
              <li key={i}>{r}</li>
            ))}
          </ul>
        </div>
      )}

      {linhas.length === 0 ? (
        <p className="text-sm text-regua">Não havia tarefa prevista para este dia nem marcada nas fotos.</p>
      ) : (
        <div>
          <h4 className="text-sm font-semibold tracking-wide text-regua uppercase">Avanço sugerido</h4>
          <ul className="mt-2 divide-y divide-linha rounded-medio border border-linha bg-papel">
            {linhas.map((l) => {
              const e = escolha[l.tarefa.id]!;
              return (
                <li key={l.tarefa.id} className="flex flex-col gap-2 px-3 py-3 sm:flex-row sm:items-center sm:gap-4">
                  <label className="flex min-w-0 flex-1 cursor-pointer items-start gap-3">
                    <input
                      type="checkbox"
                      className="mt-0.5 size-5 shrink-0 accent-cianotipia"
                      checked={e.marcada}
                      disabled={!podeGravar || gravando}
                      onChange={() => setEscolha((x) => ({ ...x, [l.tarefa.id]: { ...e, marcada: !e.marcada } }))}
                    />
                    <span className="min-w-0 text-sm">
                      <span className="numeros mr-1.5 text-regua">{l.tarefa.codigo}</span>
                      <span className="font-medium">{l.tarefa.nome}</span>
                      {l.tarefa.etapa && <span className="block text-xs text-regua">{l.tarefa.etapa}</span>}
                      <span className="mt-1 flex flex-wrap items-center gap-2 text-xs">
                        <span className={`rounded-full px-2 py-0.5 font-semibold ${COR_SITUACAO[l.situacao]}`}>{ROTULO_SITUACAO_FOTO[l.situacao]}</span>
                        <span className="numeros text-regua">estava em {Math.round(l.tarefa.percentual)}%</span>
                      </span>
                      {l.evidencia && <span className="mt-1 block text-xs text-regua">{l.evidencia}</span>}
                    </span>
                  </label>
                  <label className="flex items-center gap-2 pl-8 text-sm sm:pl-0">
                    <span className="sr-only">% feito de {l.tarefa.nome}</span>
                    <input
                      inputMode="decimal"
                      value={e.pct}
                      disabled={!podeGravar || gravando}
                      onChange={(ev) => setEscolha((x) => ({ ...x, [l.tarefa.id]: { marcada: true, pct: ev.target.value } }))}
                      className="numeros min-h-11 w-20 rounded-medio border border-campo bg-papel px-3 text-right text-base"
                      placeholder="—"
                    />
                    %
                  </label>
                </li>
              );
            })}
          </ul>
          {podeGravar ? (
            <div className="mt-3">
              <Botao type="button" onClick={gravar} disabled={gravando || marcadas.length === 0}>
                {gravando && <LoaderCircle aria-hidden className="size-4 animate-spin" />}
                {gravando ? 'Gravando…' : `Gravar avanço de ${marcadas.length} ${marcadas.length === 1 ? 'tarefa' : 'tarefas'}`}
              </Botao>
            </div>
          ) : (
            <p className="mt-3 text-sm text-regua">Diário assinado: o avanço deste dia não muda mais.</p>
          )}
        </div>
      )}

      {leitura.observacoes.length > 0 && (
        <ul className="list-disc pl-5 text-sm text-regua">
          {leitura.observacoes.map((o, i) => (
            <li key={i}>{o}</li>
          ))}
        </ul>
      )}
      <p className="text-xs text-regua">Leitura automática: confira na obra. A IA pode não ver o que está fora do enquadramento.</p>
    </div>
  );
}
