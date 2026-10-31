import 'server-only';
import { cache } from 'react';
import { redirect } from 'next/navigation';
import type {
  AgenteCamera,
  Camera,
  FotoCamera,
  ApontamentoRegistrado,
  EmprestimoFerramenta,
  ItemEstoque,
  MovimentoEstoque,
  SaldoEstoque,
  VinculoFornecedor,
  Clima,
  CustoVigente,
  Empreiteira,
  LinhaCustoMaoObra,
  Trabalhador,
  Dependencia,
  Diario,
  FotoDiario,
  ItemEap,
  LinhaBase,
  LinhaEfetivo,
  MembroProjeto,
  PapelProjeto,
  Projeto,
  StatusDiario,
} from '@obras/shared';
import { criarClienteServidor } from '@/lib/supabase/server';

/** Usuário logado; sem sessão, manda para o login. */
export const exigirUsuario = cache(async () => {
  const supabase = await criarClienteServidor();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login');
  return { supabase, usuario: user };
});

/**
 * Empresa em uso. Por enquanto, a primeira em que a pessoa entrou;
 * a troca entre empresas chega quando alguém tiver mais de uma.
 */
export const empresaAtual = cache(async () => {
  const { supabase, usuario } = await exigirUsuario();
  const { data, error } = await supabase
    .from('membro_empresa')
    .select('papel, empresa:empresa_id (id, nome)')
    .eq('usuario_id', usuario.id)
    .order('criado_em', { ascending: true })
    .limit(1)
    .maybeSingle();
  if (error) throw new Error(`Não foi possível carregar a empresa: ${error.message}`);
  if (!data?.empresa) return null;
  return { id: data.empresa.id, nome: data.empresa.nome, papel: data.papel };
});

export const listarProjetos = cache(async (): Promise<Projeto[]> => {
  const { supabase } = await exigirUsuario();
  const { data, error } = await supabase
    .from('projeto')
    .select('id, empresa_id, nome, endereco, data_inicio, data_fim_prevista, orcamento_total, status, responsavel_id, criado_em, atualizado_em')
    .order('criado_em', { ascending: false });
  if (error) throw new Error(`Não foi possível carregar os projetos: ${error.message}`);
  return data ?? [];
});

export const buscarProjeto = cache(async (id: string) => {
  const { supabase, usuario } = await exigirUsuario();
  const [projeto, papel] = await Promise.all([
    supabase
      .from('projeto')
      .select('id, empresa_id, nome, endereco, data_inicio, data_fim_prevista, orcamento_total, status, responsavel_id, criado_em, atualizado_em, latitude, longitude')
      .eq('id', id)
      .maybeSingle(),
    supabase.from('membro_projeto').select('papel').eq('projeto_id', id).eq('usuario_id', usuario.id).maybeSingle(),
  ]);
  if (projeto.error) throw new Error(`Não foi possível carregar o projeto: ${projeto.error.message}`);
  return projeto.data ? { projeto: projeto.data as Projeto, papel: papel.data?.papel ?? null } : null;
});

/**
 * Pode editar o projeto (EAP, pessoas)? Engenheiro do projeto ou admin da
 * empresa. Serve só para mostrar ou esconder botões: quem barra é o banco.
 */
export async function podeEditarProjeto(projeto: Projeto, papel: PapelProjeto | null): Promise<boolean> {
  if (papel === 'engenheiro') return true;
  const empresa = await empresaAtual();
  return empresa?.papel === 'admin' && empresa.id === projeto.empresa_id;
}

/** Pode apontar avanço no campo? Engenheiro, mestre ou admin. Só para a interface. */
export async function podeApontarCampo(projeto: Projeto, papel: PapelProjeto | null): Promise<boolean> {
  if (papel === 'engenheiro' || papel === 'mestre') return true;
  return podeEditarProjeto(projeto, papel);
}

export const buscarEap = cache(async (projetoId: string): Promise<ItemEap[]> => {
  const { supabase } = await exigirUsuario();
  const { data, error } = await supabase.rpc('eap_do_projeto', { p_projeto_id: projetoId });
  if (error) throw new Error(`Não foi possível carregar a EAP: ${error.message}`);
  // A função devolve colunas que podem ser nulas; o gerador de tipos não sabe disso.
  return (data ?? []) as unknown as ItemEap[];
});

export const buscarDependencias = cache(async (projetoId: string): Promise<Dependencia[]> => {
  const { supabase } = await exigirUsuario();
  const { data, error } = await supabase
    .from('eap_dependencia')
    .select('id, predecessora_id, sucessora_id, tipo, defasagem_dias')
    .eq('projeto_id', projetoId);
  if (error) throw new Error(`Não foi possível carregar as dependências: ${error.message}`);
  return data ?? [];
});

export const buscarLinhaBase = cache(async (projetoId: string): Promise<LinhaBase | null> => {
  const { supabase } = await exigirUsuario();
  const { data, error } = await supabase
    .from('linha_base')
    .select('definida_em, qtd_tarefas')
    .eq('projeto_id', projetoId)
    .maybeSingle();
  if (error) throw new Error(`Não foi possível carregar a linha de base: ${error.message}`);
  return data;
});

/** Histórico de avanço do projeto (para a curva S). */
export const buscarApontamentos = cache(async (projetoId: string): Promise<ApontamentoRegistrado[]> => {
  const { supabase } = await exigirUsuario();
  const { data, error } = await supabase
    .from('avanco_tarefa')
    .select('tarefa_id, data, percentual, registrado_em')
    .eq('projeto_id', projetoId)
    .order('data', { ascending: true })
    .limit(20000);
  if (error) throw new Error(`Não foi possível carregar o avanço: ${error.message}`);
  return data ?? [];
});

/** Quantos itens a EAP já tem (sem montar a árvore). */
export async function contarItensEap(projetoId: string): Promise<number> {
  const { supabase } = await exigirUsuario();
  const { count, error } = await supabase
    .from('eap_item')
    .select('id', { count: 'exact', head: true })
    .eq('projeto_id', projetoId);
  if (error) throw new Error(`Não foi possível contar os itens da EAP: ${error.message}`);
  return count ?? 0;
}

export const listarMembrosProjeto = cache(async (projetoId: string): Promise<MembroProjeto[]> => {
  const { supabase } = await exigirUsuario();
  const { data, error } = await supabase.rpc('membros_do_projeto', { p_projeto_id: projetoId });
  if (error) throw new Error(`Não foi possível carregar quem acessa o projeto: ${error.message}`);
  return (data ?? []) as unknown as MembroProjeto[];
});

/** Números da EAP para o painel e o cabeçalho do cronograma. */
export function resumirEap(itens: ItemEap[]) {
  const tarefas = itens.filter((i) => i.tipo === 'tarefa');
  const custos = tarefas.map((t) => t.custo_previsto).filter((c): c is number => c !== null);
  const inicios = tarefas.map((t) => t.inicio_previsto).filter((d): d is string => d !== null).sort();
  const fins = tarefas.map((t) => t.fim_previsto).filter((d): d is string => d !== null).sort();
  return {
    etapas: itens.length - tarefas.length,
    tarefas: tarefas.length,
    custoTotal: custos.length > 0 ? Math.round(custos.reduce((s, c) => s + Number(c), 0) * 100) / 100 : null,
    inicio: inicios[0] ?? null,
    fim: fins[fins.length - 1] ?? null,
    tarefasSemCusto: tarefas.length - custos.length,
    tarefasSemData: tarefas.filter((t) => !t.inicio_previsto || !t.fim_previsto).length,
  };
}

// ---------------------------------------------------------------- diário de obra (RF-203)

export interface AvancoDoDia {
  tarefa: string;
  unidade: string | null;
  percentual: number;
  quantidade: number | null;
  observacao: string | null;
}

export interface ResumoDiario {
  id: string;
  data: string;
  status: StatusDiario;
  clima_manha: Clima | null;
  clima_tarde: Clima | null;
  pessoas: number;
  fotos: number;
}

/** Diários da obra, do mais recente para o mais antigo. */
export const listarDiarios = cache(async (projetoId: string): Promise<ResumoDiario[]> => {
  const { supabase } = await exigirUsuario();
  const { data, error } = await supabase
    .from('diario_obra')
    .select('id, data, status, clima_manha, clima_tarde, diario_efetivo(quantidade), diario_foto(id)')
    .eq('projeto_id', projetoId)
    .order('data', { ascending: false })
    .limit(200);
  if (error) throw new Error(`Não foi possível carregar os diários: ${error.message}`);
  return (data ?? []).map((d) => ({
    id: d.id,
    data: d.data,
    status: d.status,
    clima_manha: d.clima_manha,
    clima_tarde: d.clima_tarde,
    pessoas: d.diario_efetivo.reduce((s, e) => s + e.quantidade, 0),
    fotos: d.diario_foto.length,
  }));
});

/** Diário de um dia com equipe, fotos (URLs assinadas por 1 hora) e avanços apontados no dia. */
export const buscarDiario = cache(async (projetoId: string, data: string) => {
  const { supabase } = await exigirUsuario();
  const [diario, avancos] = await Promise.all([
    supabase
      .from('diario_obra')
      .select(
        'id, data, clima_manha, clima_tarde, praticavel_manha, praticavel_tarde, temp_min, temp_max, chuva_mm, clima_automatico, ' +
          'ocorrencias, observacoes, status, assinado_nome, assinado_em, hash_conteudo, conteudo_assinado',
      )
      .eq('projeto_id', projetoId)
      .eq('data', data)
      .maybeSingle(),
    supabase
      .from('avanco_tarefa')
      .select('percentual, quantidade_feita, observacao, registrado_em, tarefa:tarefa_id (nome, unidade)')
      .eq('projeto_id', projetoId)
      .eq('data', data)
      .order('registrado_em', { ascending: true }),
  ]);
  if (diario.error) throw new Error(`Não foi possível carregar o diário: ${diario.error.message}`);
  if (avancos.error) throw new Error(`Não foi possível carregar os avanços do dia: ${avancos.error.message}`);

  const avancosDoDia: AvancoDoDia[] = (avancos.data ?? []).map((a) => ({
    tarefa: a.tarefa?.nome ?? 'Tarefa removida',
    unidade: a.tarefa?.unidade ?? null,
    percentual: Number(a.percentual),
    quantidade: a.quantidade_feita === null ? null : Number(a.quantidade_feita),
    observacao: a.observacao,
  }));

  const d = diario.data as unknown as Diario | null;
  if (!d) return { diario: null, efetivo: [] as LinhaEfetivo[], fotos: [] as FotoDiario[], avancos: avancosDoDia };

  const [efetivo, fotos] = await Promise.all([
    supabase.from('diario_efetivo').select('funcao, empresa_terceira, quantidade').eq('diario_id', d.id).order('ordem'),
    supabase.from('diario_foto').select('id, caminho, legenda, tarefa_id').eq('diario_id', d.id).order('criado_em'),
  ]);
  if (efetivo.error) throw new Error(`Não foi possível carregar a equipe: ${efetivo.error.message}`);
  if (fotos.error) throw new Error(`Não foi possível carregar as fotos: ${fotos.error.message}`);

  const caminhos = (fotos.data ?? []).map((f) => f.caminho);
  const urls = new Map<string, string>();
  if (caminhos.length > 0) {
    const { data: assinadas } = await supabase.storage.from('diario').createSignedUrls(caminhos, 3600);
    for (const a of assinadas ?? []) if (a.path && a.signedUrl) urls.set(a.path, a.signedUrl);
  }

  return {
    diario: d,
    efetivo: (efetivo.data ?? []) as LinhaEfetivo[],
    fotos: (fotos.data ?? []).map((f) => ({ ...f, url: urls.get(f.caminho) ?? null })) as FotoDiario[],
    avancos: avancosDoDia,
  };
});

// ---------------------------------------------------------------- equipe (RF-301 a 303)

// Nunca select('*') em trabalhador: o banco não entrega a coluna cpf (LGPD).
const COLUNAS_TRABALHADOR = 'id, nome, cpf_mascarado, funcao, empreiteira_id, telefone, ativo';

export const listarEmpreiteiras = cache(async (empresaId: string): Promise<Empreiteira[]> => {
  const { supabase } = await exigirUsuario();
  const { data, error } = await supabase
    .from('empreiteira')
    .select('id, nome, cnpj, situacao_cnpj, telefone, ativa')
    .eq('empresa_id', empresaId)
    .order('nome');
  if (error) throw new Error(`Não foi possível carregar as empreiteiras: ${error.message}`);
  return data ?? [];
});

export const listarTrabalhadores = cache(async (empresaId: string): Promise<Trabalhador[]> => {
  const { supabase } = await exigirUsuario();
  const { data, error } = await supabase.from('trabalhador').select(COLUNAS_TRABALHADOR).eq('empresa_id', empresaId).order('nome');
  if (error) throw new Error(`Não foi possível carregar as pessoas: ${error.message}`);
  return data ?? [];
});

export const buscarTrabalhador = cache(async (id: string): Promise<(Trabalhador & { empresa_id: string }) | null> => {
  const { supabase } = await exigirUsuario();
  const { data, error } = await supabase.from('trabalhador').select(`${COLUNAS_TRABALHADOR}, empresa_id`).eq('id', id).maybeSingle();
  if (error) throw new Error(`Não foi possível carregar a pessoa: ${error.message}`);
  return data;
});

/** Pessoas na equipe da obra (ativas primeiro). */
export const listarEquipeProjeto = cache(async (projetoId: string): Promise<(Trabalhador & { na_obra: boolean })[]> => {
  const { supabase } = await exigirUsuario();
  const { data, error } = await supabase
    .from('equipe_projeto')
    .select(`ativo, trabalhador:trabalhador_id (${COLUNAS_TRABALHADOR})`)
    .eq('projeto_id', projetoId);
  if (error) throw new Error(`Não foi possível carregar a equipe da obra: ${error.message}`);
  return (data ?? [])
    .filter((e) => e.trabalhador)
    .map((e) => ({ ...(e.trabalhador as Trabalhador), na_obra: e.ativo }))
    .sort((a, b) => Number(b.na_obra) - Number(a.na_obra) || a.nome.localeCompare(b.nome, 'pt-BR'));
});

/** Custos lançados (só quem pode ver custos recebe linhas; para os outros, vazio). */
export const listarCustos = cache(async (empresaId: string): Promise<CustoVigente[]> => {
  const { supabase } = await exigirUsuario();
  const { data } = await supabase
    .from('custo_mao_obra')
    .select('trabalhador_id, tipo, valor, unidade_producao, vigente_desde')
    .eq('empresa_id', empresaId)
    .order('vigente_desde', { ascending: false });
  return (data ?? []).map((c) => ({ ...c, valor: Number(c.valor) }));
});

/** Custo vigente de cada pessoa numa data (o mais recente com vigente_desde ≤ data). */
export function custosVigentesEm(custos: CustoVigente[], data: string): Map<string, CustoVigente> {
  const m = new Map<string, CustoVigente>();
  for (const c of custos) if (c.vigente_desde <= data && !m.has(c.trabalhador_id)) m.set(c.trabalhador_id, c);
  return m;
}

export interface ApontamentoDia {
  trabalhador_id: string;
  presente: boolean;
  tarefa_id: string | null;
  horas: number | null;
  quantidade: number | null;
}

/** Chamada de um dia e a do último dia anterior com chamada (para sugerir as tarefas). */
export const buscarChamada = cache(async (projetoId: string, data: string) => {
  const { supabase } = await exigirUsuario();
  const doDia = await supabase
    .from('apontamento_mao_obra')
    .select('trabalhador_id, presente, tarefa_id, horas, quantidade')
    .eq('projeto_id', projetoId)
    .eq('data', data);
  if (doDia.error) throw new Error(`Não foi possível carregar a chamada: ${doDia.error.message}`);

  const anterior = await supabase
    .from('apontamento_mao_obra')
    .select('data')
    .eq('projeto_id', projetoId)
    .lt('data', data)
    .order('data', { ascending: false })
    .limit(1)
    .maybeSingle();
  let ultimo: ApontamentoDia[] = [];
  if (anterior.data) {
    const r = await supabase
      .from('apontamento_mao_obra')
      .select('trabalhador_id, presente, tarefa_id, horas, quantidade')
      .eq('projeto_id', projetoId)
      .eq('data', anterior.data.data);
    ultimo = (r.data ?? []) as ApontamentoDia[];
  }
  const num = (a: ApontamentoDia) => ({ ...a, horas: a.horas === null ? null : Number(a.horas), quantidade: a.quantidade === null ? null : Number(a.quantidade) });
  return {
    doDia: ((doDia.data ?? []) as ApontamentoDia[]).map(num),
    anterior: ultimo.map(num),
    dataAnterior: anterior.data?.data ?? null,
  };
});

/** Custo de mão de obra calculado no banco. null para quem não pode ver custos. */
export const custoMaoObra = cache(async (projetoId: string, de?: string, ate?: string): Promise<LinhaCustoMaoObra[] | null> => {
  const { supabase } = await exigirUsuario();
  const { data, error } = await supabase.rpc('custo_mao_obra_projeto', { p_projeto_id: projetoId, p_de: de, p_ate: ate });
  if (error) return null;
  return (data ?? []).map((l) => ({
    ...l,
    horas: Number(l.horas),
    quantidade: l.quantidade === null ? null : Number(l.quantidade),
    valor_unitario: l.valor_unitario === null ? null : Number(l.valor_unitario),
    custo: l.custo === null ? null : Number(l.custo),
  })) as LinhaCustoMaoObra[];
});

/** Pode ver custos nesta obra? Engenheiro, financeiro ou admin. Só para a interface. */
export async function podeVerCustos(projeto: Projeto, papel: PapelProjeto | null): Promise<boolean> {
  if (papel === 'engenheiro' || papel === 'financeiro') return true;
  return podeEditarProjeto(projeto, papel);
}

// ---------------------------------------------------------------- almoxarifado (RF-401 a 404)

const COLUNAS_ITEM = 'id, codigo, nome, tipo, unidade, categoria, estoque_minimo, patrimonio, ncm, ativo';

/** Catálogo da empresa (materiais e ferramentas), por nome. */
export const listarItensEstoque = cache(async (empresaId: string): Promise<ItemEstoque[]> => {
  const { supabase } = await exigirUsuario();
  const { data, error } = await supabase.from('item_estoque').select(COLUNAS_ITEM).eq('empresa_id', empresaId).order('nome');
  if (error) throw new Error(`Não foi possível carregar o catálogo: ${error.message}`);
  return (data ?? []).map((i) => ({ ...i, estoque_minimo: Number(i.estoque_minimo) }));
});

export const buscarItemEstoque = cache(async (id: string): Promise<(ItemEstoque & { empresa_id: string }) | null> => {
  const { supabase } = await exigirUsuario();
  const { data, error } = await supabase.from('item_estoque').select(`${COLUNAS_ITEM}, empresa_id`).eq('id', id).maybeSingle();
  if (error) throw new Error(`Não foi possível carregar o item: ${error.message}`);
  return data ? { ...data, estoque_minimo: Number(data.estoque_minimo) } : null;
});

export const listarSaldos = cache(async (projetoId: string): Promise<SaldoEstoque[]> => {
  const { supabase } = await exigirUsuario();
  const { data, error } = await supabase.from('saldo_estoque').select('item_id, quantidade, custo_medio').eq('projeto_id', projetoId);
  if (error) throw new Error(`Não foi possível carregar o estoque: ${error.message}`);
  return (data ?? []).map((s) => ({ item_id: s.item_id, quantidade: Number(s.quantidade), custo_medio: Number(s.custo_medio) }));
});

const COLUNAS_MOVIMENTO =
  'id, item_id, tipo, data, quantidade, valor_unitario, valor_total, fornecedor, nota_fiscal, chave_nfe, tarefa_id, trabalhador_id, responsavel, observacao, registrado_em';

/** Movimentos da obra, do mais recente para o mais antigo. */
export const listarMovimentos = cache(async (projetoId: string, limite = 5000): Promise<MovimentoEstoque[]> => {
  const { supabase } = await exigirUsuario();
  const { data, error } = await supabase
    .from('movimento_estoque')
    .select(COLUNAS_MOVIMENTO)
    .eq('projeto_id', projetoId)
    .order('data', { ascending: false })
    .order('registrado_em', { ascending: false })
    .limit(limite);
  if (error) throw new Error(`Não foi possível carregar os movimentos: ${error.message}`);
  return (data ?? []).map((m) => ({
    ...m,
    quantidade: Number(m.quantidade),
    valor_unitario: Number(m.valor_unitario),
    valor_total: Number(m.valor_total),
  }));
});

const COLUNAS_EMPRESTIMO = 'id, projeto_id, item_id, trabalhador_id, responsavel, retirada_em, devolver_ate, devolvida_em, observacao';

/** Empréstimos de ferramenta que a pessoa enxerga (das obras dela). */
export const listarEmprestimos = cache(async (filtro: { projetoId?: string; itemId?: string; abertos?: boolean }): Promise<EmprestimoFerramenta[]> => {
  const { supabase } = await exigirUsuario();
  let q = supabase.from('emprestimo_ferramenta').select(COLUNAS_EMPRESTIMO).order('retirada_em', { ascending: false }).limit(1000);
  if (filtro.projetoId) q = q.eq('projeto_id', filtro.projetoId);
  if (filtro.itemId) q = q.eq('item_id', filtro.itemId);
  if (filtro.abertos) q = q.is('devolvida_em', null);
  const { data, error } = await q;
  if (error) throw new Error(`Não foi possível carregar os empréstimos: ${error.message}`);
  return data ?? [];
});

/** Códigos de produto de fornecedores já ligados ao catálogo (para casar a próxima NF-e). */
export const listarVinculosFornecedor = cache(async (empresaId: string): Promise<VinculoFornecedor[]> => {
  const { supabase } = await exigirUsuario();
  const { data, error } = await supabase
    .from('item_fornecedor')
    .select('cnpj_fornecedor, codigo_fornecedor, item_id')
    .eq('empresa_id', empresaId)
    .limit(10000);
  if (error) throw new Error(`Não foi possível carregar os códigos de fornecedor: ${error.message}`);
  return data ?? [];
});

/** Pode dar entrada, saída, ajuste e emprestar? Engenheiro, almoxarife ou admin. Só para a interface. */
export async function podeMovimentarEstoque(projeto: Projeto, papel: PapelProjeto | null): Promise<boolean> {
  if (papel === 'engenheiro' || papel === 'almoxarife') return true;
  return podeEditarProjeto(projeto, papel);
}

/** Obras da empresa em que a pessoa movimenta o almoxarifado (engenheiro, almoxarife ou admin). */
export const obrasOndeMovimenta = cache(async (empresaId: string): Promise<Projeto[]> => {
  const { supabase, usuario } = await exigirUsuario();
  const [projetos, empresa, papeis] = await Promise.all([
    listarProjetos(),
    empresaAtual(),
    supabase.from('membro_projeto').select('projeto_id, papel').eq('usuario_id', usuario.id),
  ]);
  const admin = empresa?.papel === 'admin' && empresa.id === empresaId;
  const pode = new Set((papeis.data ?? []).filter((p) => p.papel === 'engenheiro' || p.papel === 'almoxarife').map((p) => p.projeto_id));
  return projetos.filter((p) => p.empresa_id === empresaId && p.status !== 'concluido' && (admin || pode.has(p.id)));
});

// ---------------------------------------------------------------- câmeras (RF-101 a 104)

export const listarAgentes = cache(async (projetoId: string): Promise<AgenteCamera[]> => {
  const { supabase } = await exigirUsuario();
  const { data, error } = await supabase
    .from('agente_camera')
    .select('id, nome, ativo, versao, ultimo_contato_em, criado_em')
    .eq('projeto_id', projetoId)
    .order('criado_em');
  if (error) throw new Error(`Não foi possível carregar os agentes: ${error.message}`);
  return data ?? [];
});

// Nunca select('*') em camera: o banco não entrega senha_id (fica no Vault).
const COLUNAS_CAMERA =
  'id, nome, origem, agente_id, endereco, usuario, tem_senha, horarios, ativa, ultima_foto_em, falhas_seguidas, ultimo_erro, ultimo_erro_em, teste_pedido_em, teste_respondido_em, teste_caminho, teste_erro';

export const listarCameras = cache(async (projetoId: string): Promise<Camera[]> => {
  const { supabase } = await exigirUsuario();
  const { data, error } = await supabase.from('camera').select(COLUNAS_CAMERA).eq('projeto_id', projetoId).order('criado_em');
  if (error) throw new Error(`Não foi possível carregar as câmeras: ${error.message}`);
  return (data ?? []).map((c) => ({ ...c, tem_senha: c.tem_senha ?? false }));
});

/** Fotos das câmeras da obra (sem URL; assine só as que for mostrar). */
export const listarFotosCamera = cache(
  async (projetoId: string, filtro: { cameraId?: string; de?: string; ate?: string } = {}): Promise<FotoCamera[]> => {
    const { supabase } = await exigirUsuario();
    let q = supabase
      .from('foto_camera')
      .select('id, camera_id, caminho, capturada_em, data, origem')
      .eq('projeto_id', projetoId)
      .order('capturada_em', { ascending: false })
      .limit(5000);
    if (filtro.cameraId) q = q.eq('camera_id', filtro.cameraId);
    if (filtro.de) q = q.gte('data', filtro.de);
    if (filtro.ate) q = q.lte('data', filtro.ate);
    const { data, error } = await q;
    if (error) throw new Error(`Não foi possível carregar as fotos: ${error.message}`);
    return (data ?? []).map((f) => ({ ...f, url: null }));
  },
);

/** URLs assinadas (1 h) para as fotos, em lotes. */
export async function assinarFotos<T extends { caminho: string }>(fotos: T[], segundos = 3600): Promise<(T & { url: string | null })[]> {
  if (fotos.length === 0) return [];
  const { supabase } = await exigirUsuario();
  const urls = new Map<string, string>();
  for (let i = 0; i < fotos.length; i += 200) {
    const lote = fotos.slice(i, i + 200).map((f) => f.caminho);
    const { data } = await supabase.storage.from('cameras').createSignedUrls(lote, segundos);
    for (const d of data ?? []) if (d.path && d.signedUrl) urls.set(d.path, d.signedUrl);
  }
  return fotos.map((f) => ({ ...f, url: urls.get(f.caminho) ?? null }));
}

/** A foto mais recente de cada câmera da obra. */
export const ultimasFotos = cache(async (projetoId: string): Promise<Map<string, FotoCamera>> => {
  const { supabase } = await exigirUsuario();
  const { data } = await supabase
    .from('foto_camera')
    .select('id, camera_id, caminho, capturada_em, data, origem')
    .eq('projeto_id', projetoId)
    .order('capturada_em', { ascending: false })
    .limit(200);
  const primeira = new Map<string, FotoCamera>();
  for (const f of data ?? []) if (!primeira.has(f.camera_id)) primeira.set(f.camera_id, { ...f, url: null });
  const assinadas = await assinarFotos([...primeira.values()]);
  return new Map(assinadas.map((f) => [f.camera_id, f]));
});

/** Dias com foto (para o calendário da galeria), mais recentes primeiro. */
export const diasComFoto = cache(async (projetoId: string, cameraId?: string): Promise<{ data: string; fotos: number }[]> => {
  const fotos = await listarFotosCamera(projetoId, cameraId ? { cameraId } : {});
  const conta = new Map<string, number>();
  for (const f of fotos) conta.set(f.data, (conta.get(f.data) ?? 0) + 1);
  return [...conta.entries()].map(([data, n]) => ({ data, fotos: n })).sort((a, b) => b.data.localeCompare(a.data));
});
