import Link from 'next/link';

export type AbaAlmoxarifado = 'estoque' | 'entrada' | 'saida' | 'ferramentas' | 'movimentos' | 'catalogo';

/** Seções do almoxarifado; rola na horizontal no celular. */
export function NavAlmoxarifado({ projetoId, ativa }: { projetoId: string; ativa: AbaAlmoxarifado }) {
  const base = `/projetos/${projetoId}/almoxarifado`;
  const abas: { chave: AbaAlmoxarifado; href: string; nome: string }[] = [
    { chave: 'estoque', href: base, nome: 'Estoque' },
    { chave: 'entrada', href: `${base}/entrada`, nome: 'Entrada' },
    { chave: 'saida', href: `${base}/saida`, nome: 'Saída' },
    { chave: 'ferramentas', href: `${base}/ferramentas`, nome: 'Ferramentas' },
    { chave: 'movimentos', href: `${base}/movimentos`, nome: 'Movimentos' },
    { chave: 'catalogo', href: `${base}/catalogo`, nome: 'Catálogo' },
  ];
  return (
    <nav aria-label="Seções do almoxarifado" className="-mx-4 overflow-x-auto px-4 sm:mx-0 sm:px-0 print:hidden">
      <div className="inline-flex min-w-max rounded-medio border border-linha bg-concreto p-0.5">
        {abas.map((a) => (
          <Link
            key={a.chave}
            href={a.href}
            aria-current={ativa === a.chave ? 'page' : undefined}
            className={`flex min-h-10 items-center rounded-[8px] px-3.5 text-sm font-semibold whitespace-nowrap transition-colors ${
              ativa === a.chave ? 'bg-papel text-grafite shadow-[0_0_0_1px_var(--color-linha)]' : 'text-regua hover:text-grafite'
            }`}
          >
            {a.nome}
          </Link>
        ))}
      </div>
    </nav>
  );
}

/** Cabeçalho comum: título, explicação e as abas. */
export function TopoAlmoxarifado({
  projetoId,
  ativa,
  titulo,
  descricao,
  acoes,
}: {
  projetoId: string;
  ativa: AbaAlmoxarifado;
  titulo: string;
  descricao: string;
  acoes?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-5">
      <NavAlmoxarifado projetoId={projetoId} ativa={ativa} />
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h2 className="text-xl font-semibold sm:text-2xl">{titulo}</h2>
          <p className="mt-1 max-w-2xl text-regua">{descricao}</p>
        </div>
        {acoes && <div className="flex flex-wrap gap-2">{acoes}</div>}
      </div>
    </div>
  );
}

export const classeLinkPrimario =
  'inline-flex min-h-11 items-center justify-center rounded-medio bg-cianotipia px-4 font-semibold text-white hover:bg-cianotipia-escuro';
export const classeLinkSecundario =
  'inline-flex min-h-11 items-center justify-center rounded-medio border border-campo/60 bg-papel px-4 font-semibold hover:border-grafite';
