// Normas regulamentadoras (NR) que a foto da obra deixa conferir. O fiscal da IA usa esta lista: só o que dá para ver
// numa câmera ou foto do diário (proteção, EPI, máquinas, organização). Documentos (ASO, treinamentos, PGR, ART) não se
// conferem por foto e ficam fora daqui. A IA cita a norma e o tema; nunca o número do subitem (ela erraria).

export interface ItemNorma {
  norma: NormaObra;
  tema: string;
  /** O que olhar na foto. */
  verificar: string;
}

export const NORMAS_OBRA = ['NR-6', 'NR-10', 'NR-11', 'NR-12', 'NR-18', 'NR-23', 'NR-24', 'NR-35'] as const;
export type NormaObra = (typeof NORMAS_OBRA)[number];

export const TITULO_NORMA: Record<NormaObra, string> = {
  'NR-6': 'Equipamento de proteção individual',
  'NR-10': 'Instalações e serviços em eletricidade',
  'NR-11': 'Transporte e movimentação de materiais',
  'NR-12': 'Máquinas e equipamentos',
  'NR-18': 'Segurança na indústria da construção',
  'NR-23': 'Proteção contra incêndios',
  'NR-24': 'Condições sanitárias e de conforto',
  'NR-35': 'Trabalho em altura',
};

export const CHECKLIST_NORMAS: readonly ItemNorma[] = [
  { norma: 'NR-6', tema: 'EPI', verificar: 'capacete com jugular, calçado de segurança, luvas e óculos conforme o serviço' },
  { norma: 'NR-35', tema: 'Trabalho em altura', verificar: 'acima de 2 m, cinto paraquedista preso a ancoragem ou linha de vida' },
  { norma: 'NR-18', tema: 'Proteção de periferia', verificar: 'guarda-corpo com rodapé nas bordas de laje e nas aberturas; plataforma de proteção (bandeja)' },
  { norma: 'NR-18', tema: 'Aberturas no piso', verificar: 'poço de elevador, shafts e vãos fechados ou com guarda-corpo' },
  { norma: 'NR-18', tema: 'Andaimes', verificar: 'piso completo e travado, guarda-corpo, acesso por escada, base firme' },
  { norma: 'NR-18', tema: 'Escavações', verificar: 'vala acima de 1,25 m escorada ou em talude, material longe da borda, escada de acesso' },
  { norma: 'NR-18', tema: 'Escadas e rampas', verificar: 'escada de mão firme, ultrapassando o apoio; rampa com guarda-corpo' },
  { norma: 'NR-18', tema: 'Organização e limpeza', verificar: 'entulho e material empilhado estável, passagens livres, pregos e pontas expostos' },
  { norma: 'NR-18', tema: 'Sinalização', verificar: 'área de risco isolada e sinalizada, carga suspensa sem gente embaixo' },
  { norma: 'NR-10', tema: 'Elétrica provisória', verificar: 'fiação exposta ou no chão molhado, quadro aberto, emendas sem proteção' },
  { norma: 'NR-11', tema: 'Içamento de cargas', verificar: 'guincho ou grua com carga amarrada, área isolada, ninguém sob a carga' },
  { norma: 'NR-12', tema: 'Máquinas', verificar: 'serra circular com coifa, betoneira e polias com proteção das partes móveis' },
  { norma: 'NR-23', tema: 'Incêndio', verificar: 'extintor visível e desobstruído perto de solda, inflamáveis e quadro elétrico' },
  { norma: 'NR-24', tema: 'Áreas de vivência', verificar: 'só se aparecer: instalações sanitárias, refeitório e água potável em condição de uso' },
];

/** "NR 35", "nr-35", "NR35" → "NR-35"; o que não é norma de obra da lista vira null. */
export function normalizarNorma(texto: unknown): NormaObra | null {
  if (typeof texto !== 'string') return null;
  const m = /NR\s*-?\s*0?(\d{1,2})/i.exec(texto);
  if (!m) return null;
  const n = `NR-${Number(m[1])}`;
  return (NORMAS_OBRA as readonly string[]).includes(n) ? (n as NormaObra) : null;
}

/** O checklist em texto, para o pedido à IA. */
export function textoChecklistNormas(): string {
  return CHECKLIST_NORMAS.map((i) => `- ${i.norma} (${i.tema}): ${i.verificar}`).join('\n');
}
