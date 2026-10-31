'use client';

import { useState, useTransition } from 'react';
import { assinarDiario, definirLocalizacao, definirLocalizacaoPorCep } from './acoes';
import { Botao, classeEntrada } from '@/components/ui';

/** Assinatura do engenheiro, com confirmação: depois de assinado, o diário não muda. */
export function BotaoAssinar({ projetoId, diarioId, prontoParaAssinar }: { projetoId: string; diarioId: string; prontoParaAssinar: boolean }) {
  const [confirmando, setConfirmando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [assinando, iniciar] = useTransition();

  function assinar() {
    setErro(null);
    iniciar(async () => {
      const r = await assinarDiario(projetoId, diarioId);
      if (!r.ok) {
        setErro(r.erro);
        setConfirmando(false);
      }
    });
  }

  if (!prontoParaAssinar) {
    return <p className="text-sm text-regua">Preencha o clima da manhã e da tarde e salve o diário para poder assinar.</p>;
  }

  return (
    <div className="flex flex-col gap-3">
      {confirmando ? (
        <div role="group" aria-label="Confirmar assinatura" className="flex flex-col gap-3">
          <p className="text-sm font-semibold">
            Depois de assinado, o diário não muda mais. Correções viram ocorrência no diário seguinte. Assinar agora?
          </p>
          <div className="flex flex-wrap gap-2">
            <Botao type="button" onClick={assinar} disabled={assinando}>
              {assinando ? 'Assinando…' : 'Assinar diário'}
            </Botao>
            <Botao type="button" variante="secundario" onClick={() => setConfirmando(false)} disabled={assinando}>
              Cancelar
            </Botao>
          </div>
        </div>
      ) : (
        <Botao type="button" onClick={() => setConfirmando(true)} className="self-start">
          Assinar diário
        </Botao>
      )}
      {erro && (
        <p role="alert" className="text-sm text-marcador">
          {erro}
        </p>
      )}
    </div>
  );
}

/** Pega a localização do aparelho (na obra) para o clima vir sozinho. */
export function BotaoLocalizacao({ projetoId }: { projetoId: string }) {
  const [mensagem, setMensagem] = useState<{ tipo: 'ok' | 'erro'; texto: string } | null>(null);
  const [ocupado, setOcupado] = useState(false);

  function localizar() {
    if (!('geolocation' in navigator)) {
      setMensagem({ tipo: 'erro', texto: 'Este aparelho não informa a localização.' });
      return;
    }
    setOcupado(true);
    setMensagem(null);
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        const r = await definirLocalizacao(projetoId, pos.coords.latitude, pos.coords.longitude);
        setOcupado(false);
        setMensagem(r.ok ? { tipo: 'ok', texto: r.mensagem ?? 'Localização salva.' } : { tipo: 'erro', texto: r.erro });
      },
      () => {
        setOcupado(false);
        setMensagem({ tipo: 'erro', texto: 'Não foi possível pegar a localização. Libere o acesso à localização no navegador.' });
      },
      { enableHighAccuracy: false, timeout: 15000, maximumAge: 600000 },
    );
  }

  return (
    <div className="flex flex-col items-start gap-2">
      <Botao type="button" variante="secundario" onClick={localizar} disabled={ocupado}>
        {ocupado ? 'Pegando a localização…' : 'Usar a localização deste aparelho'}
      </Botao>
      {mensagem && (
        <p role={mensagem.tipo === 'erro' ? 'alert' : 'status'} className={`text-sm ${mensagem.tipo === 'erro' ? 'text-marcador' : 'text-obra-ok'}`}>
          {mensagem.texto}
        </p>
      )}
    </div>
  );
}

export function BotaoImprimir() {
  return (
    <Botao type="button" onClick={() => window.print()} className="print:hidden">
      Imprimir ou salvar em PDF
    </Botao>
  );
}

/** Alternativa à localização do aparelho: o CEP da obra (BrasilAPI traz as coordenadas). */
export function FormularioCep({ projetoId }: { projetoId: string }) {
  const [cep, setCep] = useState('');
  const [mensagem, setMensagem] = useState<{ tipo: 'ok' | 'erro'; texto: string } | null>(null);
  const [ocupado, iniciar] = useTransition();
  return (
    <div className="flex flex-col gap-2">
      <label htmlFor="cep-obra" className="text-sm font-semibold text-grafite">
        Ou pelo CEP da obra
      </label>
      <div className="flex gap-2">
        <input
          id="cep-obra"
          inputMode="numeric"
          placeholder="00000-000"
          value={cep}
          onChange={(e) => setCep(e.target.value)}
          className={`${classeEntrada} numeros max-w-40`}
        />
        <Botao
          type="button"
          variante="secundario"
          disabled={ocupado || cep.replace(/\D/g, '').length !== 8}
          onClick={() =>
            iniciar(async () => {
              const r = await definirLocalizacaoPorCep(projetoId, cep);
              setMensagem(r.ok ? { tipo: 'ok', texto: r.mensagem ?? 'Localização salva.' } : { tipo: 'erro', texto: r.erro });
            })
          }
        >
          {ocupado ? 'Buscando…' : 'Usar o CEP'}
        </Botao>
      </div>
      {mensagem && (
        <p role={mensagem.tipo === 'erro' ? 'alert' : 'status'} className={`text-sm ${mensagem.tipo === 'erro' ? 'text-marcador' : 'text-obra-ok'}`}>
          {mensagem.texto}
        </p>
      )}
    </div>
  );
}
