'use client';

import { useEffect, useRef, useState } from 'react';
import { Botao } from '@/components/ui';

export interface Quadro {
  url: string;
  rotulo: string;
}

const VELOCIDADES = [2, 4, 8, 12];

/** Toca os quadros (uma foto por dia) em sequência. Não começa sozinho. */
export function Timelapse({ quadros }: { quadros: Quadro[] }) {
  const [atual, setAtual] = useState(quadros.length - 1);
  const [tocando, setTocando] = useState(false);
  const [qps, setQps] = useState(4);
  const [carregados, setCarregados] = useState(0);
  const relogio = useRef<ReturnType<typeof setInterval> | null>(null);

  // Baixa todas antes, para o vídeo não engasgar.
  useEffect(() => {
    let vivos = true;
    let n = 0;
    for (const q of quadros) {
      const img = new Image();
      img.onload = img.onerror = () => {
        n++;
        if (vivos) setCarregados(n);
      };
      img.src = q.url;
    }
    return () => {
      vivos = false;
    };
  }, [quadros]);

  useEffect(() => {
    if (!tocando) return;
    relogio.current = setInterval(() => {
      setAtual((i) => {
        if (i >= quadros.length - 1) {
          setTocando(false);
          return i;
        }
        return i + 1;
      });
    }, 1000 / qps);
    return () => {
      if (relogio.current) clearInterval(relogio.current);
    };
  }, [tocando, qps, quadros.length]);

  const q = quadros[atual]!;
  const pronto = carregados >= quadros.length;

  return (
    <div className="flex flex-col gap-3">
      <div className="relative aspect-video overflow-hidden rounded-medio border border-linha bg-grafite">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={q.url} alt={`Obra em ${q.rotulo}`} className="h-full w-full object-cover" />
        <span className="numeros absolute bottom-2 left-2 rounded-pequeno bg-grafite/80 px-2.5 py-1 text-sm font-semibold text-white">{q.rotulo}</span>
        {!pronto && (
          <span className="numeros absolute top-2 right-2 rounded-pequeno bg-grafite/80 px-2 py-0.5 text-xs text-white">
            Carregando {carregados} de {quadros.length}
          </span>
        )}
      </div>
      <div className="flex flex-wrap items-center gap-3">
        <Botao
          type="button"
          onClick={() => {
            if (!tocando && atual >= quadros.length - 1) setAtual(0);
            setTocando((t) => !t);
          }}
          disabled={quadros.length < 2}
        >
          {tocando ? 'Pausar' : atual >= quadros.length - 1 ? 'Tocar do começo' : 'Tocar'}
        </Botao>
        <label htmlFor="velocidade" className="text-sm font-semibold">
          Velocidade
        </label>
        <select id="velocidade" value={qps} onChange={(e) => setQps(Number(e.target.value))} className="min-h-11 rounded-pequeno border border-campo bg-white px-3 text-base">
          {VELOCIDADES.map((v) => (
            <option key={v} value={v}>
              {v} dias por segundo
            </option>
          ))}
        </select>
      </div>
      <label htmlFor="quadro" className="sr-only">
        Dia do time-lapse
      </label>
      <input
        id="quadro"
        type="range"
        min={0}
        max={quadros.length - 1}
        value={atual}
        onChange={(e) => {
          setTocando(false);
          setAtual(Number(e.target.value));
        }}
        aria-valuetext={q.rotulo}
        className="h-11 w-full accent-cianotipia"
      />
      <p className="numeros text-sm text-regua">
        {quadros.length} {quadros.length === 1 ? 'dia' : 'dias'} · de {quadros[0]!.rotulo} a {quadros[quadros.length - 1]!.rotulo}
      </p>
    </div>
  );
}
