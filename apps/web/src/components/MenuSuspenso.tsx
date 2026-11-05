'use client';

import * as Radix from '@radix-ui/react-dropdown-menu';
import type { ComponentProps } from 'react';

// Menu suspenso do app (Radix): abre e fecha com toque, teclado e Esc, e devolve o foco ao botão.
// Mesmo visual em todo lugar: cartão branco com borda fina, opções de 44px.

export const Menu = (props: ComponentProps<typeof Radix.Root>) => <Radix.Root modal={false} {...props} />;
export const MenuGatilho = Radix.Trigger;

export function MenuConteudo({ className = '', ...props }: ComponentProps<typeof Radix.Content>) {
  return (
    <Radix.Portal>
      <Radix.Content
        align="end"
        sideOffset={6}
        collisionPadding={8}
        className={`z-50 min-w-60 rounded-medio border border-linha bg-papel p-1.5 data-[state=open]:animate-surgir ${className}`}
        {...props}
      />
    </Radix.Portal>
  );
}

export function MenuOpcao({ className = '', perigo, ...props }: ComponentProps<typeof Radix.Item> & { perigo?: boolean }) {
  return (
    <Radix.Item
      className={`flex min-h-11 cursor-pointer items-center gap-3 rounded-pequeno px-3 text-[15px] font-medium outline-none select-none data-[disabled]:cursor-not-allowed data-[disabled]:text-regua data-[highlighted]:bg-concreto ${
        perigo ? 'text-marcador' : ''
      } ${className}`}
      {...props}
    />
  );
}

export const MenuSeparador = () => <Radix.Separator className="mx-1 my-1 h-px bg-linha" />;
export const MenuRotulo = Radix.Label;
