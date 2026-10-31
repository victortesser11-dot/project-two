'use client';

import { useState, useTransition } from 'react';
import { formatarData, hojeIso, type LinhaBase } from '@obras/shared';
import { definirLinhaBase } from '../acoes';
import { Botao } from '@/components/ui';

/** Congela o cronograma atual como linha de base; pede confirmação ao redefinir. */
export function BotaoLinhaBase({
  projetoId,
  linhaBase,
  podeEditar,
}: {
  projetoId: string;
  linhaBase: LinhaBase | null;
  podeEditar: boolean;
}) {
  const [confirmando, setConfirmando] = useState(false);
  const [mensagem, setMensagem] = useState<{ tipo: 'ok' | 'erro'; texto: string } | null>(null);
  const [salvando, iniciar] = useTransition();

  function definir() {
    setMensagem(null);
    iniciar(async () => {
      const r = await definirLinhaBase(projetoId);
      setConfirmando(false);
      setMensagem(r.ok ? { tipo: 'ok', texto: r.mensagem ?? 'Linha de base definida.' } : { tipo: 'erro', texto: r.erro });
    });
  }

  return (
    <div className="flex flex-col items-start gap-2 sm:items-end">
      <p className="text-sm text-regua">
        {linhaBase
          ? `Linha de base de ${formatarData(hojeIso('America/Sao_Paulo', new Date(linhaBase.definida_em)))}, com ${linhaBase.qtd_tarefas} ${linhaBase.qtd_tarefas === 1 ? 'tarefa' : 'tarefas'}.`
          : 'Sem linha de base: defina quando o cronograma for aprovado.'}
      </p>
      {podeEditar &&
        (confirmando ? (
          <div className="flex flex-wrap items-center gap-2" role="group" aria-label="Confirmar linha de base">
            <span className="text-sm font-semibold">
              {linhaBase ? 'Substituir a linha de base pelas datas de hoje?' : 'Congelar as datas e custos atuais?'}
            </span>
            <Botao type="button" onClick={definir} disabled={salvando}>
              {salvando ? 'Salvando…' : linhaBase ? 'Substituir' : 'Congelar'}
            </Botao>
            <Botao type="button" variante="secundario" onClick={() => setConfirmando(false)} disabled={salvando}>
              Cancelar
            </Botao>
          </div>
        ) : (
          <Botao type="button" variante={linhaBase ? 'secundario' : 'primario'} onClick={() => setConfirmando(true)}>
            {linhaBase ? 'Redefinir linha de base' : 'Definir linha de base'}
          </Botao>
        ))}
      {mensagem && (
        <p role={mensagem.tipo === 'erro' ? 'alert' : 'status'} className={`text-sm ${mensagem.tipo === 'erro' ? 'text-marcador' : 'text-obra-ok'}`}>
          {mensagem.texto}
        </p>
      )}
    </div>
  );
}
