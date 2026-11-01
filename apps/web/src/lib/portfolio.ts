import 'server-only';
import { custosNaArvore, indicadoresCusto, projetarTermino, semaforo, type Projeto, type RegraSemaforo, type Semaforo } from '@obras/shared';
import { buscarApontamentos, buscarEap, buscarLinhaBase, orcadoRealizado } from '@/lib/dados';

export interface ResumoPortfolio {
  semaforo: Semaforo;
  /** % físico real da obra. */
  real: number | null;
  atrasoDias: number | null;
  /** Realizado acima do valor agregado, em % (null se a pessoa não vê custos ou não há dado). */
  custoAcimaPct: number | null;
}

/** Semáforo de uma obra pelas regras da empresa: prazo (prazo agregado) e custo (realizado × agregado). */
export async function resumoDaObra(projeto: Projeto, regra: RegraSemaforo, hoje: string): Promise<ResumoPortfolio> {
  const [itens, apontamentos, linhaBase, linhas] = await Promise.all([
    buscarEap(projeto.id),
    buscarApontamentos(projeto.id),
    buscarLinhaBase(projeto.id),
    orcadoRealizado(projeto.id),
  ]);
  const tarefas = itens
    .filter((i) => i.tipo === 'tarefa')
    .map((t) => ({
      id: t.id,
      custo_previsto: t.custo_previsto === null ? null : Number(t.custo_previsto),
      inicio_previsto: t.inicio_previsto,
      fim_previsto: t.fim_previsto,
      inicio_base: t.inicio_base,
      fim_base: t.fim_base,
      percentual_fisico: Number(t.percentual_fisico),
    }));
  const p = projetarTermino(tarefas, hoje, linhaBase !== null);
  const temAvanco = apontamentos.length > 0 && p.situacao !== 'sem_dados' && p.situacao !== 'nao_comecou';
  const atrasoDias = temAvanco && p.situacao !== 'concluida' ? p.atrasoDias : null;
  const custo = linhas && linhas.length > 0 ? indicadoresCusto(custosNaArvore(itens, linhas).obra).acimaPct : null;
  return {
    semaforo: semaforo({ atrasoDias, custoAcimaPct: custo }, regra),
    real: tarefas.length > 0 ? p.real : null,
    atrasoDias,
    custoAcimaPct: custo,
  };
}
