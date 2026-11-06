'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { Building2, Plus } from 'lucide-react';
import { Logo } from '@/components/Logo';
import { MenuUsuario } from '@/components/MenuUsuario';
import { obraDoCaminho, secaoAtiva, secoesDaObra } from './secoes';

export type ObraNoMenu = { id: string; nome: string };

const item = (ativo: boolean) =>
  `relative flex min-h-10 items-center gap-3 rounded-medio px-3 text-[15px] font-medium transition-colors ${
    ativo ? 'bg-white/12 text-white before:absolute before:inset-y-2 before:left-0 before:w-[3px] before:rounded-full before:bg-seguranca' : 'text-white/70 hover:bg-white/8 hover:text-white'
  }`;

/** Menu lateral do computador: empresa, obras e as partes da obra aberta. Azul-noite da prancheta. */
export function BarraLateral({
  empresa,
  email,
  obras,
  obraAtual,
}: {
  empresa: string | null;
  email: string;
  obras: ObraNoMenu[];
  /** Obra aberta quando o endereço não diz (prévias). */
  obraAtual?: string;
}) {
  const caminho = usePathname();
  const obraId = obraDoCaminho(caminho) ?? obraAtual ?? null;
  const obra = obras.find((o) => o.id === obraId);

  return (
    <aside className="sticky top-0 hidden h-dvh w-[264px] shrink-0 flex-col bg-noite text-white lg:flex print:hidden">
      <Link href="/" className="flex min-h-16 items-center gap-3 border-b border-white/10 px-5">
        <Logo className="size-8" claro />
        <span className="min-w-0">
          <span className="block truncate font-semibold">{empresa ?? 'Controle de Obras'}</span>
          <span className="block text-xs text-white/55">Controle de Obras</span>
        </span>
      </Link>

      <nav aria-label="Menu principal" className="flex min-h-0 flex-1 flex-col gap-6 overflow-y-auto px-3 py-5">
        <div>
          <Link href="/" aria-current={caminho === '/' ? 'page' : undefined} className={item(caminho === '/')}>
            <Building2 aria-hidden className="size-[18px]" />
            Todas as obras
          </Link>
        </div>

        {obraId && (
          <div>
            <p className="mb-2 truncate px-3 text-xs font-semibold tracking-wide text-white/50 uppercase" title={obra?.nome}>
              {obra?.nome ?? 'Obra'}
            </p>
            <ul className="flex flex-col gap-0.5">
              {secoesDaObra(obraId).map((s) => {
                const ativo = secaoAtiva(s, caminho, obraId);
                const Icone = s.icone;
                return (
                  <li key={s.href}>
                    <Link href={s.href} aria-current={ativo ? 'page' : undefined} className={item(ativo)}>
                      <Icone aria-hidden className="size-[18px]" />
                      {s.nome}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        )}

        {obras.length > 0 && (
          <div>
            <p className="mb-2 px-3 text-xs font-semibold tracking-wide text-white/50 uppercase">Obras</p>
            <ul className="flex flex-col gap-0.5">
              {obras.slice(0, 12).map((o) => (
                <li key={o.id}>
                  <Link href={`/projetos/${o.id}`} className={item(false)} title={o.nome}>
                    <span aria-hidden className={`size-2 shrink-0 rounded-full ${o.id === obraId ? 'bg-seguranca' : 'bg-white/30'}`} />
                    <span className="truncate">{o.nome}</span>
                  </Link>
                </li>
              ))}
            </ul>
            <Link href="/projetos/novo" className={`${item(caminho === '/projetos/novo')} mt-1`}>
              <Plus aria-hidden className="size-[18px]" />
              Criar projeto
            </Link>
          </div>
        )}
      </nav>

      <div className="border-t border-white/10 p-3">
        <MenuUsuario email={email} escuro completo />
      </div>
    </aside>
  );
}
