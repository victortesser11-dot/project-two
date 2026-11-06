'use client';

import * as Dialog from '@radix-ui/react-dialog';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { X } from 'lucide-react';
import { secaoAtiva, secoesDaObra } from './secoes';

/** Gaveta com todas as partes da obra e o que cada uma faz (botão "Mais" do celular). */
export function SecoesDaObra({ projetoId, aberto, onAberto }: { projetoId: string; aberto: boolean; onAberto: (a: boolean) => void }) {
  const caminho = usePathname();
  return (
    <Dialog.Root open={aberto} onOpenChange={onAberto}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 z-50 bg-noite/50 data-[state=open]:animate-surgir" />
        <Dialog.Content className="fixed inset-x-0 bottom-0 z-50 max-h-[85dvh] overflow-y-auto rounded-t-[20px] bg-papel px-4 pt-3 pb-[max(1rem,env(safe-area-inset-bottom))] data-[state=open]:animate-subir">
          <div aria-hidden className="mx-auto mb-3 h-1 w-10 rounded-full bg-linha" />
          <div className="mb-2 flex items-center justify-between">
            <Dialog.Title className="text-lg font-semibold">Seções da obra</Dialog.Title>
            <Dialog.Close className="flex size-11 items-center justify-center rounded-full text-regua hover:bg-concreto" aria-label="Fechar">
              <X aria-hidden className="size-5" />
            </Dialog.Close>
          </div>
          <Dialog.Description className="sr-only">Escolha a parte da obra que quer abrir.</Dialog.Description>
          <ul className="grid grid-cols-1 gap-1 sm:grid-cols-2">
            {secoesDaObra(projetoId).map((s) => {
              const atual = secaoAtiva(s, caminho, projetoId);
              const Icone = s.icone;
              return (
                <li key={s.href}>
                  <Link
                    href={s.href}
                    onClick={() => onAberto(false)}
                    aria-current={atual ? 'page' : undefined}
                    className={`flex items-start gap-3 rounded-cartao px-3 py-3 ${atual ? 'bg-cianotipia-claro' : 'hover:bg-concreto'}`}
                  >
                    <span
                      aria-hidden
                      className={`flex size-10 shrink-0 items-center justify-center rounded-medio ${atual ? 'bg-cianotipia text-white' : 'bg-concreto text-grafite'}`}
                    >
                      <Icone className="size-5" />
                    </span>
                    <span className="min-w-0">
                      <span className={`block font-semibold ${atual ? 'text-cianotipia' : ''}`}>{s.nome}</span>
                      <span className="block text-sm leading-snug text-regua">{s.resumo}</span>
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
