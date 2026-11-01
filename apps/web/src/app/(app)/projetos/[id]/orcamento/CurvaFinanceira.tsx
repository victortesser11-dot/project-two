'use client';

import { useEffect, useRef, useState } from 'react';
import { formatarData, formatarMoeda, type PontoFinanceiro } from '@obras/shared';

// Validadas (scripts/validate_palette.js, modo claro): realizado em azul, agregado em laranja;
// planejado é a referência: cinza tracejado, com legenda e rótulo.
const COR_REAL = '#2f5bd3';
const COR_AGREGADO = '#eb6834';
const COR_PLANEJADO = '#878d96';
const ALTURA = 260;
const MARGEM = { topo: 16, direita: 72, base: 28, esquerda: 80 };
const MESES = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];

const dia = (iso: string) => Date.parse(`${iso}T00:00:00Z`) / 86_400_000;

/** Teto "redondo" do eixo, que divide bem em quartos e não desperdiça altura. */
function teto(max: number): number {
  if (max <= 0) return 1;
  const ordem = 10 ** Math.floor(Math.log10(max));
  for (const m of [1, 1.2, 1.6, 2, 2.4, 3, 4, 5, 6, 8, 10]) if (m * ordem >= max) return m * ordem;
  return 10 * ordem;
}

type Serie = 'planejado' | 'real' | 'agregado';
const SERIES: { campo: Serie; nome: string; cor: string; traco?: string; largura: number }[] = [
  { campo: 'planejado', nome: 'Planejado', cor: COR_PLANEJADO, traco: '5 4', largura: 2 },
  { campo: 'agregado', nome: 'Valor agregado (orçado × feito)', cor: COR_AGREGADO, largura: 2.5 },
  { campo: 'real', nome: 'Realizado (gasto)', cor: COR_REAL, largura: 2.5 },
];

/** Curva S financeira: custo planejado × realizado × valor agregado, acumulados, em reais. */
export function CurvaFinanceira({ pontos, hoje, referencia }: { pontos: PontoFinanceiro[]; hoje: string; referencia: string }) {
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

  const maximo = teto(Math.max(...pontos.flatMap((p) => [p.planejado ?? 0, p.real ?? 0, p.agregado ?? 0])));
  const x0 = dia(pontos[0]!.data);
  const x1 = dia(pontos.at(-1)!.data);
  const w = largura - MARGEM.esquerda - MARGEM.direita;
  const h = ALTURA - MARGEM.topo - MARGEM.base;
  const x = (iso: string) => MARGEM.esquerda + ((dia(iso) - x0) / Math.max(1, x1 - x0)) * w;
  const y = (v: number) => MARGEM.topo + h - (v / maximo) * h;
  const linha = (campo: Serie) =>
    pontos
      .filter((p) => p[campo] !== null)
      .map((p, i) => `${i === 0 ? 'M' : 'L'}${x(p.data).toFixed(1)} ${y(p[campo]!).toFixed(1)}`)
      .join(' ');
  const xHoje = hoje >= pontos[0]!.data && hoje <= pontos.at(-1)!.data ? x(hoje) : null;

  // Rótulos nas pontas, afastados para não encavalar.
  const pontas = SERIES.map((s) => {
    const p = pontos.filter((q) => q[s.campo] !== null).at(-1);
    return p ? { ...s, x: x(p.data), y: y(p[s.campo]!), valor: p[s.campo]! } : null;
  })
    .filter((p) => p !== null)
    .sort((a, b) => a.y - b.y);
  for (let i = 1; i < pontas.length; i++) if (pontas[i]!.y - pontas[i - 1]!.y < 14) pontas[i]!.y = pontas[i - 1]!.y + 14;

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
  const atual = pontos.filter((p) => p.real !== null).at(-1);
  const resumo = atual
    ? `Até ${formatarData(atual.data)}: gasto ${formatarMoeda(atual.real)}, o que foi feito vale ${formatarMoeda(atual.agregado)} pelo orçamento e o plano previa ${formatarMoeda(atual.planejado)}.`
    : 'Ainda sem custo lançado.';

  return (
    <figure className="flex flex-col gap-3">
      <ul className="flex flex-wrap gap-x-5 gap-y-1 text-sm text-regua" aria-label="Legenda">
        {[...SERIES].reverse().map((s) => (
          <li key={s.campo} className="flex items-center gap-2">
            <svg aria-hidden width="24" height="8">
              <path d="M0 4 H24" stroke={s.cor} strokeWidth={s.largura} strokeDasharray={s.traco} strokeLinecap="round" />
            </svg>
            {s.campo === 'planejado' ? `${s.nome} (${referencia})` : s.nome}
          </li>
        ))}
      </ul>

      <div ref={caixa} className="relative w-full">
        <svg width={largura} height={ALTURA} role="img" aria-label={`Curva S financeira. ${resumo}`} className="block">
          {[0, 0.25, 0.5, 0.75, 1].map((f) => (
            <g key={f}>
              <line x1={MARGEM.esquerda} x2={MARGEM.esquerda + w} y1={y(maximo * f)} y2={y(maximo * f)} stroke="var(--color-linha)" strokeWidth="1" />
              <text x={MARGEM.esquerda - 8} y={y(maximo * f) + 4} textAnchor="end" className="numeros fill-regua text-[11px]">
                {formatarMoeda(maximo * f, { compacta: true })}
              </text>
            </g>
          ))}
          {marcas.map((m, i) =>
            i % passoMarca === 0 ? (
              <text key={m.x} x={m.x} y={ALTURA - 8} textAnchor="middle" className="fill-regua text-[11px]">
                {m.rotulo}
              </text>
            ) : null,
          )}
          {xHoje !== null && (
            <g>
              <line x1={xHoje} x2={xHoje} y1={MARGEM.topo - 6} y2={MARGEM.topo + h} stroke="var(--color-grafite)" strokeWidth="1" />
              <text x={xHoje + 4} y={MARGEM.topo + 2} className="fill-grafite text-[11px] font-semibold">
                hoje
              </text>
            </g>
          )}
          {SERIES.map((s) => (
            <path key={s.campo} d={linha(s.campo)} fill="none" stroke={s.cor} strokeWidth={s.largura} strokeDasharray={s.traco} strokeLinejoin="round" strokeLinecap="round" />
          ))}
          {pontas.map((p) => (
            <g key={p.campo}>
              {p.campo !== 'planejado' && (
                <circle cx={p.x} cy={y(p.valor)} r="4.5" fill={p.cor} stroke="var(--color-papel)" strokeWidth="2" />
              )}
              <text x={p.x + 8} y={p.y + 4} className={`numeros text-[11px] ${p.campo === 'planejado' ? 'fill-regua' : 'fill-grafite font-semibold'}`}>
                {formatarMoeda(p.valor, { compacta: true })}
              </text>
            </g>
          ))}
          {pf && (
            <g pointerEvents="none">
              <line x1={x(pf.data)} x2={x(pf.data)} y1={MARGEM.topo} y2={MARGEM.topo + h} stroke="var(--color-campo)" strokeWidth="1" />
              {SERIES.map((s) =>
                pf[s.campo] !== null ? <circle key={s.campo} cx={x(pf.data)} cy={y(pf[s.campo]!)} r="4" fill={s.cor} stroke="var(--color-papel)" strokeWidth="2" /> : null,
              )}
            </g>
          )}
          <rect x={MARGEM.esquerda} y={MARGEM.topo} width={w} height={h} fill="transparent" onPointerMove={mover} onPointerDown={mover} onPointerLeave={() => setFoco(null)} />
        </svg>

        {pf && (
          <div
            className="numeros pointer-events-none absolute top-2 z-10 rounded-medio border border-linha bg-papel px-3 py-2 text-xs shadow-[0_2px_8px_rgb(0_0_0/0.08)]"
            style={{ left: Math.min(Math.max(0, x(pf.data) - 90), largura - 200) }}
          >
            <p className="font-semibold">{formatarData(pf.data)}</p>
            {[...SERIES].reverse().map((s) => (
              <p key={s.campo} className="text-regua">
                {s.campo === 'planejado' ? 'Planejado' : s.campo === 'real' ? 'Realizado' : 'Agregado'}:{' '}
                <span className="font-semibold text-grafite">{pf[s.campo] !== null ? formatarMoeda(pf[s.campo]) : '—'}</span>
              </p>
            ))}
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
                <th className="px-3 py-2 text-right font-semibold">Agregado</th>
                <th className="px-3 py-2 text-right font-semibold">Realizado</th>
              </tr>
            </thead>
            <tbody>
              {pontos.map((p) => (
                <tr key={p.data} className="border-t border-linha">
                  <td className="px-3 py-1.5">{formatarData(p.data)}</td>
                  <td className="px-3 py-1.5 text-right">{p.planejado !== null ? formatarMoeda(p.planejado) : '—'}</td>
                  <td className="px-3 py-1.5 text-right">{p.agregado !== null ? formatarMoeda(p.agregado) : '—'}</td>
                  <td className="px-3 py-1.5 text-right">{p.real !== null ? formatarMoeda(p.real) : '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>
    </figure>
  );
}
