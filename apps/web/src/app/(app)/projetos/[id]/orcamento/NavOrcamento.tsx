import Link from 'next/link';

export type AbaOrcamento = 'orcamento' | 'fisico-financeiro' | 'realizado' | 'lancamentos' | 'curva';

export function TopoOrcamento({
  projetoId,
  ativa,
  financeiro,
  titulo,
  descricao,
  acoes,
}: {
  projetoId: string;
  ativa: AbaOrcamento;
  /** Engenheiro, financeiro ou admin: vê as abas de custo real. */
  financeiro: boolean;
  titulo: string;
  descricao: string;
  acoes?: React.ReactNode;
}) {
  const base = `/projetos/${projetoId}/orcamento`;
  const abas: { chave: AbaOrcamento; href: string; nome: string; so?: boolean }[] = [
    { chave: 'orcamento', href: base, nome: 'Orçamento' },
    { chave: 'fisico-financeiro', href: `${base}/fisico-financeiro`, nome: 'Físico-financeiro' },
    { chave: 'realizado', href: `${base}/realizado`, nome: 'Orçado × realizado', so: true },
    { chave: 'lancamentos', href: `${base}/lancamentos`, nome: 'Despesas e contratos', so: true },
    { chave: 'curva', href: `${base}/curva`, nome: 'Curva S', so: true },
  ];
  return (
    <div className="flex flex-col gap-5">
      <nav aria-label="Seções do orçamento" className="-mx-4 overflow-x-auto px-4 sm:mx-0 sm:px-0 print:hidden">
        <div className="inline-flex min-w-max rounded-medio border border-linha bg-concreto p-0.5">
          {abas
            .filter((a) => financeiro || !a.so)
            .map((a) => (
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
