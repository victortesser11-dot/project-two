'use client';

import { Toaster } from 'sonner';
import { CircleAlert, CircleCheck, Info } from 'lucide-react';

/** Lugar dos avisos rápidos ("Acesso removido."): embaixo no celular, no canto no computador. */
export function Avisos() {
  return (
    <Toaster
      position="bottom-center"
      containerAriaLabel="Avisos"
      visibleToasts={3}
      icons={{
        success: <CircleCheck aria-hidden className="size-5 text-obra-ok" />,
        error: <CircleAlert aria-hidden className="size-5 text-marcador" />,
        info: <Info aria-hidden className="size-5 text-cianotipia" />,
      }}
      toastOptions={{
        unstyled: true,
        classNames: {
          toast:
            'flex w-full items-start gap-3 cartao px-4 py-3 text-[15px] text-grafite sm:w-[360px]',
          success: 'border-obra-ok/40',
          error: 'border-marcador/50 bg-marcador-claro',
          title: 'font-semibold',
          description: 'mt-0.5 text-sm text-regua',
          icon: 'mt-0.5 shrink-0',
        },
      }}
    />
  );
}
