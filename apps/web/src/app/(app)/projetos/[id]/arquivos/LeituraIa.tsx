'use client';

import Link from 'next/link';
import { useMemo, useState, useTransition } from 'react';
import { CircleAlert, FileSearch, LoaderCircle, Sparkles } from 'lucide-react';
import {
  compararNomesArquivo,
  formatarData,
  formatarTamanho,
  dataDoInstante,
  LIMITE_ARQUIVOS_IA,
  LIMITE_BYTES_IA,
  ROTULO_TIPO_FALTANDO,
  TIPOS_FALTANDO,
  type ArquivoObra,
  type Importancia,
  type LeituraArquivos,
  type SugestaoConferida,
} from '@obras/shared';
import { Botao, classeBotao } from '@/components/ui';
import { avisar } from '@/lib/avisos';
import { criarTarefasSugeridas, lerArquivosComIa, type LeituraArquivosPronta } from './acoesIa';

export type LeituraAnterior = LeituraArquivosPronta & { criado_em: string; arquivos: string[] };

const COR_IMPORTANCIA: Record<Importancia, string> = {
  alta: 'bg-marcador-claro text-marcador',
  media: 'bg-atencao-claro text-atencao',
  baixa: 'bg-concreto text-regua',
};
const ROTULO_IMPORTANCIA: Record<Importancia, string> = { alta: 'Alta', media: 'Média', baixa: 'Baixa' };

/**
 * "Ler o projeto com IA": o engenheiro escolhe as pranchas (PDF ou imagem), a IA resume a obra, sugere tarefas que
 * faltam no cronograma, aponta o que falta (documentos, partes da obra, informações) e dá sugestões. As tarefas só
 * entram no cronograma depois de marcadas e confirmadas.
 */
export function LeituraIa({
  projetoId,
  legiveis,
  ilegiveis,
  anteriores,
  restantesHoje,
}: {
  projetoId: string;
  /** Versões vigentes que a IA lê (PDF e imagem). */
  legiveis: ArquivoObra[];
  /** Quantos documentos a IA não lê (DWG, planilhas...). */
  ilegiveis: number;
  anteriores: LeituraAnterior[];
  restantesHoje: number;
}) {
  const lidos = useMemo(() => new Set(anteriores.flatMap((a) => a.arquivos)), [anteriores]);
  const ordenados = useMemo(() => [...legiveis].sort((a, b) => compararNomesArquivo(a.nome, b.nome)), [legiveis]);
  const [marcados, setMarcados] = useState<Set<string>>(() => {
    // Começa com os ainda não lidos que cabem numa leitura.
    const novos = new Set<string>();
    let bytes = 0;
    for (const a of ordenados) {
      if (lidos.has(a.id) || novos.size >= LIMITE_ARQUIVOS_IA || bytes + a.tamanho > LIMITE_BYTES_IA) continue;
      novos.add(a.id);
      bytes += a.tamanho;
    }
    return novos;
  });
  const [atual, setAtual] = useState<LeituraAnterior | null>(anteriores[0] ?? null);
  const [erro, setErro] = useState<string | null>(null);
  const [lendo, iniciar] = useTransition();

  const escolhidos = ordenados.filter((a) => marcados.has(a.id));
  const bytes = escolhidos.reduce((s, a) => s + a.tamanho, 0);
  const passou = escolhidos.length > LIMITE_ARQUIVOS_IA || bytes > LIMITE_BYTES_IA;

  function alternar(id: string) {
    setMarcados((m) => {
      const novo = new Set(m);
      if (novo.has(id)) novo.delete(id);
      else novo.add(id);
      return novo;
    });
  }

  function ler() {
    setErro(null);
    iniciar(async () => {
      const r = await lerArquivosComIa(projetoId, [...marcados]);
      if (!r.ok) {
        setErro(r.erro);
        return;
      }
      setAtual({ ...r.valor, criado_em: new Date().toISOString(), arquivos: [...marcados] });
      setMarcados(new Set());
      avisar.ok('Leitura pronta. Confira as sugestões abaixo.');
    });
  }

  return (
    <section aria-labelledby="titulo-leitura-ia" className="cartao overflow-hidden">
      <div className="flex items-start gap-3 border-b border-linha px-4 py-4 sm:px-5">
        <span aria-hidden className="flex size-10 shrink-0 items-center justify-center rounded-medio bg-cianotipia-claro text-cianotipia">
          <Sparkles className="size-5" />
        </span>
        <div className="min-w-0">
          <h3 id="titulo-leitura-ia" className="font-semibold">
            Ler o projeto com IA
          </h3>
          <p className="text-sm text-regua">
            A IA lê as pranchas, resume a obra, sugere tarefas que faltam no cronograma e aponta documentos e informações que faltam. Nada
            muda no cronograma sem você marcar e confirmar.
          </p>
        </div>
      </div>

      <div className="flex flex-col gap-4 px-4 py-4 sm:px-5">
        {ordenados.length === 0 ? (
          <p className="text-sm text-regua">Envie as pranchas em PDF (ou imagem) para a IA ler. DWG, planilhas e ZIP ela não lê.</p>
        ) : (
          <>
            <fieldset>
              <legend className="mb-2 text-sm font-semibold">Arquivos para ler (até {LIMITE_ARQUIVOS_IA} por vez)</legend>
              <ul className="grid max-h-72 gap-1 overflow-y-auto rounded-medio border border-linha p-2 sm:grid-cols-2">
                {ordenados.map((a) => (
                  <li key={a.id}>
                    <label className="flex min-h-11 cursor-pointer items-center gap-3 rounded-[8px] px-2 hover:bg-concreto">
                      <input
                        type="checkbox"
                        checked={marcados.has(a.id)}
                        onChange={() => alternar(a.id)}
                        disabled={lendo}
                        className="size-5 shrink-0 accent-cianotipia"
                      />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm">{a.nome}</span>
                        <span className="numeros block text-xs text-regua">
                          {formatarTamanho(a.tamanho)}
                          {!lidos.has(a.id) && <span className="ml-1.5 font-semibold text-cianotipia">· ainda não lido</span>}
                        </span>
                      </span>
                    </label>
                  </li>
                ))}
              </ul>
              {ilegiveis > 0 && (
                <p className="mt-2 text-xs text-regua">
                  {ilegiveis} {ilegiveis === 1 ? 'arquivo não aparece' : 'arquivos não aparecem'} aqui (DWG, planilha, ZIP): a IA usa os PDFs das
                  pranchas.
                </p>
              )}
            </fieldset>

            <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
              <Botao type="button" onClick={ler} disabled={lendo || escolhidos.length === 0 || passou || restantesHoje <= 0}>
                {lendo ? <LoaderCircle aria-hidden className="size-4 animate-spin" /> : <FileSearch aria-hidden className="size-4" />}
                {lendo ? 'A IA está lendo…' : `Ler ${escolhidos.length || ''} ${escolhidos.length === 1 ? 'arquivo' : 'arquivos'} com IA`}
              </Botao>
              <p className="numeros text-sm text-regua" aria-live="polite">
                {lendo
                  ? 'Pode levar até um minuto. Não feche a página.'
                  : passou
                    ? `Passou do limite: ${escolhidos.length} arquivos, ${formatarTamanho(bytes)} (até ${LIMITE_ARQUIVOS_IA} e ${formatarTamanho(LIMITE_BYTES_IA)}).`
                    : `${formatarTamanho(bytes)} escolhidos · ${restantesHoje > 0 ? `restam ${restantesHoje} leituras hoje` : 'acabaram as leituras de hoje'}`}
              </p>
            </div>
          </>
        )}

        {erro && (
          <p role="alert" className="flex items-start gap-2 rounded-medio bg-marcador-claro px-4 py-3 text-sm text-marcador">
            <CircleAlert aria-hidden className="mt-0.5 size-4 shrink-0" />
            {erro}
          </p>
        )}
      </div>

      {anteriores.length > 0 && (
        <div className="flex flex-wrap items-center gap-2 border-t border-linha px-4 py-3 text-sm sm:px-5">
          <label htmlFor="leitura-anterior" className="text-regua">
            Leituras feitas:
          </label>
          <select
            id="leitura-anterior"
            value={atual?.id ?? ''}
            onChange={(e) => setAtual(anteriores.find((a) => a.id === e.target.value) ?? null)}
            className="min-h-11 rounded-medio border border-campo bg-papel px-3 text-base sm:text-sm"
          >
            {atual && !anteriores.some((a) => a.id === atual.id) && <option value={atual.id}>Agora há pouco</option>}
            {anteriores.map((a) => (
              <option key={a.id} value={a.id}>
                {formatarData(dataDoInstante(a.criado_em))} · {a.arquivos.length} {a.arquivos.length === 1 ? 'arquivo' : 'arquivos'}
              </option>
            ))}
          </select>
        </div>
      )}

      {atual && <ResultadoLeitura key={atual.id} projetoId={projetoId} analiseId={atual.id} leitura={atual.leitura} sugestoes={atual.sugestoes} />}
    </section>
  );
}

function ResultadoLeitura({
  projetoId,
  analiseId,
  leitura,
  sugestoes,
}: {
  projetoId: string;
  analiseId: string;
  leitura: LeituraArquivos;
  sugestoes: SugestaoConferida[];
}) {
  const [marcadas, setMarcadas] = useState<Set<number>>(() => new Set(sugestoes.flatMap((s, i) => (s.jaExiste ? [] : [i]))));
  const [criando, iniciar] = useTransition();
  const [feito, setFeito] = useState<string | null>(null);

  const porEtapa = useMemo(() => {
    const m = new Map<string, { etapa: string; nova: boolean; itens: { s: SugestaoConferida; i: number }[] }>();
    sugestoes.forEach((s, i) => {
      const k = (s.etapaExistente?.nome ?? s.etapa).toLowerCase();
      if (!m.has(k)) m.set(k, { etapa: s.etapaExistente?.nome ?? s.etapa, nova: !s.etapaExistente, itens: [] });
      m.get(k)!.itens.push({ s, i });
    });
    return [...m.values()];
  }, [sugestoes]);

  const d = leitura.dados_obra;
  const dados = [
    d.tipo && ['Tipo', d.tipo],
    d.area_construida_m2 && ['Área construída', `${d.area_construida_m2.toLocaleString('pt-BR')} m²`],
    d.area_terreno_m2 && ['Terreno', `${d.area_terreno_m2.toLocaleString('pt-BR')} m²`],
    d.pavimentos && ['Pavimentos', d.pavimentos],
    d.unidades && ['Unidades', d.unidades],
    d.endereco && ['Endereço', d.endereco],
  ].filter((x): x is [string, string] => Boolean(x));

  function criar() {
    const tarefas = [...marcadas].map((i) => sugestoes[i]!).map((s) => ({
      etapa: s.etapaExistente?.nome ?? s.etapa,
      nome: s.nome,
      unidade: s.unidade,
      quantidade: s.quantidade,
    }));
    iniciar(async () => {
      const r = await criarTarefasSugeridas(projetoId, analiseId, tarefas);
      if (!r.ok) {
        avisar.erro(r.erro);
        return;
      }
      const msg = `${r.valor.criadas} ${r.valor.criadas === 1 ? 'tarefa criada' : 'tarefas criadas'} no cronograma${
        r.valor.etapasNovas ? ` (${r.valor.etapasNovas} ${r.valor.etapasNovas === 1 ? 'etapa nova' : 'etapas novas'})` : ''
      }. Programe as datas no Gantt.`;
      setFeito(msg);
      setMarcadas(new Set());
      avisar.ok(msg);
    });
  }

  return (
    <div className="flex flex-col gap-6 border-t border-linha bg-concreto/40 px-4 py-5 sm:px-5">
      <div>
        <h4 className="text-sm font-semibold tracking-wide text-regua uppercase">Resumo da obra</h4>
        <p className="mt-1">{leitura.resumo || 'A IA não resumiu a obra.'}</p>
        {dados.length > 0 && (
          <dl className="mt-3 flex flex-wrap gap-2 text-sm">
            {dados.map(([rotulo, valor]) => (
              <div key={rotulo} className="rounded-medio border border-linha bg-papel px-3 py-1.5">
                <dt className="inline text-regua">{rotulo}: </dt>
                <dd className="numeros inline font-medium">{valor}</dd>
              </div>
            ))}
          </dl>
        )}
      </div>

      <div>
        <h4 className="text-sm font-semibold tracking-wide text-regua uppercase">Tarefas sugeridas para o cronograma</h4>
        {sugestoes.length === 0 ? (
          <p className="mt-1 text-sm text-regua">A IA não achou serviço do projeto fora do cronograma.</p>
        ) : (
          <>
            <div className="mt-2 flex flex-col gap-3">
              {porEtapa.map((g) => (
                <fieldset key={g.etapa} className="rounded-medio border border-linha bg-papel">
                  <legend className="sr-only">{g.etapa}</legend>
                  <p className="border-b border-linha px-3 py-2 text-sm font-semibold">
                    {g.etapa}
                    {g.nova && <span className="ml-2 rounded-full bg-cianotipia-claro px-2 py-0.5 text-xs font-medium text-cianotipia">etapa nova</span>}
                  </p>
                  <ul className="divide-y divide-linha">
                    {g.itens.map(({ s, i }) => (
                      <li key={i}>
                        <label className={`flex min-h-11 items-start gap-3 px-3 py-2 ${s.jaExiste ? 'opacity-60' : 'cursor-pointer'}`}>
                          <input
                            type="checkbox"
                            className="mt-0.5 size-5 shrink-0 accent-cianotipia"
                            checked={marcadas.has(i)}
                            disabled={criando}
                            onChange={() =>
                              setMarcadas((m) => {
                                const novo = new Set(m);
                                if (novo.has(i)) novo.delete(i);
                                else novo.add(i);
                                return novo;
                              })
                            }
                          />
                          <span className="min-w-0 text-sm">
                            <span className="font-medium">{s.nome}</span>
                            {s.quantidade !== null && (
                              <span className="numeros text-regua">
                                {' '}
                                · {s.quantidade.toLocaleString('pt-BR')} {s.unidade ?? ''}
                              </span>
                            )}
                            {s.jaExiste && <span className="text-regua"> · já está no cronograma</span>}
                            {(s.motivo || s.arquivo) && (
                              <span className="block text-xs text-regua">
                                {s.motivo}
                                {s.arquivo ? `${s.motivo ? ' ' : ''}(${s.arquivo})` : ''}
                              </span>
                            )}
                          </span>
                        </label>
                      </li>
                    ))}
                  </ul>
                </fieldset>
              ))}
            </div>
            <div className="mt-3 flex flex-wrap items-center gap-3">
              <Botao type="button" onClick={criar} disabled={criando || marcadas.size === 0}>
                {criando && <LoaderCircle aria-hidden className="size-4 animate-spin" />}
                {criando ? 'Criando…' : `Criar ${marcadas.size} ${marcadas.size === 1 ? 'tarefa' : 'tarefas'} no cronograma`}
              </Botao>
              {feito && (
                <Link href={`/projetos/${projetoId}/cronograma`} className={classeBotao('discreto', 'text-sm text-cianotipia underline-offset-4 hover:underline')}>
                  {feito} Abrir o cronograma
                </Link>
              )}
            </div>
          </>
        )}
      </div>

      {leitura.faltando.length > 0 && (
        <div>
          <h4 className="text-sm font-semibold tracking-wide text-regua uppercase">O que está faltando</h4>
          <div className="mt-2 grid gap-3 lg:grid-cols-3">
            {TIPOS_FALTANDO.map((tipo) => {
              const itens = leitura.faltando.filter((f) => f.tipo === tipo);
              if (itens.length === 0) return null;
              return (
                <div key={tipo} className="rounded-medio border border-linha bg-papel">
                  <p className="border-b border-linha px-3 py-2 text-sm font-semibold">{ROTULO_TIPO_FALTANDO[tipo]}</p>
                  <ul className="divide-y divide-linha text-sm">
                    {itens.map((f, i) => (
                      <li key={i} className="flex items-start justify-between gap-3 px-3 py-2">
                        <span>{f.descricao}</span>
                        <span className={`shrink-0 rounded-full px-2 py-0.5 text-xs font-semibold ${COR_IMPORTANCIA[f.importancia]}`}>
                          {ROTULO_IMPORTANCIA[f.importancia]}
                        </span>
                      </li>
                    ))}
                  </ul>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {leitura.sugestoes.length > 0 && (
        <div>
          <h4 className="text-sm font-semibold tracking-wide text-regua uppercase">Sugestões</h4>
          <ul className="mt-2 flex list-disc flex-col gap-1.5 pl-5 text-sm">
            {leitura.sugestoes.map((s, i) => (
              <li key={i}>{s}</li>
            ))}
          </ul>
        </div>
      )}

      <p className="text-xs text-regua">
        Leitura automática: confira antes de usar. A IA erra medidas e pode não ver o que está fora das pranchas enviadas.
      </p>
    </div>
  );
}
