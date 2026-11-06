import Link from 'next/link';
import { ChevronLeft, MapPin } from 'lucide-react';
import { hojeIso, type Projeto } from '@obras/shared';
import { SeloStatus } from '@/components/ui';
import { Regua } from '@/components/Regua';

/** Cabeçalho da obra: nome, situação, endereço e a régua de prazo, num cartão com a faixa da prancheta. */
export function CabecalhoObra({ projeto, hoje = hojeIso() }: { projeto: Pick<Projeto, 'nome' | 'status' | 'endereco' | 'data_inicio' | 'data_fim_prevista' | 'exemplo'>; hoje?: string }) {
  return (
      <div className="print:hidden">
        <Link href="/" className="inline-flex min-h-9 items-center gap-1 text-sm font-medium text-regua hover:text-grafite lg:hidden">
          <ChevronLeft aria-hidden className="size-4" />
          Obras
        </Link>
        {projeto.exemplo && (
          <p role="note" className="mt-3 rounded-cartao border border-seguranca/40 bg-[#fff8e1] px-4 py-3 text-sm">
            <span className="font-semibold">Obra de exemplo.</span> Dados fictícios para conhecer o app. Pode mexer à vontade; o admin
            apaga tudo na tela inicial, em "Obra de exemplo".
          </p>
        )}
        <header className="cartao mt-3 overflow-hidden lg:mt-0">
          <div aria-hidden className="h-1 bg-gradient-to-r from-cianotipia via-cianotipia to-seguranca" />
          <div className="grid gap-6 px-5 py-5 sm:px-6 sm:py-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)] lg:items-center">
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-3">
                <h1 className="text-2xl font-bold tracking-tight break-words sm:text-[2rem]">{projeto.nome}</h1>
                <SeloStatus status={projeto.status} />
              </div>
              {projeto.endereco && (
                <p className="mt-2 flex items-start gap-1.5 text-regua">
                  <MapPin aria-hidden className="mt-0.5 size-4 shrink-0" />
                  {projeto.endereco}
                </p>
              )}
            </div>
            <Regua inicio={projeto.data_inicio} fim={projeto.data_fim_prevista} hoje={hoje} />
          </div>
        </header>
      </div>
  );
}
