import 'server-only';
import { cache } from 'react';
import { redirect } from 'next/navigation';
import type {
  ApontamentoRegistrado,
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
