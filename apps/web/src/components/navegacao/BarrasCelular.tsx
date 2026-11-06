'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useEffect, useState } from 'react';
import { BookOpen, ClipboardCheck, LayoutDashboard, LayoutGrid, TriangleAlert } from 'lucide-react';
import { Logo } from '@/components/Logo';
import { MenuUsuario } from '@/components/MenuUsuario';
import { SecoesDaObra } from './SecoesDaObra';
import { obraDoCaminho, secaoAtiva, secoesDaObra } from './secoes';

/** Barra de cima no celular e tablet: logo, empresa e conta, em azul-noite. */
export function BarraTopoCelular({ empresa, email }: { empresa: string | null; email: string }) {
  return (
    <header className="sticky top-0 z-40 bg-noite text-white lg:hidden print:hidden">
      <div className="flex min-h-14 items-center justify-between gap-3 px-4 sm:px-6">
        <Link href="/" className="flex min-h-11 min-w-0 items-center gap-2.5 font-semibold">
          <Logo className="size-7" claro />
          <span className="truncate">{empresa ?? 'Controle de Obras'}</span>
        </Link>
        <MenuUsuario email={email} escuro />
      </div>
    </header>
  );
}

const NA_BARRA = ['painel', 'hoje', 'alertas', 'diario'];
const ICONE_BARRA = { painel: LayoutDashboard, hoje: ClipboardCheck, alertas: TriangleAlert, diario: BookOpen } as const;
const NOME_BARRA: Record<string, string> = { diario: 'Diário' };

/** Barra de baixo no celular, dentro de uma obra: o que o campo usa todo dia, ao alcance do polegar. */
export function NavInferior({ obraAtual }: { obraAtual?: string }) {
  const caminho = usePathname();
  const obraId = obraDoCaminho(caminho) ?? obraAtual ?? null;
  const [mais, setMais] = useState(false);
  useEffect(() => setMais(false), [caminho]);
  if (!obraId) return null;

  const secoes = secoesDaObra(obraId);
  const fixas = secoes.filter((s) => NA_BARRA.includes(s.chave));
  const outraAtiva = secoes.some((s) => !NA_BARRA.includes(s.chave) && secaoAtiva(s, caminho, obraId));

  const classe = (ativo: boolean) =>
    `relative flex min-h-14 flex-1 flex-col items-center justify-center gap-0.5 text-[11px] font-semibold ${
      ativo ? 'text-cianotipia' : 'text-regua'
    }`;

  return (
    <>
      <nav
        aria-label="Seções da obra"
        className="fixed inset-x-0 bottom-0 z-40 border-t border-linha bg-papel/95 pb-[env(safe-area-inset-bottom)] backdrop-blur lg:hidden print:hidden"
      >
        <ul className="mx-auto flex max-w-xl">
          {fixas.map((s) => {
            const ativo = secaoAtiva(s, caminho, obraId);
            const Icone = ICONE_BARRA[s.chave as keyof typeof ICONE_BARRA];
            return (
              <li key={s.href} className="flex flex-1">
                <Link href={s.href} aria-current={ativo ? 'page' : undefined} className={classe(ativo)}>
                  {ativo && <span aria-hidden className="absolute top-0 h-[3px] w-8 rounded-b-full bg-cianotipia" />}
                  <Icone aria-hidden className="size-[22px]" strokeWidth={ativo ? 2.25 : 1.75} />
                  {NOME_BARRA[s.chave] ?? s.nome}
                </Link>
              </li>
            );
          })}
          <li className="flex flex-1">
            <button type="button" onClick={() => setMais(true)} className={classe(outraAtiva)} aria-haspopup="dialog">
              {outraAtiva && <span aria-hidden className="absolute top-0 h-[3px] w-8 rounded-b-full bg-cianotipia" />}
              <LayoutGrid aria-hidden className="size-[22px]" strokeWidth={outraAtiva ? 2.25 : 1.75} />
              Mais
            </button>
          </li>
        </ul>
      </nav>
      <SecoesDaObra projetoId={obraId} aberto={mais} onAberto={setMais} />
    </>
  );
}
