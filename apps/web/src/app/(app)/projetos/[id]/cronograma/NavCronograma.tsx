import Link from 'next/link';

/** Alterna entre a EAP (estrutura) e o Gantt do mesmo cronograma. */
export function NavCronograma({ projetoId, ativa }: { projetoId: string; ativa: 'eap' | 'gantt' }) {
  const base = `/projetos/${projetoId}/cronograma`;
  const abas = [
    { chave: 'eap', href: base, nome: 'Estrutura (EAP)' },
    { chave: 'gantt', href: `${base}/gantt`, nome: 'Gantt' },
  ] as const;
  return (
    <nav aria-label="Visões do cronograma" className="inline-flex rounded-medio border border-linha bg-concreto p-0.5">
      {abas.map((a) => (
        <Link
          key={a.chave}
          href={a.href}
          aria-current={ativa === a.chave ? 'page' : undefined}
          className={`flex min-h-10 items-center rounded-[8px] px-4 text-sm font-semibold transition-colors ${
            ativa === a.chave ? 'bg-papel text-grafite shadow-[0_0_0_1px_var(--color-linha)]' : 'text-regua hover:text-grafite'
          }`}
        >
          {a.nome}
        </Link>
      ))}
    </nav>
  );
}
