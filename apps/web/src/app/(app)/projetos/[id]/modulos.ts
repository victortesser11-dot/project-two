// Abas do projeto, na ordem da navegação. "sprint" diz quando o módulo fica
// completo (ver docs/PRD.md, seção Roadmap); "disponivel" diz se já dá para
// usar uma parte dele. Ao entregar um módulo, crie a pasta dele em
// projetos/[id]/<slug>/page.tsx: ela tem prioridade sobre a rota genérica.

export interface Modulo {
  slug: string;
  nome: string;
  resumo: string;
  sprint: number;
  disponivel: boolean;
}

export const MODULOS: Modulo[] = [
  {
    slug: 'cronograma',
    nome: 'Cronograma',
    resumo: 'EAP montada na tela ou importada, Gantt com dependências e linha de base.',
    sprint: 2,
    disponivel: true,
  },
  { slug: 'cameras', nome: 'Câmeras', resumo: 'Fotos diárias das câmeras fixas, comparação entre dias, time-lapse e leitura por IA.', sprint: 5, disponivel: false },
  { slug: 'almoxarifado', nome: 'Almoxarifado', resumo: 'Entradas, saídas por tarefa, estoque mínimo e ferramentas com QR code.', sprint: 4, disponivel: false },
  { slug: 'equipe', nome: 'Equipe', resumo: 'Pessoas e empreiteiras, chamada diária e custo de mão de obra por tarefa.', sprint: 3, disponivel: false },
  { slug: 'orcamento', nome: 'Orçamento', resumo: 'Orçamento por etapa, físico-financeiro, orçado × realizado e curva S.', sprint: 6, disponivel: false },
  { slug: 'diario', nome: 'Diário de obra', resumo: 'Clima, ocorrências e fotos do celular, com PDF assinado.', sprint: 2, disponivel: false },
];

export function moduloPorSlug(slug: string) {
  return MODULOS.find((m) => m.slug === slug);
}
