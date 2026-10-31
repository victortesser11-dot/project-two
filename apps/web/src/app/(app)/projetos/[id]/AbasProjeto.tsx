'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { MODULOS } from './modulos';

export function AbasProjeto({ projetoId }: { projetoId: string }) {
  const caminho = usePathname();
  const base = `/projetos/${projetoId}`;
  const abas = [
    { href: base, nome: 'Painel' },
    { href: `${base}/hoje`, nome: 'Hoje' },
    ...MODULOS.map((m) => ({ href: `${base}/${m.slug}`, nome: m.nome })),
  ];

  return (
    <nav aria-label="Seções do projeto" className="-mx-4 overflow-x-auto px-4 sm:mx-0 sm:px-0">
      <ul className="flex min-w-max gap-1 border-b border-linha">
        {abas.map((aba) => {
          const ativa = aba.href === base ? caminho === base : caminho.startsWith(aba.href);
          return (
            <li key={aba.href}>
              <Link
                href={aba.href}
                aria-current={ativa ? 'page' : undefined}
                className={`-mb-px block border-b-2 px-3 py-2.5 text-sm font-semibold whitespace-nowrap transition-colors ${
                  ativa ? 'border-cianotipia text-cianotipia' : 'border-transparent text-regua hover:text-grafite'
                }`}
              >
                {aba.nome}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
