'use client';

import { useActionState } from 'react';
import { AvisoErro, Botao, Campo, classeEntrada } from '@/components/ui';
import { definirSenha, type EstadoSenha } from './acoes';

export function FormularioSenha({ email, convite }: { email: string; convite: boolean }) {
  const [estado, acao, salvando] = useActionState<EstadoSenha, FormData>(definirSenha, {});
  return (
    <form action={acao} className="flex flex-col gap-4">
      {estado.erro && <AvisoErro>{estado.erro}</AvisoErro>}
      {/* Ajuda o gerenciador de senhas a guardar para o e-mail certo. */}
      <input type="email" name="email" value={email} autoComplete="username" readOnly hidden />
      <Campo rotulo={convite ? 'Senha' : 'Nova senha'} nome="senha" dica="Pelo menos 8 caracteres.">
        <input id="senha" name="senha" type="password" autoComplete="new-password" required minLength={8} maxLength={72} className={classeEntrada} />
      </Campo>
      <Campo rotulo="Repita a senha" nome="repetir">
        <input id="repetir" name="repetir" type="password" autoComplete="new-password" required minLength={8} maxLength={72} className={classeEntrada} />
      </Campo>
      <Botao type="submit" disabled={salvando} className="mt-1">
        {salvando ? 'Salvando…' : convite ? 'Criar senha e entrar' : 'Salvar nova senha'}
      </Botao>
    </form>
  );
}
