import Link from 'next/link';
import { supabaseConfigurado } from '@/lib/env';
import { ConfiguracaoPendente } from '@/components/ConfiguracaoPendente';
import { empresaAtual, exigirUsuario } from '@/lib/dados';

export default async function LayoutApp({ children }: { children: React.ReactNode }) {
  if (!supabaseConfigurado) return <ConfiguracaoPendente />;
  const { usuario } = await exigirUsuario();
  const empresa = await empresaAtual();

  return (
    <div className="flex min-h-dvh flex-col">
      <header className="border-b border-linha bg-papel print:hidden">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-2.5 sm:px-6">
          <Link href="/" className="flex min-h-11 min-w-0 items-center gap-2.5 font-semibold">
            <svg aria-hidden viewBox="0 0 32 32" className="size-7 shrink-0">
              <rect width="32" height="32" rx="8" fill="#2346a0" />
              <path d="M6 24h20M8 24V12l8-5 8 5v12" fill="none" stroke="#fff" strokeWidth="2.4" strokeLinejoin="round" />
              <path d="M13 24v-6h6v6" fill="none" stroke="#fff" strokeWidth="2.4" />
            </svg>
            <span className="truncate">{empresa?.nome ?? 'Controle de Obras'}</span>
          </Link>
          <div className="flex items-center gap-4 text-sm">
            <span className="hidden text-regua sm:inline">{usuario.email}</span>
            <form action="/auth/sair" method="post">
              <button type="submit" className="min-h-11 px-1 font-medium text-cianotipia hover:underline underline-offset-4">
                Sair
              </button>
            </form>
          </div>
        </div>
      </header>
      <div className="mx-auto w-full max-w-6xl flex-1 px-4 py-6 sm:px-6 sm:py-10 print:max-w-none print:p-0">{children}</div>
    </div>
  );
}
