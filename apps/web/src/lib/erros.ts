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
  diario_obra_temperaturas_ck: 'A máxima não pode ser menor que a mínima.',
  diario_efetivo_quantidade_check: 'A quantidade precisa ficar entre 1 e 999.',
  projeto_coordenadas_ck: 'Informe latitude e longitude juntas.',
  trabalhador_cpf_uk: 'Esse CPF já está cadastrado nesta empresa.',
  trabalhador_cpf_check: 'CPF inválido: confira os números.',
  custo_mao_obra_unidade_ck: 'Custo por produção precisa da unidade (ex.: m², m³, un).',
  custo_mao_obra_valor_check: 'O valor precisa ser maior que zero.',
  apontamento_mao_obra_presenca_ck: 'Quem veio precisa de horas; quem faltou, não.',
  item_estoque_codigo_uk: 'Já existe um item com esse código no catálogo.',
  item_estoque_nome_check: 'O nome do item precisa ter entre 2 e 200 caracteres.',
  item_estoque_ncm_check: 'O NCM tem 8 dígitos.',
  item_estoque_unidade_check: 'Informe a unidade (até 20 caracteres).',
  saldo_estoque_quantidade_check: 'O saldo não pode ficar negativo.',
  emprestimo_ferramenta_aberto_uk: 'Esta ferramenta acabou de ser emprestada por outra pessoa. Atualize a página.',
  emprestimo_ferramenta_responsavel_check: 'Informe com quem a ferramenta vai ficar.',
  regra_semaforo_ordem_ck: 'O vermelho precisa de mais dias e de um percentual maior que o amarelo.',
  despesa_valor_check: 'O valor precisa ser maior que zero.',
  compromisso_valor_check: 'O valor precisa ser maior que zero.',
  compromisso_cnpj_check: 'CNPJ inválido: confira os números.',
  orcamento_versao_nome_check: 'Dê um nome de 2 a 80 caracteres à versão.',
  camera_endereco_check: 'O endereço da foto começa com http://, https:// ou rtsp://.',
  camera_horarios_check: 'Escolha de 1 a 4 horários por dia.',
  agente_camera_nome_check: 'Dê um nome de 2 a 80 caracteres ao agente.',
  camera_nome_check: 'Dê um nome de 2 a 80 caracteres à câmera.',
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
