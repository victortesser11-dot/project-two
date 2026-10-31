'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { diasEntre, formatarData, formatarMoeda, type Dependencia, type ItemEap, type LinhaBase } from '@obras/shared';
import {
  desvioDaBase,
  janelaDoGantt,
  largura,
  marcasDeMes,
  posicao,
  PX_POR_DIA,
  pxParaCaber,
  ROTULO_ZOOM,
  segundasFeiras,
  ZOOMS,
  type Zoom,
} from './escala';
import { PainelTarefa } from './PainelTarefa';
import { BotaoLinhaBase } from './BotaoLinhaBase';

const ALTURA_LINHA = 40;
const ALTURA_CABECALHO = 44;

export function Gantt({
  projetoId,
  itens,
  dependencias,
  linhaBase,
  podeEditar,
  hoje,
}: {
  projetoId: string;
  itens: ItemEap[];
  dependencias: Dependencia[];
  linhaBase: LinhaBase | null;
  podeEditar: boolean;
  hoje: string;
}) {
  const janela = useMemo(() => janelaDoGantt(itens, hoje), [itens, hoje]);
  const totalDias = janela ? diasEntre(janela.inicio, janela.fim) + 1 : 0;
  const [zoom, setZoom] = useState<Zoom>('tudo');
  // Largura útil da linha do tempo (para o zoom "Obra toda").
  const caixaRef = useRef<HTMLDivElement>(null);
  const [larguraUtil, setLarguraUtil] = useState(0);
  useEffect(() => {
    const caixa = caixaRef.current;
    if (!caixa) return;
    const medir = () => {
      const colNomes = parseFloat(getComputedStyle(caixa).getPropertyValue('--col-nomes')) || 0;
      setLarguraUtil(caixa.clientWidth - colNomes - 2);
    };
    medir();
    const obs = new ResizeObserver(medir);
    obs.observe(caixa);
    return () => obs.disconnect();
  }, []);
  const [recolhidos, setRecolhidos] = useState<Set<string>>(() => new Set());
  const [selecionada, setSelecionada] = useState<string | null>(null);

  const visiveis = useMemo(() => {
    const saida: ItemEap[] = [];
    let escondendoAbaixoDe: number | null = null;
    for (const item of itens) {
      if (escondendoAbaixoDe !== null) {
        if (item.nivel > escondendoAbaixoDe) continue;
        escondendoAbaixoDe = null;
      }
      saida.push(item);
      if (item.tipo === 'etapa' && recolhidos.has(item.id)) escondendoAbaixoDe = item.nivel;
    }
    return saida;
  }, [itens, recolhidos]);

  const temBase = linhaBase !== null;
  const atrasadas = itens.filter((i) => i.tipo === 'tarefa' && (desvioDaBase(i) ?? 0) > 0).length;

  if (!janela) {
    return (
      <div className="rounded-medio border border-dashed border-campo/60 px-5 py-10 text-center">
        <p className="font-semibold">Nenhuma tarefa com datas ainda</p>
        <p className="mt-1 text-sm text-regua">Preencha início e término das tarefas na EAP para ver o Gantt.</p>
      </div>
    );
  }

  const px = zoom === 'tudo' ? pxParaCaber(larguraUtil, totalDias) : PX_POR_DIA[zoom];
  const larguraTotal = totalDias * px;
  const meses = marcasDeMes(janela.inicio, janela.fim, px);
  const semanas = px < 6 ? [] : segundasFeiras(janela.inicio, janela.fim, px);
  const xHoje = hoje >= janela.inicio && hoje <= janela.fim ? posicao(janela.inicio, hoje, px) + px / 2 : null;

  const linhaDe = new Map(visiveis.map((item, i) => [item.id, i]));
  const porId = new Map(itens.map((i) => [i.id, i]));
  const tarefaSelecionada = selecionada ? porId.get(selecionada) ?? null : null;

  function alternar(id: string) {
    setRecolhidos((atual) => {
      const novo = new Set(atual);
      if (novo.has(id)) novo.delete(id);
      else novo.add(id);
      return novo;
    });
  }

  return (
    <div className="flex flex-col gap-4">
      {/* Barra de controles */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div role="group" aria-label="Escala do gráfico" className="inline-flex rounded-medio border border-linha bg-concreto p-0.5">
          {ZOOMS.map((z) => (
            <button
              key={z}
              type="button"
              aria-pressed={zoom === z}
              onClick={() => setZoom(z)}
              className={`min-h-9 rounded-[8px] px-3 text-sm font-semibold transition-colors ${
                zoom === z ? 'bg-papel text-grafite shadow-[0_0_0_1px_var(--color-linha)]' : 'text-regua hover:text-grafite'
              }`}
            >
              {ROTULO_ZOOM[z]}
            </button>
          ))}
        </div>
        <BotaoLinhaBase projetoId={projetoId} linhaBase={linhaBase} podeEditar={podeEditar} />
      </div>

      {temBase && atrasadas > 0 && (
        <p className="rounded-medio bg-marcador-claro px-4 py-3 text-sm text-marcador">
          <strong className="font-semibold">
            {atrasadas} {atrasadas === 1 ? 'tarefa termina' : 'tarefas terminam'} depois da linha de base.
          </strong>{' '}
          O trecho em laranja mostra quanto passou.
        </p>
      )}

      {/* Gráfico: coluna de nomes fixa e linha do tempo com rolagem lateral */}
      <div
        ref={caixaRef}
        className="overflow-x-auto rounded-medio border border-linha [--col-nomes:164px] [--recuo:6px] sm:[--col-nomes:300px] sm:[--recuo:12px]"
        tabIndex={0}
        aria-label="Gantt do cronograma (role para os lados)"
      >
        <div className="relative" style={{ width: `calc(var(--col-nomes) + ${larguraTotal}px)` }} data-gantt>
          {/* Cabeçalho */}
          <div className="sticky top-0 z-20 flex border-b border-linha bg-papel" style={{ height: ALTURA_CABECALHO }}>
            <div className="sticky left-0 z-10 flex w-[var(--col-nomes)] shrink-0 items-end border-r border-linha bg-papel px-3 pb-2 text-xs font-semibold text-regua">
              Tarefa
            </div>
            <div className="relative shrink-0" style={{ width: larguraTotal }}>
              {rotulosVisiveis(meses).map((m) => (
                <span
                  key={m.x}
                  className="absolute top-2 border-l border-campo/50 pl-1.5 text-xs font-semibold whitespace-nowrap text-grafite"
                  style={{ left: m.x }}
                >
                  {m.rotulo}
                </span>
              ))}
              {px >= 18 &&
                Array.from({ length: totalDias }, (_, d) => (
                  <span
                    key={d}
                    className="numeros absolute bottom-1.5 text-center text-[11px] text-regua"
                    style={{ left: d * px, width: px }}
                  >
                    {Number(diaDoMes(janela.inicio, d))}
                  </span>
                ))}
            </div>
          </div>

          {/* Linhas */}
          <ul className="relative">
            {visiveis.map((item) => {
              const recolhido = recolhidos.has(item.id);
              const ativo = selecionada === item.id;
              return (
                <li key={item.id} className="flex border-b border-linha last:border-b-0" style={{ height: ALTURA_LINHA }}>
                  <div
                    className={`sticky left-0 z-10 flex w-[var(--col-nomes)] shrink-0 items-center gap-1.5 border-r border-linha pr-2 text-sm ${
                      ativo ? 'bg-cianotipia-claro' : 'bg-papel'
                    }`}
                    style={{ paddingLeft: `calc(4px + ${item.nivel - 1} * var(--recuo))` }}
                  >
                    {item.tipo === 'etapa' ? (
                      <button
                        type="button"
                        onClick={() => alternar(item.id)}
                        aria-expanded={!recolhido}
                        aria-label={`${recolhido ? 'Abrir' : 'Recolher'} ${item.nome}`}
                        className="flex size-6 shrink-0 items-center justify-center rounded text-regua hover:bg-concreto"
                      >
                        <svg aria-hidden viewBox="0 0 16 16" className={`size-3.5 transition-transform ${recolhido ? '-rotate-90' : ''}`}>
                          <path d="m4 6 4 4 4-4" fill="none" stroke="currentColor" strokeWidth="2" />
                        </svg>
                      </button>
                    ) : (
                      <span className="w-6 shrink-0" />
                    )}
                    <span className="numeros shrink-0 text-xs text-regua">{item.codigo}</span>
                    {item.tipo === 'tarefa' ? (
                      <button
                        type="button"
                        onClick={() => setSelecionada(ativo ? null : item.id)}
                        aria-pressed={ativo}
                        className="line-clamp-2 min-w-0 text-left text-[13px] leading-tight hover:text-cianotipia sm:line-clamp-1 sm:text-sm"
                        title={item.nome}
                      >
                        {item.nome}
                      </button>
                    ) : (
                      <span className="line-clamp-2 min-w-0 text-[13px] leading-tight font-semibold sm:line-clamp-1 sm:text-sm" title={item.nome}>
                        {item.nome}
                      </span>
                    )}
                  </div>
                  <div className="relative shrink-0" style={{ width: larguraTotal }}>
                    <Barra item={item} inicioJanela={janela.inicio} px={px} ativo={ativo} onSelecionar={() => setSelecionada(ativo ? null : item.id)} />
                  </div>
                </li>
              );
            })}
          </ul>

          {/* Grade, hoje e setas das dependências por cima da linha do tempo */}
          <svg
            aria-hidden
            className="pointer-events-none absolute top-0 z-0"
            style={{ left: 'var(--col-nomes)' }}
            width={larguraTotal}
            height={ALTURA_CABECALHO + visiveis.length * ALTURA_LINHA}
          >
            <defs>
              <marker id="seta" viewBox="0 0 8 8" refX="7" refY="4" markerWidth="7" markerHeight="7" orient="auto-start-reverse">
                <path d="M0 0 8 4 0 8z" fill="var(--color-regua)" />
              </marker>
            </defs>
            {semanas.map((x) => (
              <line key={`s${x}`} x1={x} x2={x} y1={ALTURA_CABECALHO} y2="100%" stroke="var(--color-linha)" strokeWidth="1" />
            ))}
            {meses.map((m) => (
              <line key={`m${m.x}`} x1={m.x} x2={m.x} y1={0} y2="100%" stroke="var(--color-campo)" strokeOpacity="0.45" strokeWidth="1" />
            ))}
            {dependencias.map((d) => {
              const caminho = caminhoDaSeta(d, porId, linhaDe, janela.inicio, px);
              if (!caminho) return null;
              const destaque = selecionada === d.predecessora_id || selecionada === d.sucessora_id;
              return (
                <path
                  key={d.id}
                  d={caminho}
                  fill="none"
                  stroke={destaque ? 'var(--color-cianotipia)' : 'var(--color-regua)'}
                  strokeOpacity={destaque ? 1 : 0.7}
                  strokeWidth={destaque ? 2 : 1.25}
                  markerEnd="url(#seta)"
                />
              );
            })}
            {xHoje !== null && (
              <g>
                <line x1={xHoje} x2={xHoje} y1={ALTURA_CABECALHO - 6} y2="100%" stroke="var(--color-marcador)" strokeWidth="2" />
              </g>
            )}
          </svg>
        </div>
      </div>

      <Legenda temBase={temBase} />

      {tarefaSelecionada && tarefaSelecionada.tipo === 'tarefa' && (
        <PainelTarefa
          projetoId={projetoId}
          tarefa={tarefaSelecionada}
          itens={itens}
          dependencias={dependencias}
          podeEditar={podeEditar}
          onFechar={() => setSelecionada(null)}
        />
      )}
    </div>
  );
}

/** Rótulos de mês que cabem sem encostar no anterior (~7 px por letra). */
function rotulosVisiveis(meses: { x: number; rotulo: string }[]) {
  const saida: typeof meses = [];
  let livreAPartirDe = -Infinity;
  for (const m of meses) {
    if (m.x < livreAPartirDe) continue;
    saida.push(m);
    livreAPartirDe = m.x + m.rotulo.length * 7 + 12;
  }
  return saida;
}

function diaDoMes(inicio: string, deslocamento: number) {
  const d = new Date(`${inicio}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + deslocamento);
  return d.getUTCDate();
}

function Barra({
  item,
  inicioJanela,
  px,
  ativo,
  onSelecionar,
}: {
  item: ItemEap;
  inicioJanela: string;
  px: number;
  ativo: boolean;
  onSelecionar: () => void;
}) {
  const { inicio_previsto: ini, fim_previsto: fim, inicio_base: iniB, fim_base: fimB } = item;
  const desvio = desvioDaBase(item);

  const base =
    iniB && fimB ? (
      <span
        className="absolute bottom-[7px] h-1.5 rounded-full bg-campo/45"
        style={{ left: posicao(inicioJanela, iniB, px), width: Math.max(largura(iniB, fimB, px), 3) }}
      />
    ) : null;

  if (!ini || !fim) return base;

  const x = posicao(inicioJanela, ini, px);
  const w = Math.max(largura(ini, fim, px), 4);
  const titulo = `${item.nome}: ${formatarData(ini)} a ${formatarData(fim)}, ${Math.round(Number(item.percentual_fisico))}% feito${
    item.custo_previsto !== null ? `, ${formatarMoeda(item.custo_previsto)}` : ''
  }${desvio ? (desvio > 0 ? `, ${desvio} dias depois da base` : `, ${-desvio} dias antes da base`) : ''}`;

  if (item.tipo === 'etapa') {
    return (
      <>
        {base}
        <span
          className="absolute top-[11px] h-2.5 bg-grafite"
          style={{ left: x, width: w, clipPath: 'polygon(0 0,100% 0,100% 100%,calc(100% - 5px) 55%,5px 55%,0 100%)' }}
          title={titulo}
        />
      </>
    );
  }

  // Trecho depois do fim da base, em laranja.
  const atraso = desvio && desvio > 0 && fimB ? Math.min(desvio * px, w) : 0;

  return (
    <>
      {base}
      <button
        type="button"
        onClick={onSelecionar}
        title={titulo}
        aria-label={titulo}
        tabIndex={-1}
        className={`absolute top-[8px] h-4 overflow-hidden rounded-[4px] bg-cianotipia/35 ${ativo ? 'ring-2 ring-cianotipia/35 ring-offset-1' : ''}`}
        style={{ left: x, width: w }}
      >
        <span className="absolute inset-y-0 left-0 bg-cianotipia" style={{ width: `${Number(item.percentual_fisico)}%` }} />
        {atraso > 0 && <span className="absolute inset-y-0 right-0 bg-marcador/85" style={{ width: atraso }} />}
      </button>
      {desvio !== null && desvio > 0 && (
        <span className="numeros absolute top-[8px] text-[11px] leading-4 font-semibold text-marcador" style={{ left: x + w + 4 }}>
          +{desvio}d
        </span>
      )}
    </>
  );
}

/** Seta em cotovelo entre as barras de duas tarefas visíveis. */
function caminhoDaSeta(
  d: Dependencia,
  porId: Map<string, ItemEap>,
  linhaDe: Map<string, number>,
  inicioJanela: string,
  px: number,
): string | null {
  const p = porId.get(d.predecessora_id);
  const s = porId.get(d.sucessora_id);
  const lp = linhaDe.get(d.predecessora_id);
  const ls = linhaDe.get(d.sucessora_id);
  if (!p || !s || lp === undefined || ls === undefined) return null;
  if (!p.inicio_previsto || !p.fim_previsto || !s.inicio_previsto || !s.fim_previsto) return null;

  const meio = ALTURA_LINHA / 2;
  const y1 = ALTURA_CABECALHO + lp * ALTURA_LINHA + meio;
  const y2 = ALTURA_CABECALHO + ls * ALTURA_LINHA + meio;
  const inicioP = posicao(inicioJanela, p.inicio_previsto, px);
  const fimP = inicioP + largura(p.inicio_previsto, p.fim_previsto, px);
  const inicioS = posicao(inicioJanela, s.inicio_previsto, px);
  const fimS = inicioS + largura(s.inicio_previsto, s.fim_previsto, px);
  const entre = y2 > y1 ? y2 - meio : y2 + meio; // corredor entre as linhas

  if (d.tipo === 'ii') {
    const xv = Math.min(inicioP, inicioS) - 8;
    return `M${inicioP} ${y1} H${xv} V${y2} H${inicioS - 1}`;
  }
  if (d.tipo === 'tt') {
    const xv = Math.max(fimP, fimS) + 8;
    return `M${fimP} ${y1} H${xv} V${y2} H${fimS + 1}`;
  }
  // TI
  if (inicioS >= fimP + 12) return `M${fimP} ${y1} H${fimP + 6} V${y2} H${inicioS - 1}`;
  return `M${fimP} ${y1} H${fimP + 6} V${entre} H${inicioS - 8} V${y2} H${inicioS - 1}`;
}

function Legenda({ temBase }: { temBase: boolean }) {
  return (
    <ul className="flex flex-wrap gap-x-5 gap-y-2 text-xs text-regua">
      <li className="flex items-center gap-2">
        <span className="flex h-3 w-6 overflow-hidden rounded-[3px] bg-cianotipia/35">
          <span className="w-1/2 bg-cianotipia" />
        </span>{' '}
        Previsto (cheio = feito)
      </li>
      {temBase && (
        <>
          <li className="flex items-center gap-2">
            <span className="h-1.5 w-6 rounded-full bg-campo/45" /> Linha de base
          </li>
          <li className="flex items-center gap-2">
            <span className="h-3 w-6 rounded-[3px] bg-marcador" /> Depois da base
          </li>
        </>
      )}
      <li className="flex items-center gap-2">
        <span className="h-2 w-6 bg-grafite [clip-path:polygon(0_0,100%_0,100%_100%,calc(100%-4px)_55%,4px_55%,0_100%)]" /> Etapa
      </li>
      <li className="flex items-center gap-2">
        <span className="h-3.5 w-0.5 bg-marcador" /> Hoje
      </li>
      <li className="flex items-center gap-2">
        <svg aria-hidden viewBox="0 0 24 10" className="h-2.5 w-6">
          <path d="M1 2 H8 V8 H20" fill="none" stroke="var(--color-regua)" strokeWidth="1.5" />
          <path d="M19 5 24 8 19 11z" fill="var(--color-regua)" />
        </svg>
        Dependência
      </li>
    </ul>
  );
}
