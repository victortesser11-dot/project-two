'use client';

import * as AlertDialog from '@radix-ui/react-alert-dialog';
import { createContext, useCallback, useContext, useRef, useState, type ReactNode } from 'react';
import { TriangleAlert } from 'lucide-react';
import { classeBotao } from '@/components/ui';

export type PedidoConfirmacao = {
  titulo: string;
  texto?: ReactNode;
  /** O que o botão faz ("Tirar acesso", "Apagar rascunho"). */
  confirmar: string;
  cancelar?: string;
  /** Ação que apaga ou tira algo: botão em laranja-marcador. */
  perigo?: boolean;
};

const Contexto = createContext<((p: PedidoConfirmacao) => Promise<boolean>) | null>(null);

/**
 * Confirmação no lugar do `window.confirm`: mesma fonte e cores do app, legível no celular
 * (vira gaveta embaixo, botões grandes) e acessível (foco preso, Esc cancela).
 * Uso: `if (await confirmar({ titulo, confirmar: 'Tirar acesso', perigo: true })) ...`
 */
export function useConfirmar() {
  const confirmar = useContext(Contexto);
  if (!confirmar) throw new Error('useConfirmar precisa do ProvedorConfirmacao no layout.');
  return confirmar;
}

export function ProvedorConfirmacao({ children }: { children: ReactNode }) {
  const [pedido, setPedido] = useState<PedidoConfirmacao | null>(null);
  const resolver = useRef<((sim: boolean) => void) | null>(null);

  const confirmar = useCallback((p: PedidoConfirmacao) => {
    resolver.current?.(false);
    setPedido(p);
    return new Promise<boolean>((resolve) => {
      resolver.current = resolve;
    });
  }, []);

  function responder(sim: boolean) {
    resolver.current?.(sim);
    resolver.current = null;
    setPedido(null);
  }

  return (
    <Contexto.Provider value={confirmar}>
      {children}
      <AlertDialog.Root open={pedido !== null} onOpenChange={(aberto) => !aberto && responder(false)}>
        <AlertDialog.Portal>
          <AlertDialog.Overlay className="fixed inset-0 z-50 bg-grafite/40 data-[state=open]:animate-surgir" />
          <AlertDialog.Content
            className={
              'fixed inset-x-0 bottom-0 z-50 flex flex-col gap-4 rounded-t-medio border border-linha bg-papel px-5 pt-6 pb-[max(1.25rem,env(safe-area-inset-bottom))] ' +
              'data-[state=open]:animate-subir sm:inset-x-auto sm:top-1/2 sm:bottom-auto sm:left-1/2 sm:w-full sm:max-w-md sm:-translate-x-1/2 sm:-translate-y-1/2 sm:rounded-medio sm:p-6'
            }
          >
            {pedido && (
              <>
                <div className="flex gap-3">
                  {pedido.perigo && (
                    <span aria-hidden className="mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-full bg-marcador-claro text-marcador">
                      <TriangleAlert className="size-5" />
                    </span>
                  )}
                  <div className="min-w-0">
                    <AlertDialog.Title className="text-lg font-semibold">{pedido.titulo}</AlertDialog.Title>
                    {pedido.texto ? (
                      <AlertDialog.Description className="mt-1.5 text-regua">{pedido.texto}</AlertDialog.Description>
                    ) : (
                      <AlertDialog.Description className="sr-only">Confirme ou cancele.</AlertDialog.Description>
                    )}
                  </div>
                </div>
                <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
                  <AlertDialog.Cancel className={classeBotao('secundario')}>{pedido.cancelar ?? 'Cancelar'}</AlertDialog.Cancel>
                  <AlertDialog.Action className={classeBotao(pedido.perigo ? 'perigo' : 'primario')} onClick={() => responder(true)}>
                    {pedido.confirmar}
                  </AlertDialog.Action>
                </div>
              </>
            )}
          </AlertDialog.Content>
        </AlertDialog.Portal>
      </AlertDialog.Root>
    </Contexto.Provider>
  );
}
