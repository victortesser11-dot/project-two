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
  {
    slug: 'cameras',
    nome: 'Câmeras',
    resumo: 'Fotos diárias das câmeras fixas pelo agente da obra, galeria, comparação entre dias e time-lapse. Leitura por IA na fase 2.',
    sprint: 5,
    disponivel: true,
  },
  {
    slug: 'almoxarifado',
    nome: 'Almoxarifado',
    resumo: 'Entrada pelo XML da NF-e, saídas por tarefa, custo médio, estoque mínimo, inventário e ferramentas com QR code.',
    sprint: 4,
    disponivel: true,
  },
  { slug: 'equipe', nome: 'Equipe', resumo: 'Pessoas e empreiteiras, chamada diária e custo de mão de obra por tarefa.', sprint: 3, disponivel: true },
  {
    slug: 'orcamento',
    nome: 'Orçamento',
    resumo: 'Orçamento por etapa com versões, físico-financeiro, orçado × comprometido × realizado e curva S financeira.',
    sprint: 6,
    disponivel: true,
  },
  { slug: 'diario', nome: 'Diário de obra', resumo: 'Clima, equipe, serviços, ocorrências e fotos do dia, com assinatura e PDF.', sprint: 2, disponivel: true },
];

export function moduloPorSlug(slug: string) {
  return MODULOS.find((m) => m.slug === slug);
}
