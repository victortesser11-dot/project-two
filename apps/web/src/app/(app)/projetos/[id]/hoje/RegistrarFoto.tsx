'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Camera, Check, LoaderCircle, Search, X } from 'lucide-react';
import type { ItemEap } from '@obras/shared';
import { avisar } from '@/lib/avisos';
import { reduzirFoto } from '@/lib/imagem';
import { criarClienteNavegador } from '@/lib/supabase/client';
import { classeEntrada } from '@/components/ui';
import { excluirFoto, garantirDiario, registrarFoto } from '../diario/acoes';

const PASSOS_PCT = [25, 50, 75, 100];

/** Botão que abre a câmera do celular (no computador, o seletor de arquivo). Um <label> mantém o toque como gesto direto. */
export function BotaoFoto({ onFoto, grande = false, rotulo }: { onFoto: (arquivo: File) => void; grande?: boolean; rotulo: string }) {
  const entrada = useRef<HTMLInputElement>(null);
  return (
    <label
      className={
        grande
          ? 'flex min-h-16 cursor-pointer items-center gap-4 rounded-cartao bg-cianotipia px-4 py-3 text-white hover:bg-cianotipia-escuro focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-cianotipia sm:px-5'
          : 'inline-flex min-h-11 cursor-pointer items-center gap-2 rounded-medio border border-campo/60 bg-papel px-3 font-semibold hover:border-cianotipia hover:text-cianotipia focus-within:outline-2 focus-within:outline-cianotipia'
      }
    >
      <input
        ref={entrada}
        type="file"
        accept="image/*"
        capture="environment"
        className="sr-only"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) onFoto(f);
          if (entrada.current) entrada.current.value = '';
        }}
      />
      {grande ? (
        <>
          <span aria-hidden className="flex size-11 shrink-0 items-center justify-center rounded-medio bg-white/15">
            <Camera className="size-6" />
          </span>
          <span className="min-w-0">
            <span className="block text-lg font-semibold">{rotulo}</span>
            <span className="block text-sm text-white/85">Tire a foto, escolha o serviço e quanto está feito</span>
          </span>
        </>
      ) : (
        <>
          <Camera aria-hidden className="size-4" />
          {rotulo}
        </>
      )}
    </label>
  );
}

type Rascunho = { arquivo: File; previa: string; tarefaId: string | null; passo: 'servico' | 'quanto' };

/**
 * Registrar foto do serviço: foto → de qual serviço é (o provável já marcado) → quanto está feito (25, 50, 75, 100%
 * ou "não mudou"). A foto vai para o diário do dia com o serviço; o avanço entra pela mesma fila do apontamento
 * (funciona sem sinal). Depois de gravar, "Desfazer" por 8 s.
 */
export function RegistrarFoto({
  projetoId,
  hoje,
  sugeridas,
  todas,
  etapas,
  pctAtual,
  onApontar,
  inicio,
  onFechar,
}: {
  projetoId: string;
  hoje: string;
  /** Serviços do dia (atrasados e em andamento), na ordem de sugestão. */
  sugeridas: ItemEap[];
  /** Todos os serviços ainda abertos (para "Outro serviço"). */
  todas: ItemEap[];
  etapas: Record<string, string>;
  pctAtual: (t: ItemEap) => number;
  onApontar: (t: ItemEap, v: { percentual: number; observacao?: string }) => void;
  /** Foto escolhida (pelo botão grande ou pelo botão "Foto" de um serviço). */
  inicio: { arquivo: File; tarefaId: string | null } | null;
  onFechar: () => void;
}) {
  const router = useRouter();
  const [r, setR] = useState<Rascunho | null>(null);
  const [busca, setBusca] = useState('');
  const [buscando, setBuscando] = useState(false);
  const [pct, setPct] = useState<number | null>(null);
  const [legenda, setLegenda] = useState('');
  const [gravando, setGravando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const topo = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!inicio) return;
    const previa = URL.createObjectURL(inicio.arquivo);
    const tarefaId = inicio.tarefaId ?? sugeridas[0]?.id ?? null;
    setR({ arquivo: inicio.arquivo, previa, tarefaId, passo: inicio.tarefaId ? 'quanto' : 'servico' });
    setBusca('');
    setBuscando(false);
    setLegenda('');
    setErro(null);
    setPct(null);
    topo.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    return () => URL.revokeObjectURL(previa);
    // Cada foto nova recomeça o fluxo.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [inicio]);

  const tarefa = useMemo(() => todas.find((t) => t.id === r?.tarefaId) ?? null, [todas, r?.tarefaId]);
  const atual = tarefa ? Math.round(pctAtual(tarefa)) : 0;
  // Sugere o próximo degrau acima do que já estava.
  useEffect(() => {
    if (r?.passo === 'quanto' && tarefa) setPct(PASSOS_PCT.find((v) => v > atual) ?? 100);
  }, [r?.passo, tarefa, atual]);

  const achadas = useMemo(() => {
    const q = busca.trim().toLowerCase();
    if (!q) return [];
    return todas.filter((t) => `${t.codigo} ${t.nome} ${etapas[t.id] ?? ''}`.toLowerCase().includes(q)).slice(0, 8);
  }, [busca, todas, etapas]);

  if (!r) return null;

  function fechar() {
    setR(null);
    onFechar();
  }

  async function gravar() {
    if (!r || !tarefa) return;
    if (!navigator.onLine) {
      setErro('Sem sinal: a foto precisa de internet para subir. Tente de novo quando o sinal voltar; o avanço você pode apontar no serviço, que fica guardado no aparelho.');
      return;
    }
    setGravando(true);
    setErro(null);
    try {
      const d = await garantirDiario(projetoId, hoje);
      if (!d.ok || !d.valor) throw new Error(d.ok ? 'Não foi possível abrir o diário de hoje.' : d.erro);
      const blob = await reduzirFoto(r.arquivo);
      const fotoId = crypto.randomUUID();
      const caminho = `${projetoId}/${d.valor}/${fotoId}.jpg`;
      const up = await criarClienteNavegador().storage.from('diario').upload(caminho, blob, { contentType: 'image/jpeg', upsert: false });
      if (up.error) throw new Error(up.error.message);
      const foto = await registrarFoto(projetoId, d.valor, { id: fotoId, caminho, legenda: legenda.trim() || null, tarefaId: tarefa.id });
      if (!foto.ok) throw new Error(foto.erro);

      const anterior = atual;
      const mudou = pct !== null && pct !== anterior;
      if (mudou) onApontar(tarefa, { percentual: pct, observacao: legenda.trim() || 'Com foto' });
      const t = tarefa;
      avisar.comDesfazer(mudou ? `Gravado: ${t.nome}, ${pct}% com foto.` : `Foto gravada em ${t.nome}.`, () => {
        void excluirFoto(projetoId, fotoId).then((x) => {
          if (!x.ok) avisar.erro(x.erro);
          else router.refresh();
        });
        if (mudou) onApontar(t, { percentual: anterior, observacao: 'Desfeito no registro com foto' });
      });
      fechar();
      router.refresh();
    } catch (e) {
      setErro(`A foto não subiu: ${e instanceof Error ? e.message : 'erro desconhecido'}. Nada foi gravado; tente de novo.`);
    } finally {
      setGravando(false);
    }
  }

  const opcao = (t: ItemEap) => {
    const marcado = r.tarefaId === t.id;
    return (
      <li key={t.id}>
        <button
          type="button"
          role="radio"
          aria-checked={marcado}
          onClick={() => setR({ ...r, tarefaId: t.id })}
          className={`flex min-h-14 w-full items-center gap-3 rounded-medio border-2 px-3 py-2 text-left ${
            marcado ? 'border-cianotipia bg-cianotipia-claro' : 'border-linha bg-papel hover:border-campo'
          }`}
        >
          <span className="min-w-0 flex-1">
            <span className="block font-semibold break-words">{t.nome}</span>
            <span className="block text-sm text-regua">
              {etapas[t.id] ?? t.codigo} · <span className="numeros">{Math.round(pctAtual(t))}%</span>
            </span>
          </span>
          {marcado && <Check aria-hidden className="size-5 shrink-0 text-cianotipia" />}
        </button>
      </li>
    );
  };

  return (
    <section ref={topo} aria-labelledby="titulo-registrar" className="cartao scroll-mt-24 overflow-hidden">
      <div className="flex items-center justify-between gap-3 border-b border-linha px-4 py-3">
        <h2 id="titulo-registrar" className="font-semibold">
          Registrar foto <span className="numeros font-normal text-regua">· passo {r.passo === 'servico' ? 2 : 3} de 3</span>
        </h2>
        <button type="button" onClick={fechar} disabled={gravando} className="flex size-11 items-center justify-center rounded-medio text-regua hover:bg-concreto" aria-label="Cancelar o registro">
          <X aria-hidden className="size-5" />
        </button>
      </div>
      <div className="flex flex-col gap-4 p-4">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src={r.previa} alt="Foto que vai ser gravada" className="max-h-40 w-full rounded-medio object-cover" />

        {r.passo === 'servico' ? (
          <>
            <p className="text-lg font-semibold">De qual serviço é?</p>
            <ul role="radiogroup" aria-label="Serviço da foto" className="flex flex-col gap-2">
              {sugeridas.slice(0, 6).map(opcao)}
              {r.tarefaId && !sugeridas.slice(0, 6).some((t) => t.id === r.tarefaId) && tarefa && opcao(tarefa)}
            </ul>
            {buscando ? (
              <div className="flex flex-col gap-2">
                <label className="relative">
                  <span className="sr-only">Buscar serviço</span>
                  <Search aria-hidden className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-regua" />
                  <input autoFocus value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Nome do serviço ou do lugar" className={`${classeEntrada} pl-9`} />
                </label>
                {achadas.length > 0 && <ul className="flex flex-col gap-2">{achadas.map(opcao)}</ul>}
                {busca.trim() && achadas.length === 0 && <p className="text-sm text-regua">Nenhum serviço com esse nome.</p>}
              </div>
            ) : (
              <button type="button" onClick={() => setBuscando(true)} className="min-h-11 self-start font-semibold text-cianotipia underline-offset-4 hover:underline">
                Outro serviço (buscar)
              </button>
            )}
            <button
              type="button"
              disabled={!r.tarefaId}
              onClick={() => setR({ ...r, passo: 'quanto' })}
              className="min-h-14 rounded-medio bg-cianotipia px-4 text-lg font-semibold text-white hover:bg-cianotipia-escuro disabled:bg-regua/50"
            >
              Continuar
            </button>
          </>
        ) : tarefa ? (
          <>
            <div>
              <p className="text-lg font-semibold break-words">{tarefa.nome}: quanto está feito?</p>
              <p className="numeros text-sm text-regua">
                Estava em {atual}%.{' '}
                <button type="button" onClick={() => setR({ ...r, passo: 'servico' })} className="font-semibold text-cianotipia underline-offset-4 hover:underline">
                  Trocar serviço
                </button>
              </p>
            </div>
            <div role="radiogroup" aria-label="Quanto está feito" className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              {PASSOS_PCT.map((v) => (
                <button
                  key={v}
                  type="button"
                  role="radio"
                  aria-checked={pct === v}
                  onClick={() => setPct(v)}
                  className={`numeros min-h-14 rounded-medio border-2 text-lg font-bold ${
                    pct === v ? 'border-cianotipia bg-cianotipia text-white' : 'border-linha bg-papel hover:border-campo'
                  }`}
                >
                  {v}%
                </button>
              ))}
            </div>
            <button
              type="button"
              role="radio"
              aria-checked={pct === null}
              onClick={() => setPct(null)}
              className={`min-h-12 rounded-medio border-2 px-3 text-left font-semibold ${pct === null ? 'border-cianotipia bg-cianotipia-claro' : 'border-linha bg-papel'}`}
            >
              Não mudou (gravar só a foto)
            </button>
            <label className="flex flex-col gap-1 text-sm font-medium">
              Observação (opcional)
              <input value={legenda} onChange={(e) => setLegenda(e.target.value)} maxLength={200} className={classeEntrada} placeholder="Ex.: falta a última fiada" />
            </label>
            {erro && (
              <p role="alert" className="rounded-medio bg-marcador-claro px-3 py-2 text-sm text-marcador">
                {erro}
              </p>
            )}
            <button
              type="button"
              onClick={() => void gravar()}
              disabled={gravando}
              className="flex min-h-14 items-center justify-center gap-2 rounded-medio bg-cianotipia px-4 text-lg font-semibold text-white hover:bg-cianotipia-escuro disabled:bg-regua/50"
            >
              {gravando && <LoaderCircle aria-hidden className="size-5 animate-spin" />}
              {gravando ? 'Gravando…' : 'Gravar'}
            </button>
          </>
        ) : null}
      </div>
    </section>
  );
}
