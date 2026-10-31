'use client';

import { useEffect, useRef, useState } from 'react';
import { pedirTeste, situacaoTeste } from '../acoes';
import { Botao } from '@/components/ui';

const ESPERA_MAXIMA_MS = 90_000;

/** Pede uma foto de teste ao agente e espera a resposta (o agente conversa a cada 30 s). */
export function TesteFoto({ projetoId, cameraId }: { projetoId: string; cameraId: string }) {
  const [estado, setEstado] = useState<
    { tipo: 'esperando'; desde: number } | { tipo: 'foto'; url: string } | { tipo: 'erro'; texto: string } | null
  >(null);
  const relogio = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => () => {
    if (relogio.current) clearInterval(relogio.current);
  }, []);

  async function testar() {
    const r = await pedirTeste(projetoId, cameraId);
    if (!r.ok) {
      setEstado({ tipo: 'erro', texto: r.erro });
      return;
    }
    const desde = Date.now();
    setEstado({ tipo: 'esperando', desde });
    if (relogio.current) clearInterval(relogio.current);
    relogio.current = setInterval(async () => {
      const s = await situacaoTeste(cameraId);
      if (s.respondido) {
        clearInterval(relogio.current!);
        setEstado(s.url ? { tipo: 'foto', url: s.url } : { tipo: 'erro', texto: s.erro ?? 'O agente não conseguiu a foto.' });
      } else if (Date.now() - desde > ESPERA_MAXIMA_MS) {
        clearInterval(relogio.current!);
        setEstado({ tipo: 'erro', texto: 'O agente não respondeu em 90 s. Confira se ele está ligado (lista de agentes acima).' });
      }
    }, 4000);
  }

  return (
    <div className="flex flex-col gap-3">
      <Botao type="button" variante="secundario" onClick={testar} disabled={estado?.tipo === 'esperando'} className="self-start">
        {estado?.tipo === 'esperando' ? 'Esperando o agente…' : 'Testar foto'}
      </Botao>
      {estado?.tipo === 'esperando' && (
        <p role="status" className="text-sm text-regua">
          O agente responde no próximo contato (até 30 s).
        </p>
      )}
      {estado?.tipo === 'foto' && (
        <figure className="flex flex-col gap-2">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={estado.url} alt="Foto de teste da câmera" className="aspect-video w-full max-w-xl rounded-medio border border-linha object-cover" />
          <figcaption role="status" className="text-sm font-semibold text-obra-ok">
            Foto recebida: a câmera está pronta. Confira o enquadramento.
          </figcaption>
        </figure>
      )}
      {estado?.tipo === 'erro' && (
        <p role="alert" className="text-sm text-marcador">
          {estado.texto}
        </p>
      )}
    </div>
  );
}
