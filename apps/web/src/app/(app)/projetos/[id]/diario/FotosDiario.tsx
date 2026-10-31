'use client';

import { useRouter } from 'next/navigation';
import { useRef, useState, useTransition } from 'react';
import type { FotoDiario } from '@obras/shared';
import { excluirFoto, garantirDiario, registrarFoto } from './acoes';
import { criarClienteNavegador } from '@/lib/supabase/client';
import { classeEntrada } from '@/components/ui';

const LADO_MAXIMO = 1600;

/** Reduz a foto no aparelho (até 1600 px, JPEG 80%) para subir rápido no 4G. */
async function reduzir(arquivo: File): Promise<Blob> {
  const bitmap = await createImageBitmap(arquivo, { imageOrientation: 'from-image' });
  const escala = Math.min(1, LADO_MAXIMO / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(bitmap.width * escala);
  canvas.height = Math.round(bitmap.height * escala);
  canvas.getContext('2d')!.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  return new Promise((ok, falha) => canvas.toBlob((b) => (b ? ok(b) : falha(new Error('Não foi possível ler a foto'))), 'image/jpeg', 0.8));
}

export function FotosDiario({
  projetoId,
  data,
  diarioId,
  fotos,
  tarefas,
  podeEnviar,
}: {
  projetoId: string;
  data: string;
  diarioId: string | null;
  fotos: FotoDiario[];
  tarefas: { id: string; codigo: string; nome: string }[];
  podeEnviar: boolean;
}) {
  const router = useRouter();
  const entrada = useRef<HTMLInputElement>(null);
  const [legenda, setLegenda] = useState('');
  const [tarefaId, setTarefaId] = useState('');
  const [progresso, setProgresso] = useState<string | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const [removendo, setRemovendo] = useState<string | null>(null);
  const [, iniciar] = useTransition();

  async function enviar(arquivos: FileList) {
    setErro(null);
    let id = diarioId;
    if (!id) {
      const r = await garantirDiario(projetoId, data);
      if (!r.ok || !r.valor) return setErro(r.ok ? 'Não foi possível abrir o diário.' : r.erro);
      id = r.valor;
    }
    const supabase = criarClienteNavegador();
    const lista = [...arquivos];
    for (const [i, arquivo] of lista.entries()) {
      setProgresso(`Enviando foto ${i + 1} de ${lista.length}…`);
      try {
        const blob = await reduzir(arquivo);
        const fotoId = crypto.randomUUID();
        const caminho = `${projetoId}/${id}/${fotoId}.jpg`;
        const up = await supabase.storage.from('diario').upload(caminho, blob, { contentType: 'image/jpeg', upsert: false });
        if (up.error) throw new Error(up.error.message);
        const r = await registrarFoto(projetoId, id, { id: fotoId, caminho, legenda: legenda.trim() || null, tarefaId: tarefaId || null });
        if (!r.ok) throw new Error(r.erro);
      } catch (e) {
        setErro(`A foto "${arquivo.name}" não subiu: ${e instanceof Error ? e.message : 'erro desconhecido'}. As anteriores foram salvas.`);
        break;
      }
    }
    setProgresso(null);
    setLegenda('');
    if (entrada.current) entrada.current.value = '';
    router.refresh();
  }

  function remover(f: FotoDiario) {
    setRemovendo(f.id);
    iniciar(async () => {
      const r = await excluirFoto(projetoId, f.id);
      setRemovendo(null);
      if (!r.ok) setErro(r.erro);
    });
  }

  return (
    <section aria-labelledby="titulo-fotos" className="flex flex-col gap-4 rounded-medio border border-linha bg-papel p-4 sm:p-5">
      <div className="flex items-baseline justify-between gap-3">
        <h3 id="titulo-fotos" className="text-base font-semibold">
          Fotos
        </h3>
        <span className="numeros text-sm text-regua">{fotos.length}</span>
      </div>

      {fotos.length > 0 && (
        <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          {fotos.map((f) => {
            const tarefa = tarefas.find((t) => t.id === f.tarefa_id);
            return (
              <li key={f.id} className="flex flex-col gap-1">
                {f.url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={f.url} alt={f.legenda ?? 'Foto do dia'} loading="lazy" className="aspect-[4/3] w-full rounded-pequeno border border-linha object-cover" />
                ) : (
                  <div className="flex aspect-[4/3] items-center justify-center rounded-pequeno border border-dashed border-linha text-xs text-regua">
                    Foto indisponível
                  </div>
                )}
                {f.legenda && <p className="text-sm">{f.legenda}</p>}
                {tarefa && <p className="text-xs text-regua">{tarefa.codigo} {tarefa.nome}</p>}
                {podeEnviar && (
                  <button
                    type="button"
                    onClick={() => remover(f)}
                    disabled={removendo === f.id}
                    className="min-h-11 self-start text-sm font-semibold text-marcador hover:underline underline-offset-4 disabled:text-regua"
                  >
                    {removendo === f.id ? 'Removendo…' : 'Remover'}
                  </button>
                )}
              </li>
            );
          })}
        </ul>
      )}

      {podeEnviar && (
        <div className="flex flex-col gap-3 rounded-medio bg-concreto/70 p-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="flex flex-col gap-1.5">
              <label htmlFor="foto-legenda" className="text-sm font-semibold">
                Legenda <span className="font-normal text-regua">(opcional)</span>
              </label>
              <input id="foto-legenda" value={legenda} onChange={(e) => setLegenda(e.target.value)} maxLength={300} placeholder="Ex.: fiada 12 do bloco B" className={classeEntrada} />
            </div>
            <div className="flex flex-col gap-1.5">
              <label htmlFor="foto-tarefa" className="text-sm font-semibold">
                Tarefa <span className="font-normal text-regua">(opcional)</span>
              </label>
              <select id="foto-tarefa" value={tarefaId} onChange={(e) => setTarefaId(e.target.value)} className={classeEntrada}>
                <option value="">Sem tarefa</option>
                {tarefas.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.codigo} {t.nome}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <label
            className={`flex min-h-12 cursor-pointer items-center justify-center gap-2 rounded-medio bg-cianotipia px-4 font-semibold text-white hover:bg-cianotipia-escuro has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-cianotipia ${
              progresso ? 'pointer-events-none opacity-70' : ''
            }`}
          >
            <svg aria-hidden viewBox="0 0 24 24" className="size-5" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M4 8h3l2-3h6l2 3h3v11H4z" />
              <circle cx="12" cy="13" r="3.5" />
            </svg>
            {progresso ?? 'Tirar ou escolher fotos'}
            <input
              ref={entrada}
              type="file"
              accept="image/*"
              capture="environment"
              multiple
              className="sr-only"
              onChange={(e) => e.target.files && e.target.files.length > 0 && void enviar(e.target.files)}
              disabled={progresso !== null}
            />
          </label>
          <p className="text-xs text-regua">As fotos são reduzidas no aparelho antes de subir (até 1600 px).</p>
        </div>
      )}
      {erro && (
        <p role="alert" className="text-sm text-marcador">
          {erro}
        </p>
      )}
    </section>
  );
}
