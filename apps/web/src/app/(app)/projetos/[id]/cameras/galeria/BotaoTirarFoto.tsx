'use client';

import { useState, useTransition } from 'react';
import { excluirFoto } from '../acoes';

/** Tira a foto da galeria (imagem errada, pessoa identificável). Pede confirmação. */
export function BotaoTirarFoto({ projetoId, fotoId }: { projetoId: string; fotoId: string }) {
  const [confirmando, setConfirmando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [ocupado, iniciar] = useTransition();
  if (!confirmando) {
    return (
      <button type="button" onClick={() => setConfirmando(true)} className="min-h-11 px-1 text-sm font-semibold text-regua hover:text-marcador">
        Tirar da galeria
      </button>
    );
  }
  return (
    <div className="flex flex-wrap items-center gap-2">
      <button
        type="button"
        disabled={ocupado}
        onClick={() =>
          iniciar(async () => {
            const r = await excluirFoto(projetoId, fotoId);
            if (!r.ok) setErro(r.erro);
          })
        }
        className="min-h-11 rounded-medio bg-marcador px-3 text-sm font-semibold text-white"
      >
        {ocupado ? 'Tirando…' : 'Tirar mesmo'}
      </button>
      <button type="button" onClick={() => setConfirmando(false)} className="min-h-11 px-2 text-sm font-semibold text-regua">
        Cancelar
      </button>
      {erro && (
        <p role="alert" className="w-full text-sm text-marcador">
          {erro}
        </p>
      )}
    </div>
  );
}
