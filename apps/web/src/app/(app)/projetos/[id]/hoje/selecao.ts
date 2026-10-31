// Quais tarefas aparecem em "Hoje" para o mestre. Sem React, para testar.
import type { ItemEap } from '@obras/shared';

export interface TarefasDoDia {
  /** Previstas para hoje e ainda não concluídas. */
  emAndamento: ItemEap[];
  /** Deviam ter terminado e não chegaram a 100%. */
  atrasadas: ItemEap[];
  /** Começam nos próximos dias (para preparar equipe e material). */
  proximas: ItemEap[];
  /** Concluídas hoje (apontadas 100% hoje). */
  concluidasHoje: ItemEap[];
}

export function tarefasDoDia(itens: ItemEap[], hoje: string, diasAFrente = 3): TarefasDoDia {
  const limite = somarDias(hoje, diasAFrente);
  const r: TarefasDoDia = { emAndamento: [], atrasadas: [], proximas: [], concluidasHoje: [] };
  for (const t of itens) {
    if (t.tipo !== 'tarefa' || !t.inicio_previsto || !t.fim_previsto) continue;
    const pct = Number(t.percentual_fisico);
    if (pct >= 100) {
      if (t.avanco_em === hoje) r.concluidasHoje.push(t);
      continue;
    }
    if (t.fim_previsto < hoje) r.atrasadas.push(t);
    else if (t.inicio_previsto <= hoje) r.emAndamento.push(t);
    else if (t.inicio_previsto <= limite || pct > 0) r.proximas.push(t);
  }
  r.atrasadas.sort((a, b) => a.fim_previsto!.localeCompare(b.fim_previsto!));
  r.proximas.sort((a, b) => a.inicio_previsto!.localeCompare(b.inicio_previsto!));
  return r;
}

/** Nome da etapa logo acima de cada tarefa (contexto no cartão). */
export function etapaDe(itens: ItemEap[]): Map<string, string> {
  const porId = new Map(itens.map((i) => [i.id, i]));
  const saida = new Map<string, string>();
  for (const i of itens) {
    const pai = i.pai_id ? porId.get(i.pai_id) : undefined;
    if (pai) saida.set(i.id, pai.nome);
  }
  return saida;
}

function somarDias(iso: string, dias: number): string {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + dias);
  return d.toISOString().slice(0, 10);
}
