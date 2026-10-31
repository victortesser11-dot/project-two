'use client';

import { useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { hojeIso } from '@obras/shared';
import { registrarFotoManual } from './acoes';
import { criarClienteNavegador } from '@/lib/supabase/client';
import { reduzirFoto } from '@/lib/imagem';
import { classeBotao } from '@/components/ui';

/** Foto pelo celular para uma câmera (reserva do agente ou câmera "manual"). */
export function EnviarFoto({ projetoId, cameraId, nome }: { projetoId: string; cameraId: string; nome: string }) {
  const router = useRouter();
  const entrada = useRef<HTMLInputElement>(null);
  const [estado, setEstado] = useState<{ tipo: 'enviando' | 'ok' | 'erro'; texto: string } | null>(null);

  async function enviar(arquivo: File) {
    setEstado({ tipo: 'enviando', texto: 'Enviando…' });
    try {
      const blob = await reduzirFoto(arquivo, 1920, 0.85);
      const id = crypto.randomUUID();
      const agora = new Date();
      const caminho = `${projetoId}/${cameraId}/${hojeIso()}/manual-${id}.jpg`;
      const supabase = criarClienteNavegador();
      const up = await supabase.storage.from('cameras').upload(caminho, blob, { contentType: 'image/jpeg', upsert: false });
      if (up.error) throw new Error(up.error.message);
      const r = await registrarFotoManual(projetoId, { id, cameraId, caminho, capturadaEm: agora.toISOString(), tamanho: blob.size });
      if (!r.ok) throw new Error(r.erro);
      setEstado({ tipo: 'ok', texto: 'Foto enviada.' });
      router.refresh();
    } catch (e) {
      setEstado({ tipo: 'erro', texto: e instanceof Error ? e.message : 'Não foi possível enviar a foto.' });
    }
  }

  return (
    <div className="flex flex-col gap-1.5">
      <input
        ref={entrada}
        type="file"
        accept="image/*"
        capture="environment"
        className="sr-only"
        aria-label={`Foto para ${nome}`}
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) void enviar(f);
          e.target.value = '';
        }}
      />
      <button
        type="button"
        onClick={() => entrada.current?.click()}
        disabled={estado?.tipo === 'enviando'}
        className={classeBotao('secundario')}
      >
        {estado?.tipo === 'enviando' ? 'Enviando…' : 'Enviar foto pelo celular'}
      </button>
      {estado && estado.tipo !== 'enviando' && (
        <p role={estado.tipo === 'erro' ? 'alert' : 'status'} className={`text-sm ${estado.tipo === 'erro' ? 'text-marcador' : 'text-obra-ok'}`}>
          {estado.texto}
        </p>
      )}
    </div>
  );
}
