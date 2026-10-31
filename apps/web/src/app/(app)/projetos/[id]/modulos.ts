// Abas do projeto, na ordem da navegação. "sprint" diz quando o módulo chega
// (ver docs/PRD.md, seção Roadmap). Ao entregar um módulo, crie a pasta dele
// em projetos/[id]/<slug>/page.tsx: ela tem prioridade sobre a rota genérica.

export interface Modulo {
  slug: string;
  nome: string;
  resumo: string;
  sprint: number;
}

export const MODULOS: Modulo[] = [
  { slug: 'cronograma', nome: 'Cronograma', resumo: 'EAP, Gantt com dependências, linha de base e tarefas do dia.', sprint: 2 },
  { slug: 'cameras', nome: 'Câmeras', resumo: 'Fotos diárias das câmeras fixas, comparação entre dias, time-lapse e leitura por IA.', sprint: 5 },
  { slug: 'almoxarifado', nome: 'Almoxarifado', resumo: 'Entradas, saídas por tarefa, estoque mínimo e ferramentas com QR code.', sprint: 4 },
  { slug: 'equipe', nome: 'Equipe', resumo: 'Pessoas e empreiteiras, chamada diária e custo de mão de obra por tarefa.', sprint: 3 },
  { slug: 'orcamento', nome: 'Orçamento', resumo: 'Orçamento por etapa, físico-financeiro, orçado × realizado e curva S.', sprint: 6 },
  { slug: 'diario', nome: 'Diário de obra', resumo: 'Clima, ocorrências e fotos do celular, com PDF assinado.', sprint: 2 },
];

export function moduloPorSlug(slug: string) {
  return MODULOS.find((m) => m.slug === slug);
}
