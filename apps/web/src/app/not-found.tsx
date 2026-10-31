import Link from 'next/link';
import { classeBotao } from '@/components/ui';

export default function NaoEncontrado() {
  return (
    <main className="mx-auto flex min-h-[60dvh] max-w-lg flex-col justify-center gap-4 px-6">
      <h1 className="text-2xl font-semibold sm:text-3xl">Página não encontrada</h1>
      <p className="text-regua">
        O endereço não existe ou você não tem acesso a este projeto. Peça ao engenheiro responsável para incluir você.
      </p>
      <Link href="/" className={classeBotao('primario', 'self-start')}>
        Ver minhas obras
      </Link>
    </main>
  );
}
