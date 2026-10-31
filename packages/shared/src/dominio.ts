// Vocabulário do domínio. Deve espelhar os enums do banco
// (supabase/migrations/*_base.sql). Mudou lá, muda aqui.

export const PAPEIS_EMPRESA = ['admin', 'membro'] as const;
export type PapelEmpresa = (typeof PAPEIS_EMPRESA)[number];

export const PAPEIS_PROJETO = ['engenheiro', 'mestre', 'almoxarife', 'financeiro', 'leitura'] as const;
export type PapelProjeto = (typeof PAPEIS_PROJETO)[number];

export const STATUS_PROJETO = ['planejamento', 'em_andamento', 'pausado', 'concluido'] as const;
export type StatusProjeto = (typeof STATUS_PROJETO)[number];

export const ROTULO_STATUS: Record<StatusProjeto, string> = {
  planejamento: 'Planejamento',
  em_andamento: 'Em andamento',
  pausado: 'Pausado',
  concluido: 'Concluído',
};

export const ROTULO_PAPEL_PROJETO: Record<PapelProjeto, string> = {
  engenheiro: 'Engenheiro(a)',
  mestre: 'Mestre de obras',
  almoxarife: 'Almoxarife',
  financeiro: 'Financeiro',
  leitura: 'Somente leitura',
};

export const TIPOS_ITEM_EAP = ['etapa', 'tarefa'] as const;
export type TipoItemEap = (typeof TIPOS_ITEM_EAP)[number];

/** Linha da função eap_do_projeto: item com código, nível e somatórios. */
export interface ItemEap {
  id: string;
  pai_id: string | null;
  posicao: number;
  nivel: number;
  codigo: string;
  tipo: TipoItemEap;
  nome: string;
  unidade: string | null;
  quantidade: number | null;
  custo_previsto: number | null;
  inicio_previsto: string | null;
  fim_previsto: string | null;
  codigo_externo: string | null;
  qtd_filhos: number;
  qtd_tarefas: number;
  /** Linha de base (congelada). Etapas somam as tarefas de dentro. */
  inicio_base: string | null;
  fim_base: string | null;
  custo_base: number | null;
}

/** Tipos de dependência: término→início, início→início, término→término. */
export const TIPOS_DEPENDENCIA = ['ti', 'ii', 'tt'] as const;
export type TipoDependencia = (typeof TIPOS_DEPENDENCIA)[number];

export const SIGLA_DEPENDENCIA: Record<TipoDependencia, string> = { ti: 'TI', ii: 'II', tt: 'TT' };

export const ROTULO_DEPENDENCIA: Record<TipoDependencia, string> = {
  ti: 'Começa após ela terminar (TI)',
  ii: 'Começa junto com ela (II)',
  tt: 'Termina junto com ela (TT)',
};

export interface Dependencia {
  id: string;
  predecessora_id: string;
  sucessora_id: string;
  tipo: TipoDependencia;
  defasagem_dias: number;
}

export interface LinhaBase {
  definida_em: string;
  qtd_tarefas: number;
}

export interface MembroProjeto {
  usuario_id: string;
  email: string;
  papel: PapelProjeto | null;
  admin_empresa: boolean;
  voce: boolean;
}

export interface Empresa {
  id: string;
  nome: string;
}

export interface Projeto {
  id: string;
  empresa_id: string;
  nome: string;
  endereco: string | null;
  data_inicio: string | null;
  data_fim_prevista: string | null;
  orcamento_total: number | null;
  status: StatusProjeto;
  responsavel_id: string | null;
  criado_em: string;
  atualizado_em: string;
}
