'use client';

import { useEffect, useState, useTransition } from 'react';
import { Check, LoaderCircle, PenLine, ScanEye, X } from 'lucide-react';
import { formatarData, ROTULO_SITUACAO_ACHADO, type AchadoFiscal } from '@obras/shared';
import { avisar } from '@/lib/avisos';
import { Botao, classeEntrada } from '@/components/ui';
import { SeloGravidade } from '../alertas/SeloGravidade';
import { conferirAchado, fiscalizarDia } from './acoes';

const tempo = (s: number) => (s < 60 ? `${s} s` : `${Math.floor(s / 60)} min ${String(s % 60).padStart(2, '0')} s`);

/** Escolher o dia e pedir a leitura. Mostra há quanto tempo está lendo (o modelo grátis pode levar minutos). */
export function FiscalizarDia({ projetoId, hoje, restantesHoje }: { projetoId: string; hoje: string; restantesHoje: number }) {
  const [dia, setDia] = useState(hoje);
  const [lendo, iniciar] = useTransition();
  const [erro, setErro] = useState<string | null>(null);
  const [segundos, setSegundos] = useState(0);
  useEffect(() => {
    if (!lendo) return;
    setSegundos(0);
    const id = setInterval(() => setSegundos((s) => s + 1), 1000);
    return () => clearInterval(id);
  }, [lendo]);

  function fiscalizar() {
    setErro(null);
    iniciar(async () => {
      const r = await fiscalizarDia(projetoId, dia).catch(() => ({
        ok: false as const,
        erro: 'A leitura não terminou (a conexão caiu ou o servidor passou do tempo). Tente de novo.',
      }));
      if (!r.ok) {
        setErro(r.erro);
        return;
      }
      avisar.ok(r.valor.achados ? `Leitura pronta: ${r.valor.achados} ${r.valor.achados === 1 ? 'achado' : 'achados'} para conferir.` : 'Leitura pronta: nada a apontar.');
    });
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-end gap-3">
        <label className="flex flex-col gap-1 text-sm font-medium">
          Dia
          <input type="date" value={dia} max={hoje} onChange={(e) => setDia(e.target.value)} disabled={lendo} className={`${classeEntrada} sm:w-48`} />
        </label>
        <Botao type="button" onClick={fiscalizar} disabled={lendo || !dia || restantesHoje <= 0}>
          {lendo ? <LoaderCircle aria-hidden className="size-4 animate-spin" /> : <ScanEye aria-hidden className="size-4" />}
          {lendo ? 'A IA está fiscalizando…' : 'Fiscalizar o dia com IA'}
        </Botao>
      </div>
      <p className="numeros text-sm text-regua" aria-live="polite">
        {lendo
          ? `Lendo há ${tempo(segundos)}. Pode levar até 3 minutos; não feche a página.`
          : restantesHoje > 0
            ? `Restam ${restantesHoje} leituras com IA hoje nesta obra.`
            : 'Acabaram as leituras com IA de hoje nesta obra.'}
      </p>
      {erro && (
        <p role="alert" className="rounded-medio bg-marcador-claro px-4 py-3 text-sm text-marcador">
          {erro}
        </p>
      )}
    </div>
  );
}

/** Um achado a conferir: a IA acertou, corrigir (com o avanço certo) ou a IA errou. */
export function ItemAchado({ projetoId, achado, podeConferir }: { projetoId: string; achado: AchadoFiscal; podeConferir: boolean }) {
  const [salvando, iniciar] = useTransition();
  const [corrigindo, setCorrigindo] = useState(false);
  const [percentual, setPercentual] = useState(achado.percentual_visto !== null ? String(Math.round(Number(achado.percentual_visto))) : '');
  const [resposta, setResposta] = useState('');
  const seguranca = achado.tipo === 'seguranca';
  const visto = achado.percentual_visto !== null ? Math.round(Number(achado.percentual_visto)) : null;

  function conferir(situacao: 'confirmado' | 'corrigido' | 'descartado') {
    const pct = situacao === 'corrigido' ? Number(percentual.replace(',', '.')) : null;
    if (situacao === 'corrigido' && (pct === null || Number.isNaN(pct) || pct < 0 || pct > 100)) {
      avisar.erro('Informe o avanço certo, de 0 a 100%.');
      return;
    }
    iniciar(async () => {
      const r = await conferirAchado(projetoId, { achadoId: achado.id, situacao, percentual: pct, resposta: resposta.trim() || null });
      if (!r.ok) {
        avisar.erro(r.erro);
        return;
      }
      avisar.ok(
        situacao === 'descartado'
          ? 'Anotado: a IA errou neste.'
          : pct !== null || (situacao === 'confirmado' && visto !== null && !seguranca && achado.tipo !== 'sem_evidencia')
            ? 'Conferido e avanço gravado.'
            : 'Conferido.',
      );
    });
  }

  const confirmarRotulo = seguranca
    ? 'Confirmar'
    : achado.tipo === 'sem_evidencia' || visto === null
      ? 'IA acertou'
      : `IA acertou (gravar ${visto}%)`;

  return (
    <li className="flex flex-col gap-2 px-4 py-4 sm:px-5">
      <div className="flex flex-wrap items-center gap-2">
        <SeloGravidade gravidade={achado.gravidade} />
        <span className="font-semibold">{achado.titulo}</span>
      </div>
      {(achado.detalhe || achado.evidencia) && (
        <p className="text-sm text-regua">
          {achado.detalhe}
          {achado.detalhe && achado.evidencia ? ' ' : ''}
          {achado.evidencia && <span className="italic">Onde: {achado.evidencia}</span>}
        </p>
      )}
      <p className="numeros text-xs text-regua">{formatarData(achado.data)}</p>

      {podeConferir && (
        <div className="flex flex-col gap-2">
          {seguranca && (
            <label className="flex flex-col gap-1 text-sm">
              <span className="font-medium">Providência (opcional)</span>
              <input value={resposta} onChange={(e) => setResposta(e.target.value)} maxLength={500} disabled={salvando} className={classeEntrada} placeholder="Ex.: linha de vida instalada, equipe orientada" />
            </label>
          )}
          {corrigindo && !seguranca && (
            <div className="flex flex-wrap items-end gap-2">
              <label className="flex flex-col gap-1 text-sm">
                <span className="font-medium">Avanço certo (%)</span>
                <input value={percentual} onChange={(e) => setPercentual(e.target.value)} inputMode="decimal" disabled={salvando} className={`${classeEntrada} numeros w-32`} />
              </label>
              <label className="flex min-w-48 flex-1 flex-col gap-1 text-sm">
                <span className="font-medium">Observação (opcional)</span>
                <input value={resposta} onChange={(e) => setResposta(e.target.value)} maxLength={500} disabled={salvando} className={classeEntrada} />
              </label>
              <Botao type="button" onClick={() => conferir('corrigido')} disabled={salvando}>
                {salvando ? <LoaderCircle aria-hidden className="size-4 animate-spin" /> : <Check aria-hidden className="size-4" />}
                Gravar correção
              </Botao>
            </div>
          )}
          <div className="flex flex-wrap gap-2">
            <Botao type="button" variante="secundario" onClick={() => conferir('confirmado')} disabled={salvando}>
              <Check aria-hidden className="size-4" />
              {confirmarRotulo}
            </Botao>
            {!seguranca && !corrigindo && (
              <Botao type="button" variante="secundario" onClick={() => setCorrigindo(true)} disabled={salvando}>
                <PenLine aria-hidden className="size-4" />
                Corrigir
              </Botao>
            )}
            <Botao type="button" variante="secundario" onClick={() => conferir('descartado')} disabled={salvando}>
              <X aria-hidden className="size-4" />
              IA errou
            </Botao>
          </div>
        </div>
      )}
    </li>
  );
}

export function SeloSituacao({ situacao }: { situacao: AchadoFiscal['situacao'] }) {
  const cor = situacao === 'confirmado' ? 'bg-cianotipia-claro text-cianotipia' : situacao === 'descartado' ? 'bg-concreto text-regua' : 'bg-atencao-claro text-atencao';
  return <span className={`rounded-full px-2.5 py-0.5 text-xs font-semibold whitespace-nowrap ${cor}`}>{ROTULO_SITUACAO_ACHADO[situacao]}</span>;
}
