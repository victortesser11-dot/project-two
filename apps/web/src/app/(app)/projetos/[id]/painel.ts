// Números do painel da obra. Roda no servidor (página), sem React, para testar.
import {
  curvaS,
  diasEntre,
  fisicoPlanejadoEm,
  projetarTermino,
  type ApontamentoRegistrado,
  type ItemEap,
  type TarefaAvanco,
} from '@obras/shared';
import { tarefasDoDia } from './hoje/selecao';

export interface ResumoEtapa {
  id: string;
  codigo: string;
  nome: string;
  real: number;
  planejado: number;
  /** Dias que o término da etapa passou da linha de base (negativo = antes). */
  desvioDias: number | null;
  tarefas: number;
}

function paraAvanco(t: ItemEap): TarefaAvanco {
  return {
    id: t.id,
    custo_previsto: t.custo_previsto === null ? null : Number(t.custo_previsto),
    inicio_previsto: t.inicio_previsto,
    fim_previsto: t.fim_previsto,
    inicio_base: t.inicio_base,
    fim_base: t.fim_base,
    percentual_fisico: Number(t.percentual_fisico),
  };
}

export function montarPainel(itens: ItemEap[], apontamentos: ApontamentoRegistrado[], temLinhaBase: boolean, hoje: string) {
  const tarefas = itens.filter((i) => i.tipo === 'tarefa');
  const avanco = tarefas.map(paraAvanco);
  const projecao = projetarTermino(avanco, hoje, temLinhaBase);
  const curva = curvaS(avanco, apontamentos, hoje, temLinhaBase);

  const comCusto = tarefas.filter((t) => t.custo_previsto !== null);
  const custoTotal = comCusto.length > 0 ? comCusto.reduce((s, t) => s + Number(t.custo_previsto), 0) : null;
  const valorExecutado =
    custoTotal !== null
      ? Math.round(comCusto.reduce((s, t) => s + (Number(t.custo_previsto) * Number(t.percentual_fisico)) / 100, 0) * 100) / 100
      : null;

  // Tarefas de cada etapa do primeiro nível (qualquer profundidade).
  const filhos = new Map<string, ItemEap[]>();
  for (const i of itens) if (i.pai_id) filhos.set(i.pai_id, [...(filhos.get(i.pai_id) ?? []), i]);
  const tarefasDe = (id: string): ItemEap[] =>
    (filhos.get(id) ?? []).flatMap((f) => (f.tipo === 'tarefa' ? [f] : tarefasDe(f.id)));

  const etapas: ResumoEtapa[] = itens
    .filter((i) => i.tipo === 'etapa' && i.nivel === 1)
    .map((e) => {
      const sub = tarefasDe(e.id);
      return {
        id: e.id,
        codigo: e.codigo,
        nome: e.nome,
        real: Number(e.percentual_fisico),
        planejado: sub.length ? fisicoPlanejadoEm(sub.map(paraAvanco), hoje, temLinhaBase) : 0,
        desvioDias: e.fim_previsto && e.fim_base ? diasEntre(e.fim_base, e.fim_previsto) : null,
        tarefas: sub.length,
      };
    })
    .filter((e) => e.tarefas > 0);

  const dia = tarefasDoDia(itens, hoje);
  return {
    projecao,
    curva,
    custoTotal,
    valorExecutado,
    etapas,
    hoje: { previstas: dia.emAndamento.length, atrasadas: dia.atrasadas.length, proximas: dia.proximas.length },
    ultimoApontamento: apontamentos.map((a) => a.data).sort().at(-1) ?? null,
  };
}
