import type { ReactNode } from 'react';
import { ChevronDown, type LucideIcon } from 'lucide-react';

/**
 * Bloco que abre e fecha (detalhe um nível abaixo). Linha de 56 px fácil de tocar, título e uma frase do que tem
 * dentro. Usa <details>: funciona sem JavaScript e o leitor de tela anuncia aberto/fechado.
 */
export function Recolhivel({
  titulo,
  resumo,
  icone: Icone,
  aberto = false,
  children,
}: {
  titulo: string;
  resumo?: string;
  icone?: LucideIcon;
  aberto?: boolean;
  children: ReactNode;
}) {
  return (
    <details open={aberto} className="group cartao">
      <summary className="flex min-h-14 cursor-pointer list-none items-center gap-3 px-4 py-3 sm:px-5 [&::-webkit-details-marker]:hidden">
        {Icone && (
          <span aria-hidden className="flex size-9 shrink-0 items-center justify-center rounded-medio bg-cianotipia-claro text-cianotipia">
            <Icone className="size-5" />
          </span>
        )}
        <span className="min-w-0 flex-1">
          <span className="block font-semibold tracking-tight">{titulo}</span>
          {resumo && <span className="block text-sm text-regua">{resumo}</span>}
        </span>
        <ChevronDown aria-hidden className="size-5 shrink-0 text-regua transition-transform group-open:rotate-180 motion-reduce:transition-none" />
      </summary>
      <div className="flex flex-col gap-6 border-t border-linha p-4 sm:p-5">{children}</div>
    </details>
  );
}
