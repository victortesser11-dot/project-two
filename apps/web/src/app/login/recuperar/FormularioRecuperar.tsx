'use client';

import Link from 'next/link';
import { useActionState } from 'react';
import { AvisoErro, Botao, Campo, classeEntrada } from '@/components/ui';
import { pedirLinkSenha, type EstadoLogin } from '../actions';

export function FormularioRecuperar() {
  const [estado, acao, enviando] = useActionState<EstadoLogin, FormData>(pedirLinkSenha, {});
  return (
    <>
      {estado.erro && <AvisoErro>{estado.erro}</AvisoErro>}
      {estado.aviso && (
        <div role="status" className="rounded-medio border border-cianotipia/30 bg-cianotipia-claro px-4 py-3 text-sm text-cianotipia">
          {estado.aviso}
        </div>
      )}
      <form action={acao} className="flex flex-col gap-4">
        <Campo rotulo="E-mail da conta" nome="email">
          <input id="email" name="email" type="email" autoComplete="email" required defaultValue={estado.email} className={classeEntrada} />
        </Campo>
        <Botao type="submit" disabled={enviando}>
          {enviando ? 'Enviando…' : estado.aviso ? 'Enviar de novo' : 'Enviar link'}
        </Botao>
      </form>
      <Link href="/login" className="text-sm font-semibold text-cianotipia hover:underline underline-offset-4">
        Voltar para entrar
      </Link>
    </>
  );
}
