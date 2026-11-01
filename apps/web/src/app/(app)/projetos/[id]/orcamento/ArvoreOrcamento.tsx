'use client';

import { useState } from 'react';
import { formatarMoeda, type ComposicaoCusto, type ItemEap } from '@obras/shared';
import { FormularioComposicao } from './Formularios';

export interface LinhaArvore {
  item: Pick<ItemEap, 'id' | 'codigo' | 'nome' | 'tipo' | 'nivel' | 'custo_previsto'>;
  composicao?: ComposicaoCusto;
  /** Soma da composição na etapa (material, mão de obra, equipamento, outros). */
  somaComposicao?: { material: number; mao_obra: number; equipamento: number; outros: number };
  /** Valor do mesmo item na versão comparada. */
  naVersao?: number | null;
}

/** EAP com o custo de cada item e a composição; a tarefa abre o formulário para quem edita. */
export function ArvoreOrcamento({
  projetoId,
  linhas,
  podeEditar,
  comparando,
}: {
  projetoId: string;
  linhas: LinhaArvore[];
  podeEditar: boolean;
  comparando: string | null;
}) {
  const [aberta, setAberta] = useState<string | null>(null);
  return (
    <ul className="divide-y divide-linha rounded-medio border border-linha bg-papel">
      <li aria-hidden className="hidden grid-cols-[minmax(0,1fr)_9rem_9rem] gap-3 px-5 py-2 text-xs font-semibold text-regua md:grid">
        <span>Item</span>
        <span className="text-right">Custo previsto</span>
        <span className="text-right">{comparando ? `Diferença × ${comparando}` : 'Material · MO · Equip.'}</span>
      </li>
      {linhas.map(({ item, composicao, somaComposicao, naVersao }) => {
        const etapa = item.tipo === 'etapa';
        const custo = item.custo_previsto === null ? null : Number(item.custo_previsto);
        const c = composicao ?? somaComposicao;
        const dif = comparando ? (custo ?? 0) - (naVersao ?? 0) : null;
        return (
          <li key={item.id} className={etapa ? 'bg-concreto/50' : ''}>
            <div
              className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-1 px-4 py-2.5 md:grid-cols-[minmax(0,1fr)_9rem_9rem] md:px-5"
              style={{ paddingLeft: `${Math.min(item.nivel - 1, 5) * 16 + 16}px` }}
            >
              <div className="min-w-0">
                {!etapa && podeEditar ? (
                  <button
                    type="button"
                    onClick={() => setAberta(aberta === item.id ? null : item.id)}
                    aria-expanded={aberta === item.id}
                    className="min-h-11 text-left hover:text-cianotipia md:min-h-0"
                  >
                    <span className="numeros text-regua">{item.codigo}</span> <span className="font-medium">{item.nome}</span>
                  </button>
                ) : (
                  <p className={etapa ? 'font-semibold' : ''}>
                    <span className="numeros font-normal text-regua">{item.codigo}</span> {item.nome}
                  </p>
                )}
              </div>
              <p className={`numeros text-right ${etapa ? 'font-semibold' : ''}`}>{custo === null ? '—' : formatarMoeda(custo)}</p>
              <p className="numeros col-span-2 text-sm text-regua md:col-span-1 md:text-right">
                {comparando ? (
                  dif === 0 ? (
                    'igual'
                  ) : (
                    <span className={dif! > 0 ? 'font-semibold text-marcador' : 'font-semibold text-obra-ok'}>
                      {dif! > 0 ? '+' : '−'}
                      {formatarMoeda(Math.abs(dif!))}
                    </span>
                  )
                ) : c && c.material + c.mao_obra + c.equipamento + c.outros > 0 ? (
                  `${formatarMoeda(c.material, { compacta: true })} · ${formatarMoeda(c.mao_obra, { compacta: true })} · ${formatarMoeda(c.equipamento, { compacta: true })}${c.outros > 0 ? ` · +${formatarMoeda(c.outros, { compacta: true })}` : ''}`
                ) : !etapa && custo ? (
                  'sem composição'
                ) : (
                  ''
                )}
              </p>
            </div>
            {aberta === item.id && (
              <div className="border-t border-linha bg-papel px-4 py-4 md:px-5">
                <FormularioComposicao projetoId={projetoId} tarefaId={item.id} composicao={composicao} custoAtual={custo} aoSalvar={() => setAberta(null)} />
              </div>
            )}
          </li>
        );
      })}
    </ul>
  );
}
