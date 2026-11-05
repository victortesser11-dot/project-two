'use client';

import Link from 'next/link';
import { useRef } from 'react';
import { ChevronDown, KeyRound, LogOut } from 'lucide-react';
import { Menu, MenuConteudo, MenuGatilho, MenuOpcao, MenuRotulo, MenuSeparador } from '@/components/MenuSuspenso';

function iniciais(email: string) {
  const nome = email.split('@')[0] ?? '';
  const partes = nome.split(/[._-]+/).filter(Boolean);
  const letras = partes.length > 1 ? `${partes[0]![0]}${partes[1]![0]}` : nome.slice(0, 2);
  return letras.toUpperCase() || '?';
}

/** Conta no cabeçalho: e-mail, trocar senha e sair, num menu só (cabe no celular). */
export function MenuUsuario({ email }: { email: string }) {
  const sair = useRef<HTMLFormElement>(null);
  return (
    <>
      <form ref={sair} action="/auth/sair" method="post" hidden />
      <Menu>
        <MenuGatilho
          className="flex min-h-11 items-center gap-2 rounded-full py-1 pr-2 pl-1 text-sm hover:bg-concreto data-[state=open]:bg-concreto"
          aria-label={`Conta: ${email}`}
        >
          <span aria-hidden className="flex size-8 items-center justify-center rounded-full bg-cianotipia-claro text-xs font-semibold text-cianotipia">
            {iniciais(email)}
          </span>
          <span className="hidden max-w-56 truncate text-regua sm:inline">{email}</span>
          <ChevronDown aria-hidden className="size-4 text-regua" />
        </MenuGatilho>
        <MenuConteudo>
          <MenuRotulo className="px-3 pt-2 pb-2.5 text-sm">
            <span className="block text-xs text-regua">Entrou como</span>
            <span className="block truncate font-semibold">{email}</span>
          </MenuRotulo>
          <MenuSeparador />
          <MenuOpcao asChild>
            <Link href="/conta/senha">
              <KeyRound aria-hidden className="size-4 text-regua" />
              Trocar senha
            </Link>
          </MenuOpcao>
          <MenuOpcao perigo onSelect={() => sair.current?.requestSubmit()}>
            <LogOut aria-hidden className="size-4" />
            Sair
          </MenuOpcao>
        </MenuConteudo>
      </Menu>
    </>
  );
}
