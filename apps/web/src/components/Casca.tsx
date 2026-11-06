import type { ReactNode } from 'react';
import { BarraLateral, type ObraNoMenu } from '@/components/navegacao/BarraLateral';
import { BarraTopoCelular, NavInferior } from '@/components/navegacao/BarrasCelular';

/**
 * Casca do app logado. Computador: menu lateral azul-noite + conteúdo sobre fundo cinza.
 * Celular: barra de cima azul-noite e, dentro de uma obra, barra de baixo com o que o campo mais usa.
 */
export function Casca({
  empresa,
  email,
  obras,
  obraAtual,
  children,
}: {
  empresa: string | null;
  email: string;
  obras: ObraNoMenu[];
  obraAtual?: string;
  children: ReactNode;
}) {
  return (
    <div className="flex min-h-dvh bg-fundo lg:bg-[linear-gradient(to_right,var(--color-noite)_264px,var(--color-fundo)_264px)] print:bg-papel">
      <BarraLateral empresa={empresa} email={email} obras={obras} obraAtual={obraAtual} />
      <div className="flex min-w-0 flex-1 flex-col">
        <BarraTopoCelular empresa={empresa} email={email} />
        <main className="mx-auto w-full max-w-7xl flex-1 px-4 pt-5 pb-28 sm:px-6 sm:pt-8 lg:px-10 lg:pb-12 print:max-w-none print:p-0">{children}</main>
        <NavInferior obraAtual={obraAtual} />
      </div>
    </div>
  );
}
