// Mensagens de erro do banco em linguagem de obra. As exceções que as funções
// do banco levantam já vêm em português; aqui ficam as restrições (check,
// unique) e os erros nativos do Postgres.

const RESTRICOES: Record<string, string> = {
  eap_item_datas_ck: 'O término não pode ser antes do início.',
  eap_item_etapa_sem_valores_ck: 'Etapas não têm unidade, quantidade, custo nem datas próprias: elas somam as tarefas de dentro.',
  eap_item_nome_check: 'O nome precisa ter entre 1 e 300 caracteres.',
  eap_item_unidade_check: 'A unidade pode ter no máximo 20 caracteres.',
  eap_item_quantidade_check: 'A quantidade não pode ser negativa.',
  eap_item_custo_previsto_check: 'O custo não pode ser negativo.',
  eap_item_codigo_externo_check: 'O código de origem pode ter no máximo 40 caracteres.',
  eap_item_posicao_uk: 'Outra pessoa mexeu na EAP ao mesmo tempo. Atualize a página e tente de novo.',
  eap_dependencia_distintas_ck: 'Uma tarefa não depende dela mesma.',
  eap_dependencia_defasagem_dias_check: 'A defasagem precisa ficar entre -365 e 365 dias.',
  projeto_datas_ck: 'O fim previsto não pode ser antes do início.',
  projeto_orcamento_ck: 'O orçamento precisa ser maior que zero.',
};

export interface ErroBanco {
  message: string;
  code?: string;
  details?: string | null;
}

export function mensagemDoBanco(erro: ErroBanco | null | undefined): string {
  if (!erro) return 'Algo deu errado. Tente de novo.';
  const texto = `${erro.message} ${erro.details ?? ''}`;
  for (const [restricao, mensagem] of Object.entries(RESTRICOES)) {
    if (texto.includes(restricao)) return mensagem;
  }
  if (/permission denied/i.test(erro.message)) return 'Você não tem permissão para fazer isso neste projeto.';
  if (erro.code === '22P02' || /invalid input syntax/i.test(erro.message)) return 'Algum valor está em formato inválido.';
  if (erro.code === '22008' || /date\/time field value out of range/i.test(erro.message)) return 'Alguma data é inválida.';
  if (/fetch failed|network/i.test(erro.message)) return 'Sem conexão com o servidor. Confira a internet e tente de novo.';
  return erro.message;
}
