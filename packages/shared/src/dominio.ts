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
  /** % físico (0–100). Etapas: média ponderada das tarefas de dentro. */
  percentual_fisico: number;
  /** Data do serviço do último apontamento. */
  avanco_em: string | null;
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
  /** Localização da obra (clima automático do diário). */
  latitude?: number | null;
  longitude?: number | null;
}

// ---------------------------------------------------------------- diário de obra (RF-203)

/** Clima de cada período. Espelha o enum clima_periodo do banco. */
export const CLIMAS = ['sol', 'nublado', 'chuva', 'chuva_forte'] as const;
export type Clima = (typeof CLIMAS)[number];
export const ROTULO_CLIMA: Record<Clima, string> = {
  sol: 'Sol',
  nublado: 'Nublado',
  chuva: 'Chuva',
  chuva_forte: 'Chuva forte',
};

export const STATUS_DIARIO = ['rascunho', 'assinado'] as const;
export type StatusDiario = (typeof STATUS_DIARIO)[number];

export interface Diario {
  id: string;
  data: string;
  clima_manha: Clima | null;
  clima_tarde: Clima | null;
  praticavel_manha: boolean;
  praticavel_tarde: boolean;
  temp_min: number | null;
  temp_max: number | null;
  chuva_mm: number | null;
  clima_automatico: boolean;
  ocorrencias: string | null;
  observacoes: string | null;
  status: StatusDiario;
  assinado_nome: string | null;
  assinado_em: string | null;
  hash_conteudo: string | null;
  conteudo_assinado: unknown;
}

export interface LinhaEfetivo {
  funcao: string;
  empresa_terceira: string | null;
  quantidade: number;
}

export interface FotoDiario {
  id: string;
  caminho: string;
  legenda: string | null;
  tarefa_id: string | null;
  /** URL assinada, válida por pouco tempo (o bucket é privado). */
  url: string | null;
}

// ---------------------------------------------------------------- equipe (RF-301 a 303)

/** Espelha o enum tipo_custo_mao_obra do banco. */
export const TIPOS_CUSTO_MAO_OBRA = ['hora', 'diaria', 'producao'] as const;
export type TipoCustoMaoObra = (typeof TIPOS_CUSTO_MAO_OBRA)[number];
export const ROTULO_TIPO_CUSTO: Record<TipoCustoMaoObra, string> = {
  hora: 'Por hora',
  diaria: 'Por diária',
  producao: 'Por produção',
};

export interface Empreiteira {
  id: string;
  nome: string;
  cnpj: string | null;
  situacao_cnpj: string | null;
  telefone: string | null;
  ativa: boolean;
}

/** Pessoa como o app enxerga: sem o CPF completo (o banco não entrega). */
export interface Trabalhador {
  id: string;
  nome: string;
  cpf_mascarado: string | null;
  funcao: string;
  empreiteira_id: string | null;
  telefone: string | null;
  ativo: boolean;
}

export interface CustoVigente {
  trabalhador_id: string;
  tipo: TipoCustoMaoObra;
  valor: number;
  unidade_producao: string | null;
  vigente_desde: string;
}

/** Linha da função custo_mao_obra_projeto (custo calculado no banco). */
export interface LinhaCustoMaoObra {
  data: string;
  trabalhador_id: string;
  tarefa_id: string | null;
  horas: number;
  quantidade: number | null;
  tipo: TipoCustoMaoObra | null;
  valor_unitario: number | null;
  custo: number | null;
}

// ---------------------------------------------------------------- almoxarifado (RF-401 a 404)

/** Espelha o enum tipo_item_estoque do banco. */
export const TIPOS_ITEM_ESTOQUE = ['material', 'ferramenta'] as const;
export type TipoItemEstoque = (typeof TIPOS_ITEM_ESTOQUE)[number];

/** Espelha o enum tipo_movimento_estoque do banco. */
export const TIPOS_MOVIMENTO_ESTOQUE = ['entrada', 'saida', 'ajuste'] as const;
export type TipoMovimentoEstoque = (typeof TIPOS_MOVIMENTO_ESTOQUE)[number];
export const ROTULO_MOVIMENTO: Record<TipoMovimentoEstoque, string> = {
  entrada: 'Entrada',
  saida: 'Saída',
  ajuste: 'Ajuste',
};

/** Unidades mais usadas na obra (o campo aceita outras). */
export const UNIDADES_ESTOQUE = ['un', 'sc', 'kg', 't', 'm', 'm²', 'm³', 'L', 'pç', 'cx', 'rl', 'br', 'gl', 'lata', 'milheiro', 'pct', 'jg'] as const;

export interface ItemEstoque {
  id: string;
  codigo: string;
  nome: string;
  tipo: TipoItemEstoque;
  unidade: string;
  categoria: string | null;
  estoque_minimo: number;
  patrimonio: string | null;
  ncm: string | null;
  ativo: boolean;
}

export interface SaldoEstoque {
  item_id: string;
  quantidade: number;
  custo_medio: number;
}

export interface MovimentoEstoque {
  id: string;
  item_id: string;
  tipo: TipoMovimentoEstoque;
  data: string;
  /** Entrada e saída: positiva. Ajuste: a diferença contada (pode ser negativa). */
  quantidade: number;
  valor_unitario: number;
  valor_total: number;
  fornecedor: string | null;
  nota_fiscal: string | null;
  chave_nfe: string | null;
  tarefa_id: string | null;
  trabalhador_id: string | null;
  responsavel: string | null;
  observacao: string | null;
  registrado_em: string;
}

export interface EmprestimoFerramenta {
  id: string;
  projeto_id: string;
  item_id: string;
  trabalhador_id: string | null;
  responsavel: string;
  retirada_em: string;
  devolver_ate: string | null;
  devolvida_em: string | null;
  observacao: string | null;
}

/** Vínculo "código do produto na nota do fornecedor → item do catálogo". */
export interface VinculoFornecedor {
  cnpj_fornecedor: string;
  codigo_fornecedor: string;
  item_id: string;
}
