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
