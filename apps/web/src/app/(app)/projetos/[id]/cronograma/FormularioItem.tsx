'use client';

import { useActionState, useEffect, useState } from 'react';
import type { ItemEap, TipoItemEap } from '@obras/shared';
import { salvarItem, type EstadoItem } from './acoes';
import { AvisoErro, Botao, Campo, classeEntrada } from '@/components/ui';

function numeroBr(n: number | null | undefined, casas: number) {
  if (n === null || n === undefined) return '';
  return new Intl.NumberFormat('pt-BR', { maximumFractionDigits: casas, useGrouping: false }).format(n);
}

export type ModoFormulario =
  | { modo: 'editar'; item: ItemEap }
  | { modo: 'novo'; paiId: string | null; tipo: TipoItemEap; posicao?: number; ondeTexto: string };

export function FormularioItem({
  projetoId,
  config,
  onFechar,
}: {
  projetoId: string;
  config: ModoFormulario;
  onFechar: () => void;
}) {
  const [estado, acao, salvando] = useActionState<EstadoItem, FormData>(salvarItem, {});
  const item = config.modo === 'editar' ? config.item : null;
  const [tipo, setTipo] = useState<TipoItemEap>(config.modo === 'editar' ? config.item.tipo : config.tipo);

  useEffect(() => {
    if (estado.ok) onFechar();
  }, [estado, onFechar]);

  const v = estado.valores;
  const e = estado.erros ?? {};
  const valor = (campo: string, original: string) => (v ? (v[campo] ?? '') : original);
  const prefixo = item ? `editar-${item.id}` : 'novo';
  const id = (campo: string) => `${prefixo}-${campo}`;

  return (
    <form
      action={acao}
      className="flex flex-col gap-4 border-y-2 border-cianotipia/40 bg-white px-4 py-5 sm:px-5"
      aria-label={item ? `Editar ${item.nome}` : 'Novo item da EAP'}
    >
      <input type="hidden" name="projeto_id" value={projetoId} />
      <input type="hidden" name="tipo" value={tipo} />
      {item && <input type="hidden" name="item_id" value={item.id} />}
      {config.modo === 'novo' && (
        <>
          <input type="hidden" name="pai_id" value={config.paiId ?? ''} />
          <input type="hidden" name="posicao" value={config.posicao ?? ''} />
        </>
      )}

      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <p className="font-semibold">
          {item ? `Editar ${item.codigo}` : config.modo === 'novo' ? config.ondeTexto : ''}
        </p>
        {config.modo === 'novo' && (
          <fieldset className="flex rounded-medio border border-linha p-0.5 text-sm" aria-label="Tipo">
            {(['etapa', 'tarefa'] as const).map((t) => (
              <label
                key={t}
                className={`cursor-pointer rounded-pequeno px-3 py-1.5 font-medium ${
                  tipo === t ? 'bg-cianotipia text-white' : 'text-regua hover:text-grafite'
                }`}
              >
                <input type="radio" name="tipo_escolha" value={t} checked={tipo === t} onChange={() => setTipo(t)} className="sr-only" />
                {t === 'etapa' ? 'Etapa' : 'Tarefa'}
              </label>
            ))}
          </fieldset>
        )}
      </div>

      {estado.erroGeral && <AvisoErro>{estado.erroGeral}</AvisoErro>}

      <Campo rotulo={tipo === 'etapa' ? 'Nome da etapa' : 'Nome da tarefa'} nome={id('nome')} erro={e.nome}>
        <input
          id={id('nome')}
          name="nome"
          required
          maxLength={300}
          autoFocus
          defaultValue={valor('nome', item?.nome ?? '')}
          aria-invalid={Boolean(e.nome)}
          className={classeEntrada}
          placeholder={tipo === 'etapa' ? 'Fundações' : 'Estaca hélice contínua Ø40 cm'}
        />
      </Campo>

      {tipo === 'etapa' ? (
        <p className="text-sm text-regua">Etapas somam custo e prazo das tarefas que ficam dentro delas.</p>
      ) : (
        <div className="grid grid-cols-2 gap-4 sm:grid-cols-4">
          <Campo rotulo="Unidade" nome={id('unidade')} erro={e.unidade}>
            <input id={id('unidade')} name="unidade" maxLength={20} defaultValue={valor('unidade', item?.unidade ?? '')} className={classeEntrada} placeholder="m³" />
          </Campo>
          <Campo rotulo="Quantidade" nome={id('quantidade')} erro={e.quantidade}>
            <input
              id={id('quantidade')}
              name="quantidade"
              inputMode="decimal"
              defaultValue={valor('quantidade', numeroBr(item?.quantidade, 4))}
              aria-invalid={Boolean(e.quantidade)}
              className={`${classeEntrada} numeros`}
            />
          </Campo>
          <Campo rotulo="Custo previsto (R$)" nome={id('custo_previsto')} erro={e.custo_previsto}>
            <input
              id={id('custo_previsto')}
              name="custo_previsto"
              inputMode="decimal"
              defaultValue={valor('custo_previsto', numeroBr(item?.custo_previsto, 2))}
              aria-invalid={Boolean(e.custo_previsto)}
              className={`${classeEntrada} numeros`}
              placeholder="0,00"
            />
          </Campo>
          <div className="hidden sm:block" />
          <Campo rotulo="Início" nome={id('inicio_previsto')} erro={e.inicio_previsto}>
            <input id={id('inicio_previsto')} name="inicio_previsto" type="date" defaultValue={valor('inicio_previsto', item?.inicio_previsto ?? '')} className={classeEntrada} />
          </Campo>
          <Campo rotulo="Término" nome={id('fim_previsto')} erro={e.fim_previsto}>
            <input
              id={id('fim_previsto')}
              name="fim_previsto"
              type="date"
              defaultValue={valor('fim_previsto', item?.fim_previsto ?? '')}
              aria-invalid={Boolean(e.fim_previsto)}
              className={classeEntrada}
            />
          </Campo>
        </div>
      )}

      <div className="flex flex-wrap gap-3">
        <Botao type="submit" disabled={salvando}>
          {salvando ? 'Salvando…' : item ? 'Salvar alterações' : tipo === 'etapa' ? 'Criar etapa' : 'Criar tarefa'}
        </Botao>
        <Botao type="button" variante="secundario" onClick={onFechar} disabled={salvando}>
          Cancelar
        </Botao>
      </div>
    </form>
  );
}
