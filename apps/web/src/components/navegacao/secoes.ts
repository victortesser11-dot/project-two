import {
  BookOpen,
  Camera,
  ChartGantt,
  ClipboardCheck,
  FolderOpen,
  HardHat,
  LayoutDashboard,
  Package,
  TriangleAlert,
  Wallet,
  type LucideIcon,
} from 'lucide-react';
import { MODULOS } from '@/app/(app)/projetos/[id]/modulos';

export type Secao = { chave: string; href: string; nome: string; resumo: string; icone: LucideIcon };

const ICONES: Record<string, LucideIcon> = {
  painel: LayoutDashboard,
  hoje: ClipboardCheck,
  alertas: TriangleAlert,
  cronograma: ChartGantt,
  cameras: Camera,
  almoxarifado: Package,
  equipe: HardHat,
  orcamento: Wallet,
  diario: BookOpen,
  arquivos: FolderOpen,
};

/** Partes da obra, na ordem do menu (lateral no computador, barra de baixo e "Mais" no celular). */
export function secoesDaObra(projetoId: string): Secao[] {
  const base = `/projetos/${projetoId}`;
  return [
    { chave: 'painel', href: base, nome: 'Painel', resumo: 'Prazo, avanço e custo da obra num relance.', icone: ICONES.painel! },
    { chave: 'hoje', href: `${base}/hoje`, nome: 'Hoje', resumo: 'O que fazer no dia: avanço, chamada e diário.', icone: ICONES.hoje! },
    { chave: 'alertas', href: `${base}/alertas`, nome: 'Alertas', resumo: 'Atrasos, chuva prevista, material acabando e medições.', icone: ICONES.alertas! },
    ...MODULOS.map((m) => ({ chave: m.slug, href: `${base}/${m.slug}`, nome: m.nome, resumo: m.resumo, icone: ICONES[m.slug] ?? LayoutDashboard })),
  ];
}

const UUID = /^\/projetos\/([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})(?:\/|$)/i;

/** Id da obra aberta, pelo endereço (null fora de uma obra). */
export function obraDoCaminho(caminho: string): string | null {
  return UUID.exec(caminho)?.[1] ?? null;
}

export function secaoAtiva(secao: Secao, caminho: string, projetoId: string) {
  return secao.href === `/projetos/${projetoId}` ? caminho === secao.href : caminho.startsWith(secao.href);
}
