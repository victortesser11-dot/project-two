import { supabaseConfigurado } from '@/lib/env';
import { ConfiguracaoPendente } from '@/components/ConfiguracaoPendente';
import { Cabecalho } from '@/components/Cabecalho';
import { empresaAtual, exigirUsuario } from '@/lib/dados';

export default async function LayoutApp({ children }: { children: React.ReactNode }) {
  if (!supabaseConfigurado) return <ConfiguracaoPendente />;
  const { usuario } = await exigirUsuario();
  const empresa = await empresaAtual();

  return (
    <div className="flex min-h-dvh flex-col">
      <Cabecalho empresa={empresa?.nome ?? null} email={usuario.email ?? ''} />
      <div className="mx-auto w-full max-w-6xl flex-1 px-4 py-6 sm:px-6 sm:py-10 print:max-w-none print:p-0">{children}</div>
    </div>
  );
}
