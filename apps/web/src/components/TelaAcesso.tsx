import Link from 'next/link';
import { Logo } from '@/components/Logo';
import type { ReactNode } from 'react';

/** Tela curta fora do app (confirmar link, recuperar senha): logo, título e um formulário. */
export function TelaAcesso({ titulo, texto, children }: { titulo: string; texto?: ReactNode; children: ReactNode }) {
  return (
    <main className="flex min-h-dvh flex-col bg-papel px-4 py-8 sm:px-12 sm:py-10">
      <Link href="/" className="flex min-h-11 items-center gap-2.5 self-start font-semibold">
        <Logo />
        Controle de Obras
      </Link>
      <div className="mx-auto flex w-full max-w-sm flex-1 flex-col justify-center gap-6 py-10">
        <div>
          <h1 className="text-2xl font-semibold sm:text-3xl">{titulo}</h1>
          {texto && <p className="mt-2 text-regua">{texto}</p>}
        </div>
        {children}
      </div>
    </main>
  );
}
