/** Uma linha da origem (planilha ou MS Project) já com valores lidos. */
export interface LinhaOrigem {
  /** Número da linha como o usuário vê no arquivo (1 = primeira linha). */
  linha: number;
  codigo: string | null;
  /** O Excel guarda "1.10" como o número 1.1; o código pode ter perdido zeros. */
  codigoEraNumero?: boolean;
  nivel: number | null;
  nome: string;
  unidade: string | null;
  quantidade: number | null;
  precoUnitario: number | null;
  total: number | null;
  inicio: string | null;
  fim: string | null;
}

export type TipoItem = 'etapa' | 'tarefa';

/** Item pronto para a função importar_eap do banco. */
export interface ItemImportado {
  chave: string;
  pai: string | null;
  tipo: TipoItem;
  nome: string;
  unidade: string | null;
  quantidade: number | null;
  custo_previsto: number | null;
  inicio_previsto: string | null;
  fim_previsto: string | null;
  codigo_externo: string | null;
  /** Só para a prévia (não vai ao banco). */
  nivel: number;
  linha: number;
}

export interface Problema {
  linha: number | null;
  gravidade: 'erro' | 'aviso';
  mensagem: string;
}

export interface ResumoImportacao {
  etapas: number;
  tarefas: number;
  niveis: number;
  custoTotal: number | null;
  inicio: string | null;
  fim: string | null;
}

export interface ResultadoImportacao {
  itens: ItemImportado[];
  problemas: Problema[];
  resumo: ResumoImportacao;
  /** Como a hierarquia foi montada, para explicar na prévia. */
  criterio: 'codigo' | 'nivel' | 'plano';
}

export const LIMITE_ITENS_IMPORTACAO = 5000;
export const LIMITE_NIVEIS_EAP = 6;
