import 'server-only';
import { cache } from 'react';
import {
  alertasCampo,
  alertasChuva,
  alertasCronograma,
  alertasEstoque,
  alertasMedicao,
  hojeIso,
  itensComSaldo,
  ordenarAlertas,
  situacaoCamera,
  type Alerta,
  type PapelProjeto,
  type Projeto,
} from '@obras/shared';
import {
  buscarEap,
  listarAgentes,
  listarCameras,
  listarContratosMedicao,
  listarDiarios,
  listarEmprestimos,
  listarItensEstoque,
  listarJustificativas,
  listarMedicoes,
  listarMovimentos,
  listarSaldos,
  podeFinanceiro,
} from '@/lib/dados';
import { previsaoChuva } from '@/lib/clima';

/**
 * Alertas da obra, calculados agora a partir dos dados (cronograma, diário, almoxarifado, medições,
 * câmeras e previsão do tempo). Um módulo que falhar não derruba os outros.
 */
export const alertasDaObra = cache(
  async (projeto: Projeto & { latitude?: number | null; longitude?: number | null }, papel: PapelProjeto | null) => {
    const hoje = hojeIso();
    const id = projeto.id;
    const vazio = <T,>(p: Promise<T[]>) => p.catch(() => [] as T[]);
    const [eap, justificativas, diarios, catalogo, saldos, movimentos, cameras, agentes, emprestimos, financeiro, previsao] = await Promise.all([
      vazio(buscarEap(id)),
      vazio(listarJustificativas(id)),
      vazio(listarDiarios(id)),
      vazio(listarItensEstoque(projeto.empresa_id)),
      vazio(listarSaldos(id)),
      vazio(listarMovimentos(id)),
      vazio(listarCameras(id)),
      vazio(listarAgentes(id)),
      vazio(listarEmprestimos({ projetoId: id, abertos: true })),
      podeFinanceiro(projeto, papel),
      projeto.latitude != null && projeto.longitude != null ? previsaoChuva(projeto.latitude, projeto.longitude) : Promise.resolve([]),
    ]);
    const [contratos, medicoes] = financeiro
      ? await Promise.all([vazio(listarContratosMedicao(id)), vazio(listarMedicoes(id))])
      : [[], []];

    const tarefas = eap
      .filter((i) => i.tipo === 'tarefa')
      .map((t) => ({ id: t.id, codigo: t.codigo, nome: t.nome, inicio_previsto: t.inicio_previsto, fim_previsto: t.fim_previsto, percentual_fisico: t.percentual_fisico }));
    const naObra = new Set(saldos.map((s) => s.item_id));
    const itens = itensComSaldo(catalogo, saldos).filter((i) => naObra.has(i.id));
    const nomeItem = new Map(catalogo.map((i) => [i.id, i.nome]));
    const porAgente = new Map(agentes.map((a) => [a.id, a]));
    const agora = new Date();

    const alertas: Alerta[] = [
      ...alertasCronograma({
        tarefas,
        justificativas,
        diarios,
        itensAbaixoDoMinimo: itens.filter((i) => i.abaixoDoMinimo).length,
        hoje,
      }),
      ...alertasChuva({ tarefas, previsao, hoje }),
      ...alertasEstoque({
        itens: itens.map((i) => ({ id: i.id, codigo: i.codigo, nome: i.nome, unidade: i.unidade, quantidade: i.quantidade, estoque_minimo: i.estoque_minimo, tipo: i.tipo })),
        saidas: movimentos.filter((m) => m.tipo === 'saida').map((m) => ({ item_id: m.item_id, data: m.data, quantidade: m.quantidade })),
        hoje,
      }),
      ...alertasMedicao({ medicoes, contratos, hoje }),
      ...alertasCampo({
        cameras: cameras.map((c) => ({ id: c.id, nome: c.nome, ...situacaoCamera(c, c.agente_id ? (porAgente.get(c.agente_id) ?? null) : null, agora) })),
        emprestimos: emprestimos.map((e) => ({
          id: e.id,
          ferramenta: nomeItem.get(e.item_id) ?? 'Ferramenta',
          responsavel: e.responsavel,
          devolver_ate: e.devolver_ate,
          devolvida_em: e.devolvida_em,
        })),
        diarios,
        inicioObra: projeto.data_inicio,
        hoje,
      }),
    ];
    return { alertas: ordenarAlertas(alertas), justificativas, previsao, tarefas };
  },
);
