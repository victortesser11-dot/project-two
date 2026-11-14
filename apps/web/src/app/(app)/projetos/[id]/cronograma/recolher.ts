// Cronograma grande (obra real passa de mil tarefas) não abre inteiro: a tela começa nos níveis de cima
// e a pessoa abre a etapa que quer ver. Sem React, para testar.
import type { ItemEap } from '@obras/shared';

/**
 * Etapas que começam recolhidas. Até `limite` itens, nenhuma. Acima disso, fica aberto o nível mais fundo
 * que ainda cabe no limite (pelo menos o primeiro) e as etapas dali para baixo começam fechadas.
 */
export function recolhidasDeInicio(itens: Pick<ItemEap, 'id' | 'tipo' | 'nivel'>[], limite: number): Set<string> {
  if (itens.length <= limite) return new Set();
  const porNivel = new Map<number, number>();
  for (const i of itens) porNivel.set(i.nivel, (porNivel.get(i.nivel) ?? 0) + 1);
  const niveis = [...porNivel.keys()].sort((a, b) => a - b);
  let aberto = niveis[0] ?? 1;
  let soma = 0;
  for (const n of niveis) {
    soma += porNivel.get(n)!;
    if (soma > limite) break;
    aberto = n;
  }
  return new Set(itens.filter((i) => i.tipo === 'etapa' && i.nivel >= aberto).map((i) => i.id));
}
