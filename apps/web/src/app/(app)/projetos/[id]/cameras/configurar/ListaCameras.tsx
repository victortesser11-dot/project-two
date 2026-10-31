'use client';

import { useState } from 'react';
import { horaCurta, ROTULO_ORIGEM_CAMERA, type AgenteCamera, type Camera } from '@obras/shared';
import { FormularioCamera } from './FormularioCamera';
import { TesteFoto } from './TesteFoto';
import { Botao } from '@/components/ui';

export function ListaCameras({ projetoId, cameras, agentes }: { projetoId: string; cameras: Camera[]; agentes: AgenteCamera[] }) {
  const [aberta, setAberta] = useState<string | null>(null);
  const nomeAgente = new Map(agentes.map((a) => [a.id, a.nome]));
  if (cameras.length === 0) return <p className="text-sm text-regua">Nenhuma câmera ainda.</p>;
  return (
    <ul className="divide-y divide-linha rounded-medio border border-linha">
      {cameras.map((c) => (
        <li key={c.id} className={`flex flex-col gap-3 px-4 py-3 ${c.ativa ? '' : 'bg-concreto/50'}`}>
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div className="min-w-0">
              <p className="font-semibold">
                {c.nome}
                {!c.ativa && <span className="ml-2 text-xs font-semibold text-regua">(desligada)</span>}
              </p>
              <p className="numeros text-sm break-all text-regua">
                {c.origem === 'agente'
                  ? `${nomeAgente.get(c.agente_id ?? '') ?? 'Agente'} · ${c.endereco} · ${c.horarios.map(horaCurta).join(', ')}${c.tem_senha ? ' · com senha' : ''}`
                  : `${ROTULO_ORIGEM_CAMERA[c.origem]} · ${c.horarios.map(horaCurta).join(', ')}`}
              </p>
            </div>
            <Botao type="button" variante="secundario" onClick={() => setAberta(aberta === c.id ? null : c.id)} aria-expanded={aberta === c.id}>
              {aberta === c.id ? 'Fechar' : 'Editar'}
            </Botao>
          </div>
          {c.origem === 'agente' && c.ativa && <TesteFoto projetoId={projetoId} cameraId={c.id} />}
          {aberta === c.id && (
            <div className="rounded-medio border border-linha p-3 sm:p-4">
              <FormularioCamera projetoId={projetoId} camera={c} agentes={agentes} aoSalvar={() => setAberta(null)} />
            </div>
          )}
        </li>
      ))}
    </ul>
  );
}
