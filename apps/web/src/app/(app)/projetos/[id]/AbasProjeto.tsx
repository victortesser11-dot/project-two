'use client';

import * as Dialog from '@radix-ui/react-dialog';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import {
  BookOpen,
  Camera,
  ChartGantt,
  ClipboardCheck,
  HardHat,
  LayoutDashboard,
  LayoutGrid,
  Package,
  TriangleAlert,
  Wallet,
  X,
  type LucideIcon,
} from 'lucide-react';
import { MODULOS } from './modulos';

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
};

type Aba = { chave: string; href: string; nome: string; resumo: string };

export function AbasProjeto({ projetoId }: { projetoId: string }) {
  const caminho = usePathname();
  const base = `/projetos/${projetoId}`;
  const abas: Aba[] = [
    { chave: 'painel', href: base, nome: 'Painel', resumo: 'Prazo, avanço e custo da obra num relance.' },
    { chave: 'hoje', href: `${base}/hoje`, nome: 'Hoje', resumo: 'O que fazer no dia: avanço, chamada e diário.' },
    { chave: 'alertas', href: `${base}/alertas`, nome: 'Alertas', resumo: 'Atrasos, chuva prevista, material acabando e medições.' },
    ...MODULOS.map((m) => ({ chave: m.slug, href: `${base}/${m.slug}`, nome: m.nome, resumo: m.resumo })),
  ];
  const ativa = (aba: Aba) => (aba.href === base ? caminho === base : caminho.startsWith(aba.href));

  // No celular as abas rolam de lado: traz a aba aberta para a vista.
  const lista = useRef<HTMLUListElement>(null);
  useEffect(() => {
    lista.current?.querySelector<HTMLElement>('[aria-current="page"]')?.scrollIntoView({ block: 'nearest', inline: 'center' });
  }, [caminho]);

  return (
    <nav aria-label="Seções do projeto" className="flex items-stretch border-b border-linha">
      <SecoesNoCelular abas={abas} ativa={ativa} />
      <div className="-mr-4 min-w-0 flex-1 overflow-x-auto pr-4 [mask-image:linear-gradient(to_right,black_85%,transparent)] sm:mr-0 sm:pr-0 sm:[mask-image:none]">
        <ul ref={lista} className="flex min-w-max gap-1">
          {abas.map((aba) => {
            const Icone = ICONES[aba.chave] ?? LayoutGrid;
            const atual = ativa(aba);
            return (
              <li key={aba.href}>
                <Link
                  href={aba.href}
                  aria-current={atual ? 'page' : undefined}
                  className={`-mb-px flex min-h-11 items-center gap-2 border-b-2 px-3 text-sm font-semibold whitespace-nowrap transition-colors ${
                    atual ? 'border-cianotipia text-cianotipia' : 'border-transparent text-regua hover:text-grafite'
                  }`}
                >
                  <Icone aria-hidden className="size-4" />
                  {aba.nome}
                </Link>
              </li>
            );
          })}
        </ul>
      </div>
    </nav>
  );
}

/** Botão "Seções" do celular: todas as partes da obra numa gaveta, com o que cada uma faz. */
function SecoesNoCelular({ abas, ativa }: { abas: Aba[]; ativa: (a: Aba) => boolean }) {
  const [aberto, setAberto] = useState(false);
  const caminho = usePathname();
  useEffect(() => setAberto(false), [caminho]);

  return (
    <Dialog.Root open={aberto} onOpenChange={setAberto}>
      <Dialog.Trigger className="-mb-px mr-1 flex min-h-11 shrink-0 items-center gap-1.5 border-b-2 border-transparent pr-2 text-sm font-semibold text-grafite sm:hidden">
        <LayoutGrid aria-hidden className="size-4" />
        Seções
      </Dialog.Trigger>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-grafite/40 data-[state=open]:animate-surgir" />
        <Dialog.Content className="fixed inset-x-0 bottom-0 z-50 max-h-[85dvh] overflow-y-auto rounded-t-medio border border-linha bg-papel px-4 pt-4 pb-[max(1rem,env(safe-area-inset-bottom))] data-[state=open]:animate-subir">
          <div className="mb-2 flex items-center justify-between">
            <Dialog.Title className="text-lg font-semibold">Seções da obra</Dialog.Title>
            <Dialog.Close className="flex size-11 items-center justify-center rounded-full text-regua hover:bg-concreto" aria-label="Fechar">
              <X aria-hidden className="size-5" />
            </Dialog.Close>
          </div>
          <Dialog.Description className="sr-only">Escolha a parte da obra que quer abrir.</Dialog.Description>
          <ul className="flex flex-col gap-1">
            {abas.map((aba) => {
              const Icone = ICONES[aba.chave] ?? LayoutGrid;
              const atual = ativa(aba);
              return (
                <li key={aba.href}>
                  <Link
                    href={aba.href}
                    aria-current={atual ? 'page' : undefined}
                    className={`flex items-start gap-3 rounded-medio px-3 py-3 ${atual ? 'bg-cianotipia-claro' : 'hover:bg-concreto'}`}
                  >
                    <span
                      aria-hidden
                      className={`flex size-9 shrink-0 items-center justify-center rounded-pequeno ${atual ? 'bg-cianotipia text-white' : 'bg-concreto text-grafite'}`}
                    >
                      <Icone className="size-5" />
                    </span>
                    <span className="min-w-0">
                      <span className={`block font-semibold ${atual ? 'text-cianotipia' : ''}`}>{aba.nome}</span>
                      <span className="block text-sm leading-snug text-regua">{aba.resumo}</span>
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
