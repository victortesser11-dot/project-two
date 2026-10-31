import type { Metadata } from 'next';
import { supabaseConfigurado } from '@/lib/env';
import { FormularioLogin } from './FormularioLogin';
import { ConfiguracaoPendente } from '@/components/ConfiguracaoPendente';

export const metadata: Metadata = { title: 'Entrar' };

const ERROS: Record<string, string> = {
  google: 'Não foi possível entrar com o Google. Tente de novo ou use e-mail e senha.',
  link: 'O link de acesso expirou ou já foi usado. Entre com e-mail e senha.',
};

export default async function PaginaLogin({
  searchParams,
}: {
  searchParams: Promise<{ voltar?: string; erro?: string }>;
}) {
  if (!supabaseConfigurado) return <ConfiguracaoPendente />;
  const { voltar, erro } = await searchParams;

  return (
    <main className="grid min-h-dvh lg:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
      <section className="flex flex-col justify-between gap-10 bg-papel px-4 py-8 sm:px-12 sm:py-10 lg:px-16">
        <span className="flex items-center gap-2.5 font-semibold">
          <svg aria-hidden viewBox="0 0 32 32" className="size-7">
            <rect width="32" height="32" rx="8" fill="#2346a0" />
            <path d="M6 24h20M8 24V12l8-5 8 5v12" fill="none" stroke="#fff" strokeWidth="2.4" strokeLinejoin="round" />
            <path d="M13 24v-6h6v6" fill="none" stroke="#fff" strokeWidth="2.4" />
          </svg>
          Controle de Obras
        </span>
        <div className="w-full max-w-sm">
          <FormularioLogin voltar={voltar} erroInicial={erro ? ERROS[erro] : undefined} />
        </div>
        <p className="text-xs text-regua">Seus dados ficam isolados por empresa.</p>
      </section>

      <section aria-hidden className="relative hidden overflow-hidden border-l border-linha bg-concreto lg:flex lg:flex-col lg:justify-end lg:p-16">
        {/* Planta baixa em traço de cianotipia */}
        <svg viewBox="0 0 480 320" className="absolute top-16 right-12 w-[min(560px,80%)] text-cianotipia" fill="none" stroke="currentColor" strokeWidth="2">
          <rect x="20" y="20" width="440" height="280" />
          <path d="M20 140h170M190 20v120M190 190v110M260 140h200M330 140v160M260 140v50" />
          <path d="M190 140v14M190 176v14" strokeWidth="4" />
          <path d="M190 154a22 22 0 0 1 22 22" strokeDasharray="3 4" />
          <path d="M80 300v12M150 300v12M20 312h440" strokeWidth="1" />
          <g fill="currentColor" stroke="none" fontSize="13">
            <text x="78" y="84">Sala 24,6 m²</text>
            <text x="300" y="84">Cozinha 12,1 m²</text>
            <text x="60" y="228">Dorm. 1</text>
            <text x="370" y="228">Dorm. 2</text>
          </g>
        </svg>
        <p className="relative max-w-md text-3xl leading-tight font-semibold">O que a obra mostra, consome e custa, num painel só.</p>
        <p className="relative mt-4 max-w-md text-regua">
          Fotos diárias das câmeras, cronograma, almoxarifado, equipe e orçamento amarrados a cada tarefa.
        </p>
      </section>
    </main>
  );
}
