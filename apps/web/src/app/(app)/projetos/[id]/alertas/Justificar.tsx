'use client';

import { useActionState } from 'react';
import { CAUSAS_ATRASO, ROTULO_CAUSA_ATRASO, type CausaAtraso } from '@obras/shared';
import { justificarAtraso, type EstadoJustificativa } from './acoes';
import { AvisoErro, Botao, Campo, classeEntrada } from '@/components/ui';

export function Justificar({
  projetoId,
  tarefaId,
  sugestao,
  diasAtraso,
}: {
  projetoId: string;
  tarefaId: string;
  sugestao?: { causa: CausaAtraso; motivo: string };
  diasAtraso?: number;
}) {
  const [estado, acao, salvando] = useActionState<EstadoJustificativa, FormData>(justificarAtraso, {});
  const e = estado.erros ?? {};
  if (estado.ok) {
    return (
      <p role="status" className="text-sm font-semibold text-obra-ok">
        {estado.mensagem}
      </p>
    );
  }
  return (
    <form action={acao} className="flex flex-col gap-3" aria-label="Justificar atraso">
      <input type="hidden" name="projeto_id" value={projetoId} />
      <input type="hidden" name="tarefa_id" value={tarefaId} />
      <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_10rem]">
        <Campo rotulo="Causa" nome={`causa-${tarefaId}`} erro={e.causa} dica={sugestao ? `Sugestão: ${sugestao.motivo}.` : undefined}>
          <select id={`causa-${tarefaId}`} name="causa" defaultValue={sugestao?.causa ?? ''} className={classeEntrada}>
            <option value="">Escolha a causa</option>
            {CAUSAS_ATRASO.map((c) => (
              <option key={c} value={c}>
                {ROTULO_CAUSA_ATRASO[c]}
              </option>
            ))}
          </select>
        </Campo>
        <Campo rotulo="Dias de impacto" nome={`dias-${tarefaId}`} erro={e.dias_impacto} dica="Opcional">
          <input
            id={`dias-${tarefaId}`}
            name="dias_impacto"
            inputMode="numeric"
            defaultValue={diasAtraso ? String(diasAtraso) : ''}
            className={`${classeEntrada} numeros`}
          />
        </Campo>
      </div>
      <Campo rotulo="O que aconteceu" nome={`desc-${tarefaId}`} erro={e.descricao}>
        <textarea id={`desc-${tarefaId}`} name="descricao" rows={2} className={classeEntrada} placeholder="Ex.: chuva forte na terça e na quarta; laje não pôde ser concretada." />
      </Campo>
      {estado.erroGeral && <AvisoErro>{estado.erroGeral}</AvisoErro>}
      <div>
        <Botao type="submit" variante="secundario" disabled={salvando}>
          {salvando ? 'Registrando…' : 'Registrar justificativa'}
        </Botao>
      </div>
    </form>
  );
}
