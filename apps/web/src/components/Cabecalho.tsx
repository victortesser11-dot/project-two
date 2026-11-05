import Link from 'next/link';
import { Logo } from '@/components/Logo';
import { MenuUsuario } from '@/components/MenuUsuario';

/** Cabeçalho do app logado: empresa à esquerda, conta à direita. */
export function Cabecalho({ empresa, email }: { empresa: string | null; email: string }) {
  return (
    <header className="border-b border-linha bg-papel print:hidden">
      <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-2 sm:px-6">
        <Link href="/" className="flex min-h-11 min-w-0 items-center gap-2.5 font-semibold">
          <Logo />
          <span className="truncate">{empresa ?? 'Controle de Obras'}</span>
        </Link>
        <MenuUsuario email={email} />
      </div>
    </header>
  );
}
