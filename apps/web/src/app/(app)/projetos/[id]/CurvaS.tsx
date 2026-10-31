'use client';

import { useEffect, useRef, useState } from 'react';
import { formatarData, type PontoCurva } from '@obras/shared';

// Real em cianotipia clara (passa na faixa de luminosidade do validador);
// planejado é a referência: cinza, tracejado, com rótulo e legenda.
const COR_REAL = '#2f5bd3';
const COR_PLANEJADO = '#878d96';
const ALTURA = 240;
const MARGEM = { topo: 16, direita: 56, base: 28, esquerda: 40 };
const MESES = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];

function dia(iso: string) {
  return Date.parse(`${iso}T00:00:00Z`) / 86_400_000;
}

/** Curva S física: % acumulado planejado (linha de base) × real (apontamentos). */
export function CurvaS({ pontos, hoje, referencia }: { pontos: PontoCurva[]; hoje: string; referencia: string }) {
  const caixa = useRef<HTMLDivElement>(null);
  const [largura, setLargura] = useState(640);
  const [foco, setFoco] = useState<number | null>(null);

  useEffect(() => {
    const el = caixa.current;
    if (!el) return;
    const obs = new ResizeObserver(([e]) => e && setLargura(Math.max(280, e.contentRect.width)));
    obs.observe(el);
    return () => obs.disconnect();
  }, []);

  if (pontos.length < 2) return null;

  const x0 = dia(pontos[0]!.data);
  const x1 = dia(pontos[pontos.length - 1]!.data);
  const w = largura - MARGEM.esquerda - MARGEM.direita;
  const h = ALTURA - MARGEM.topo - MARGEM.base;
  const x = (iso: string) => MARGEM.esquerda + ((dia(iso) - x0) / Math.max(1, x1 - x0)) * w;
  const y = (pct: number) => MARGEM.topo + h - (pct / 100) * h;

  const linha = (campo: 'planejado' | 'real') =>
    pontos
      .filter((p) => p[campo] !== null)
      .map((p, i) => `${i === 0 ? 'M' : 'L'}${x(p.data).toFixed(1)} ${y(p[campo]!).toFixed(1)}`)
      .join(' ');

  const reais = pontos.filter((p) => p.real !== null);
  const ultimoReal = reais.at(-1);
  const ultimoPlan = pontos.filter((p) => p.planejado !== null).at(-1);
  const xHoje = hoje >= pontos[0]!.data && hoje <= pontos.at(-1)!.data ? x(hoje) : null;

  // Marcas de mês no eixo x (no máximo ~8 rótulos).
  const marcas: { x: number; rotulo: string }[] = [];
  {
    let [ano, mes] = pontos[0]!.data.split('-').map(Number) as [number, number];
    mes += 1;
    for (let i = 0; i < 120; i++) {
      if (mes > 12) {
        mes = 1;
        ano += 1;
      }
      const iso = `${ano}-${String(mes).padStart(2, '0')}-01`;
      if (iso > pontos.at(-1)!.data) break;
      marcas.push({ x: x(iso), rotulo: mes === 1 ? `jan ${ano}` : MESES[mes - 1]! });
      mes += 1;
    }
  }
  const passoMarca = Math.max(1, Math.ceil(marcas.length / Math.max(2, Math.floor(w / 70))));

  function mover(ev: React.PointerEvent<SVGRectElement>) {
    const r = ev.currentTarget.getBoundingClientRect();
    const px = ev.clientX - r.left + MARGEM.esquerda;
    let melhor = 0;
    let dist = Infinity;
    pontos.forEach((p, i) => {
      const d = Math.abs(x(p.data) - px);
      if (d < dist) {
        dist = d;
        melhor = i;
      }
    });
    setFoco(melhor);
  }

  const pf = foco !== null ? pontos[foco] : null;
  const resumo = ultimoReal
    ? `Até ${formatarData(ultimoReal.data)}: ${Math.round(ultimoReal.real!)}% feito; o planejado para a data era ${Math.round(
        pontos.find((p) => p.data === ultimoReal.data)?.planejado ?? 0,
      )}%.`
    : 'Ainda sem avanço apontado.';

  return (
    <figure className="flex flex-col gap-3">
      <ul className="flex flex-wrap gap-x-5 gap-y-1 text-sm text-regua" aria-label="Legenda">
        <li className="flex items-center gap-2">
          <svg aria-hidden width="24" height="8">
            <path d="M0 4 H24" stroke={COR_REAL} strokeWidth="2.5" strokeLinecap="round" />
          </svg>
          Real (apontado)
        </li>
        <li className="flex items-center gap-2">
          <svg aria-hidden width="24" height="8">
            <path d="M0 4 H24" stroke={COR_PLANEJADO} strokeWidth="2" strokeDasharray="5 4" />
          </svg>
          Planejado ({referencia})
        </li>
      </ul>

      <div ref={caixa} className="relative w-full">
        <svg width={largura} height={ALTURA} role="img" aria-label={`Curva S física. ${resumo}`} className="block">
          {/* grade horizontal */}
          {[0, 25, 50, 75, 100].map((v) => (
            <g key={v}>
              <line x1={MARGEM.esquerda} x2={MARGEM.esquerda + w} y1={y(v)} y2={y(v)} stroke="var(--color-linha)" strokeWidth="1" />
              <text x={MARGEM.esquerda - 8} y={y(v) + 4} textAnchor="end" className="numeros fill-regua text-[11px]">
                {v}%
              </text>
            </g>
          ))}
          {/* meses */}
          {marcas.map((m, i) =>
            i % passoMarca === 0 ? (
              <text key={m.x} x={m.x} y={ALTURA - 8} textAnchor="middle" className="fill-regua text-[11px]">
                {m.rotulo}
              </text>
            ) : null,
          )}
          {/* hoje */}
          {xHoje !== null && (
            <g>
              <line x1={xHoje} x2={xHoje} y1={MARGEM.topo - 6} y2={MARGEM.topo + h} stroke="var(--color-grafite)" strokeWidth="1" />
              <text x={xHoje + 4} y={MARGEM.topo + 2} className="fill-grafite text-[11px] font-semibold">
                hoje
              </text>
            </g>
          )}
          {/* área sob o real (lavagem leve) */}
          {ultimoReal && (
            <path
              d={`${linha('real')} L${x(ultimoReal.data)} ${y(0)} L${x(reais[0]!.data)} ${y(0)} Z`}
              fill={COR_REAL}
              fillOpacity="0.08"
            />
          )}
          <path d={linha('planejado')} fill="none" stroke={COR_PLANEJADO} strokeWidth="2" strokeDasharray="5 4" strokeLinejoin="round" />
          <path d={linha('real')} fill="none" stroke={COR_REAL} strokeWidth="2.5" strokeLinejoin="round" strokeLinecap="round" />

          {/* rótulos diretos nas pontas */}
          {ultimoPlan && (
            <text x={x(ultimoPlan.data) + 6} y={y(ultimoPlan.planejado!) + 4} className="numeros fill-regua text-[11px]">
              {Math.round(ultimoPlan.planejado!)}%
            </text>
          )}
          {ultimoReal && (
            <g>
              <circle cx={x(ultimoReal.data)} cy={y(ultimoReal.real!)} r="4.5" fill={COR_REAL} stroke="var(--color-papel)" strokeWidth="2" />
              <text x={x(ultimoReal.data) + 8} y={y(ultimoReal.real!) - 6} className="numeros fill-grafite text-[12px] font-semibold">
                {Math.round(ultimoReal.real!)}%
              </text>
            </g>
          )}

          {/* foco do ponteiro */}
          {pf && (
            <g pointerEvents="none">
              <line x1={x(pf.data)} x2={x(pf.data)} y1={MARGEM.topo} y2={MARGEM.topo + h} stroke="var(--color-campo)" strokeWidth="1" />
              {pf.planejado !== null && <circle cx={x(pf.data)} cy={y(pf.planejado)} r="4" fill={COR_PLANEJADO} stroke="var(--color-papel)" strokeWidth="2" />}
              {pf.real !== null && <circle cx={x(pf.data)} cy={y(pf.real)} r="4.5" fill={COR_REAL} stroke="var(--color-papel)" strokeWidth="2" />}
            </g>
          )}
          <rect
            x={MARGEM.esquerda}
            y={MARGEM.topo}
            width={w}
            height={h}
            fill="transparent"
            onPointerMove={mover}
            onPointerDown={mover}
            onPointerLeave={() => setFoco(null)}
          />
        </svg>

        {pf && (
          <div
            className="numeros pointer-events-none absolute top-2 z-10 rounded-medio border border-linha bg-papel px-3 py-2 text-xs shadow-[0_2px_8px_rgb(0_0_0/0.08)]"
            style={{
              left: Math.min(Math.max(0, x(pf.data) - 70), largura - 150),
            }}
          >
            <p className="font-semibold">{formatarData(pf.data)}</p>
            <p className="text-regua">
              Planejado: <span className="font-semibold text-grafite">{pf.planejado !== null ? `${Math.round(pf.planejado)}%` : '—'}</span>
            </p>
            <p className="text-regua">
              Real: <span className="font-semibold text-grafite">{pf.real !== null ? `${Math.round(pf.real)}%` : '—'}</span>
            </p>
          </div>
        )}
      </div>

      <figcaption className="text-sm text-regua">{resumo}</figcaption>
      <details className="text-sm">
        <summary className="cursor-pointer font-semibold text-cianotipia">Ver em tabela</summary>
        <div className="mt-2 max-h-64 overflow-auto rounded-medio border border-linha">
          <table className="numeros w-full text-left">
            <thead className="sticky top-0 bg-concreto">
              <tr>
                <th className="px-3 py-2 font-semibold">Data</th>
                <th className="px-3 py-2 text-right font-semibold">Planejado</th>
                <th className="px-3 py-2 text-right font-semibold">Real</th>
              </tr>
            </thead>
            <tbody>
              {pontos.map((p) => (
                <tr key={p.data} className="border-t border-linha">
                  <td className="px-3 py-1.5">{formatarData(p.data)}</td>
                  <td className="px-3 py-1.5 text-right">{p.planejado !== null ? `${p.planejado.toFixed(1)}%` : '—'}</td>
                  <td className="px-3 py-1.5 text-right">{p.real !== null ? `${p.real.toFixed(1)}%` : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </figure>
  );
}
