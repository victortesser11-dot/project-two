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
export function MenuUsuario({ email, escuro = false, completo = false }: { email: string; escuro?: boolean; completo?: boolean }) {
  const sair = useRef<HTMLFormElement>(null);
  return (
    <>
      <form ref={sair} action="/auth/sair" method="post" hidden />
      <Menu>
        <MenuGatilho
          className={`flex min-h-11 items-center gap-2.5 rounded-medio py-1 pr-2 pl-1 text-sm ${
            escuro ? 'text-white/85 hover:bg-white/10 data-[state=open]:bg-white/10' : 'hover:bg-concreto data-[state=open]:bg-concreto'
          } ${completo ? 'w-full' : ''}`}
          aria-label={`Conta: ${email}`}
        >
          <span
            aria-hidden
            className={`flex size-8 shrink-0 items-center justify-center rounded-full text-xs font-semibold ${
              escuro ? 'bg-seguranca text-noite' : 'bg-cianotipia-claro text-cianotipia'
            }`}
          >
            {iniciais(email)}
          </span>
          <span className={`min-w-0 flex-1 truncate text-left ${completo ? 'inline' : 'hidden sm:inline'} ${escuro ? '' : 'text-regua'}`}>{email}</span>
          <ChevronDown aria-hidden className={`size-4 shrink-0 ${escuro ? 'text-white/60' : 'text-regua'}`} />
        </MenuGatilho>
        <MenuConteudo align={completo ? 'start' : 'end'} side={completo ? 'top' : 'bottom'}>
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
