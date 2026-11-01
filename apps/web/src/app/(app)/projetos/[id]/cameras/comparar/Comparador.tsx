'use client';

import { useRef, useState } from 'react';

type Foto = { url: string; rotulo: string };
type Modo = 'lado' | 'cortina';

/**
 * Duas fotos da mesma câmera: lado a lado ou sobrepostas com uma cortina que corre.
 * O zoom e o arraste valem para as duas ao mesmo tempo (o mesmo ponto da obra nas duas).
 */
export function Comparador({ antes, depois }: { antes: Foto; depois: Foto }) {
  const [modo, setModo] = useState<Modo>('cortina');
  const [cortina, setCortina] = useState(50);
  const [zoom, setZoom] = useState(1);
  const [deslocamento, setDeslocamento] = useState({ x: 0, y: 0 });
  const arraste = useRef<{ x: number; y: number; dx: number; dy: number } | null>(null);

  const transformacao = { transform: `translate(${deslocamento.x}%, ${deslocamento.y}%) scale(${zoom})`, transformOrigin: 'center' };
  const limite = (v: number) => Math.max(-50 * (zoom - 1), Math.min(50 * (zoom - 1), v));

  function mudarZoom(z: number) {
    setZoom(z);
    if (z === 1) setDeslocamento({ x: 0, y: 0 });
  }

  const eventosArraste = {
    onPointerDown: (e: React.PointerEvent<HTMLDivElement>) => {
      if (zoom === 1) return;
      e.currentTarget.setPointerCapture(e.pointerId);
      arraste.current = { x: e.clientX, y: e.clientY, dx: deslocamento.x, dy: deslocamento.y };
    },
    onPointerMove: (e: React.PointerEvent<HTMLDivElement>) => {
      if (!arraste.current) return;
      const caixa = e.currentTarget.getBoundingClientRect();
      setDeslocamento({
        x: limite(arraste.current.dx + ((e.clientX - arraste.current.x) / caixa.width) * 100),
        y: limite(arraste.current.dy + ((e.clientY - arraste.current.y) / caixa.height) * 100),
      });
    },
    onPointerUp: () => {
      arraste.current = null;
    },
  };

  const quadro = (f: Foto, extra = '') => (
    // eslint-disable-next-line @next/next/no-img-element
    <img src={f.url} alt={f.rotulo} draggable={false} style={transformacao} className={`absolute inset-0 h-full w-full object-cover select-none ${extra}`} />
  );

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-3">
        <div role="radiogroup" aria-label="Como comparar" className="inline-flex rounded-medio border border-linha bg-concreto p-0.5">
          {(
            [
              ['cortina', 'Sobrepor (cortina)'],
              ['lado', 'Lado a lado'],
            ] as const
          ).map(([m, nome]) => (
            <button
              key={m}
              type="button"
              role="radio"
              aria-checked={modo === m}
              onClick={() => setModo(m)}
              className={`min-h-10 rounded-[8px] px-4 text-sm font-semibold ${modo === m ? 'bg-papel text-grafite shadow-[0_0_0_1px_var(--color-linha)]' : 'text-regua'}`}
            >
              {nome}
            </button>
          ))}
        </div>
        <div role="group" aria-label="Zoom" className="inline-flex items-center gap-1">
          {[1, 2, 3].map((z) => (
            <button
              key={z}
              type="button"
              aria-pressed={zoom === z}
              onClick={() => mudarZoom(z)}
              className={`numeros min-h-11 min-w-11 rounded-medio border px-3 text-sm font-semibold ${zoom === z ? 'border-cianotipia bg-cianotipia-claro text-cianotipia' : 'border-linha bg-papel text-regua'}`}
            >
              {z}×
            </button>
          ))}
          {zoom > 1 && <span className="ml-1 text-sm text-regua">Arraste a foto para mover</span>}
        </div>
      </div>

      {modo === 'cortina' ? (
        <div className="flex flex-col gap-3">
          <div className={`relative aspect-video overflow-hidden rounded-medio border border-linha bg-concreto touch-none ${zoom > 1 ? 'cursor-grab' : ''}`} {...eventosArraste}>
            {quadro(antes)}
            <div className="absolute inset-0" style={{ clipPath: `inset(0 0 0 ${cortina}%)` }}>
              {quadro(depois)}
            </div>
            <div aria-hidden className="pointer-events-none absolute inset-y-0 w-0.5 bg-white shadow-[0_0_0_1px_rgba(0,0,0,0.4)]" style={{ left: `${cortina}%` }} />
            <span className="numeros absolute top-2 left-2 rounded-pequeno bg-grafite/80 px-2 py-0.5 text-xs font-semibold text-white">{antes.rotulo}</span>
            <span className="numeros absolute top-2 right-2 rounded-pequeno bg-grafite/80 px-2 py-0.5 text-xs font-semibold text-white">{depois.rotulo}</span>
          </div>
          <label htmlFor="cortina" className="text-sm font-semibold">
            Cortina: arraste para ver antes e depois
          </label>
          <input id="cortina" type="range" min={0} max={100} value={cortina} onChange={(e) => setCortina(Number(e.target.value))} className="h-11 w-full accent-cianotipia" />
        </div>
      ) : (
        <div className="grid gap-3 md:grid-cols-2">
          {[antes, depois].map((f) => (
            <figure key={f.rotulo} className="flex flex-col gap-1.5">
              <div className={`relative aspect-video overflow-hidden rounded-medio border border-linha bg-concreto touch-none ${zoom > 1 ? 'cursor-grab' : ''}`} {...eventosArraste}>
                {quadro(f)}
              </div>
              <figcaption className="numeros text-sm font-semibold">{f.rotulo}</figcaption>
            </figure>
          ))}
        </div>
      )}
    </div>
  );
}
