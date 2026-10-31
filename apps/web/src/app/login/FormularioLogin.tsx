'use client';

import { useActionState, useState } from 'react';
import { criarConta, entrar, entrarComGoogle, type EstadoLogin } from './actions';
import { AvisoErro, Botao, Campo, classeEntrada } from '@/components/ui';

export function FormularioLogin({ voltar, erroInicial }: { voltar?: string; erroInicial?: string }) {
  const [modo, setModo] = useState<'entrar' | 'criar'>('entrar');
  const [estadoEntrar, acaoEntrar, entrando] = useActionState<EstadoLogin, FormData>(entrar, { erro: erroInicial });
  const [estadoCriar, acaoCriar, criando] = useActionState<EstadoLogin, FormData>(criarConta, {});

  const estado = modo === 'entrar' ? estadoEntrar : estadoCriar;
  const ocupado = entrando || criando;

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold sm:text-3xl">{modo === 'entrar' ? 'Entrar' : 'Criar conta'}</h1>
        <p className="mt-2 text-regua">
          {modo === 'entrar' ? 'Acesse as obras da sua empresa.' : 'Comece cadastrando sua empresa e a primeira obra.'}
        </p>
      </div>

      {estado.erro && <AvisoErro>{estado.erro}</AvisoErro>}
      {estado.aviso && (
        <div role="status" className="rounded-medio border border-cianotipia/30 bg-cianotipia-claro px-4 py-3 text-sm text-cianotipia">
          {estado.aviso}
        </div>
      )}

      <form action={modo === 'entrar' ? acaoEntrar : acaoCriar} className="flex flex-col gap-4" key={modo}>
        <input type="hidden" name="voltar" value={voltar ?? ''} />
        <Campo rotulo="E-mail" nome="email">
          <input
            id="email"
            name="email"
            type="email"
            autoComplete="email"
            required
            defaultValue={estado.email}
            className={classeEntrada}
          />
        </Campo>
        <Campo rotulo="Senha" nome="senha" dica={modo === 'criar' ? 'Pelo menos 8 caracteres.' : undefined}>
          <input
            id="senha"
            name="senha"
            type="password"
            autoComplete={modo === 'entrar' ? 'current-password' : 'new-password'}
            required
            minLength={8}
            className={classeEntrada}
          />
        </Campo>
        <Botao type="submit" disabled={ocupado} className="mt-1">
          {modo === 'entrar' ? (entrando ? 'Entrando…' : 'Entrar') : criando ? 'Criando conta…' : 'Criar conta'}
        </Botao>
      </form>

      <div className="flex items-center gap-3 text-sm text-regua">
        <span className="h-px flex-1 bg-linha" />
        ou
        <span className="h-px flex-1 bg-linha" />
      </div>

      <form action={entrarComGoogle}>
        <input type="hidden" name="voltar" value={voltar ?? ''} />
        <Botao type="submit" variante="secundario" className="w-full" disabled={ocupado}>
          <svg aria-hidden viewBox="0 0 24 24" className="size-4">
            <path fill="#4285F4" d="M23.5 12.3c0-.8-.1-1.6-.2-2.3H12v4.4h6.5a5.6 5.6 0 0 1-2.4 3.6v3h3.9c2.2-2.1 3.5-5.1 3.5-8.7Z" />
            <path fill="#34A853" d="M12 24c3.2 0 6-1.1 8-2.9l-3.9-3c-1.1.7-2.5 1.2-4.1 1.2-3.1 0-5.8-2.1-6.7-5H1.3v3.1A12 12 0 0 0 12 24Z" />
            <path fill="#FBBC05" d="M5.3 14.3a7.2 7.2 0 0 1 0-4.6V6.6H1.3a12 12 0 0 0 0 10.8l4-3.1Z" />
            <path fill="#EA4335" d="M12 4.8c1.8 0 3.3.6 4.6 1.8l3.4-3.4A12 12 0 0 0 1.3 6.6l4 3.1c.9-2.9 3.6-4.9 6.7-4.9Z" />
          </svg>
          Continuar com Google
        </Botao>
      </form>

      <p className="text-sm text-regua">
        {modo === 'entrar' ? 'Ainda não tem conta? ' : 'Já tem conta? '}
        <button type="button" className={`font-semibold text-cianotipia hover:underline underline-offset-4`} onClick={() => setModo(modo === 'entrar' ? 'criar' : 'entrar')}>
          {modo === 'entrar' ? 'Criar conta' : 'Entrar'}
        </button>
      </p>
    </div>
  );
}
