'use client';

import { useActionState, useEffect, useState } from 'react';
import { formatarQuantidade, type ItemComSaldo, type ItemEap, type Trabalhador } from '@obras/shared';
import { registrarSaida, type EstadoForm } from '../acoes';
import { AvisoErro, Botao, Campo, classeEntrada } from '@/components/ui';

export interface GruposTarefas {
  rotulo: string;
  tarefas: Pick<ItemEap, 'id' | 'codigo' | 'nome'>[];
}

const OUTRA = 'outra';

/** Saída de material: sempre para uma tarefa. Depois de salvar, mantém tarefa e pessoa para a próxima. */
export function FormularioSaida({
  projetoId,
  materiais,
  grupos,
  equipe,
  hoje,
  itemInicial,
}: {
  projetoId: string;
  materiais: ItemComSaldo[];
  grupos: GruposTarefas[];
  equipe: Trabalhador[];
  hoje: string;
  itemInicial?: string;
}) {
  const [estado, acao, salvando] = useActionState<EstadoForm, FormData>(registrarSaida, {});
  const [itemId, setItemId] = useState(itemInicial && materiais.some((m) => m.id === itemInicial) ? itemInicial : '');
  const [pessoa, setPessoa] = useState('');
  const [rodada, setRodada] = useState(0);
  const item = materiais.find((m) => m.id === itemId);
  const e = estado.erros ?? {};
  const v = (c: string, padrao = '') => estado.valores?.[c] ?? padrao;

  useEffect(() => {
    if (estado.ok) {
      setItemId('');
      setPessoa(estado.valores?.trabalhador_id ?? '');
      setRodada((r) => r + 1);
    }
  }, [estado]);

  return (
    <form action={acao} className="flex flex-col gap-4" aria-label="Registrar saída de material">
      <input type="hidden" name="projeto_id" value={projetoId} />
      <input type="hidden" name="unidade" value={item?.unidade ?? ''} />
      <div className="grid gap-4 sm:grid-cols-2">
        <Campo rotulo="Material" nome="saida-item" erro={e.item_id} dica={item ? `Há ${formatarQuantidade(item.quantidade, item.unidade)} na obra.` : undefined}>
          <select id="saida-item" name="item_id" required value={itemId} onChange={(ev) => setItemId(ev.target.value)} className={classeEntrada}>
            <option value="">Escolha o material</option>
            {materiais.map((m) => (
              <option key={m.id} value={m.id}>
                {m.nome} · {formatarQuantidade(m.quantidade, m.unidade)}
              </option>
            ))}
          </select>
        </Campo>
        <Campo rotulo={`Quantidade${item ? ` (${item.unidade})` : ''}`} nome="saida-quantidade" erro={e.quantidade}>
          <input
            key={`q-${rodada}`}
            id="saida-quantidade"
            name="quantidade"
            required
            inputMode="decimal"
            defaultValue={estado.ok ? '' : v('quantidade')}
            className={`${classeEntrada} numeros`}
            aria-invalid={e.quantidade ? true : undefined}
          />
        </Campo>
        <Campo rotulo="Tarefa que vai usar" nome="saida-tarefa" erro={e.tarefa_id}>
          <select key={`t-${rodada}`} id="saida-tarefa" name="tarefa_id" required defaultValue={v('tarefa_id')} className={classeEntrada}>
            <option value="">Escolha a tarefa</option>
            {grupos
              .filter((g) => g.tarefas.length > 0)
              .map((g) => (
                <optgroup key={g.rotulo} label={g.rotulo}>
                  {g.tarefas.map((t) => (
                    <option key={t.id} value={t.id}>
                      {t.codigo} {t.nome}
                    </option>
                  ))}
                </optgroup>
              ))}
          </select>
        </Campo>
        <Campo rotulo="Quem retirou" nome="saida-pessoa" erro={e.trabalhador_id ?? e.responsavel}>
          <select
            key={`p-${rodada}`}
            id="saida-pessoa"
            name={pessoa === OUTRA ? undefined : 'trabalhador_id'}
            defaultValue={v('trabalhador_id')}
            onChange={(ev) => setPessoa(ev.target.value)}
            className={classeEntrada}
          >
            <option value="">Não informar</option>
            {equipe.map((p) => (
              <option key={p.id} value={p.id}>
                {p.nome} · {p.funcao}
              </option>
            ))}
            <option value={OUTRA}>Outra pessoa (escrever o nome)</option>
          </select>
        </Campo>
        {pessoa === OUTRA && (
          <Campo rotulo="Nome de quem retirou" nome="saida-responsavel" erro={e.responsavel}>
            <input id="saida-responsavel" name="responsavel" maxLength={160} defaultValue={v('responsavel')} className={classeEntrada} />
          </Campo>
        )}
        <Campo rotulo="Data" nome="saida-data" erro={e.data}>
          <input key={`d-${rodada}`} id="saida-data" name="data" type="date" required max={hoje} defaultValue={v('data', hoje)} className={`${classeEntrada} numeros`} />
        </Campo>
        <Campo rotulo="Observação" nome="saida-obs" erro={e.observacao}>
          <input key={`o-${rodada}`} id="saida-obs" name="observacao" maxLength={500} placeholder="Opcional" className={classeEntrada} />
        </Campo>
      </div>
      {estado.erroGeral && <AvisoErro>{estado.erroGeral}</AvisoErro>}
      {estado.ok && estado.mensagem && (
        <p role="status" className="text-sm font-semibold text-obra-ok">
          {estado.mensagem}
        </p>
      )}
      <Botao type="submit" disabled={salvando} className="self-start">
        {salvando ? 'Registrando…' : 'Registrar saída'}
      </Botao>
    </form>
  );
}
