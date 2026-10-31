'use client';

import { useEffect, useRef, useState } from 'react';
import { Botao, classeEntrada } from '@/components/ui';

// BarcodeDetector ainda não está nos tipos do TypeScript.
interface Detector {
  detect(fonte: CanvasImageSource): Promise<{ rawValue: string }[]>;
}
declare global {
  interface Window {
    BarcodeDetector?: new (opcoes: { formats: string[] }) => Detector;
  }
}

/**
 * Lê o QR da etiqueta pela câmera (Chrome/Android e Safari recentes têm BarcodeDetector).
 * Sem suporte ou sem permissão, sobra o campo para digitar o código (FER-0001).
 * A câmera nativa do celular também funciona: o QR é um link para a ferramenta.
 */
export function LeitorQr({ aoLer }: { aoLer: (texto: string) => void }) {
  const video = useRef<HTMLVideoElement>(null);
  const [lendo, setLendo] = useState(false);
  const [aviso, setAviso] = useState<string | null>(null);
  const [codigo, setCodigo] = useState('');
  const [temDetector, setTemDetector] = useState(false);

  useEffect(() => setTemDetector(typeof window !== 'undefined' && 'BarcodeDetector' in window), []);

  useEffect(() => {
    if (!lendo) return;
    let parar = false;
    let fluxo: MediaStream | null = null;
    (async () => {
      try {
        fluxo = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' }, audio: false });
        if (!video.current) return;
        video.current.srcObject = fluxo;
        await video.current.play();
        const detector = new window.BarcodeDetector!({ formats: ['qr_code'] });
        while (!parar) {
          const achados = await detector.detect(video.current).catch(() => []);
          if (achados[0]?.rawValue) {
            aoLer(achados[0].rawValue);
            setLendo(false);
            break;
          }
          await new Promise((r) => setTimeout(r, 250));
        }
      } catch {
        setAviso('Não foi possível abrir a câmera. Libere o acesso no navegador ou digite o código da etiqueta.');
        setLendo(false);
      }
    })();
    return () => {
      parar = true;
      fluxo?.getTracks().forEach((t) => t.stop());
    };
  }, [lendo, aoLer]);

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
        {temDetector && (
          <Botao type="button" variante={lendo ? 'secundario' : 'primario'} onClick={() => setLendo((l) => !l)}>
            {lendo ? 'Fechar a câmera' : 'Ler QR da etiqueta'}
          </Botao>
        )}
        <form
          className="flex gap-2"
          onSubmit={(e) => {
            e.preventDefault();
            if (codigo.trim()) aoLer(codigo);
          }}
        >
          <label htmlFor="codigo-ferramenta" className="sr-only">
            Código da ferramenta
          </label>
          <input
            id="codigo-ferramenta"
            value={codigo}
            onChange={(e) => setCodigo(e.target.value)}
            placeholder="Ou digite o código (FER-0001)"
            autoCapitalize="characters"
            className={`${classeEntrada} numeros sm:w-64`}
          />
          <Botao type="submit" variante="secundario">
            Buscar
          </Botao>
        </form>
      </div>
      {lendo && (
        <video ref={video} muted playsInline aria-label="Imagem da câmera para ler o QR" className="aspect-square w-full max-w-sm rounded-medio bg-grafite object-cover" />
      )}
      {aviso && (
        <p role="alert" className="text-sm text-marcador">
          {aviso}
        </p>
      )}
    </div>
  );
}
