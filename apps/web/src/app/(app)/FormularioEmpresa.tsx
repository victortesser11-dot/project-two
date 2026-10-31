'use client';

import { useActionState } from 'react';
import { criarEmpresa, type EstadoFormulario } from './acoes';
import { AvisoErro, Botao, Campo, classeEntrada } from '@/components/ui';

export function FormularioEmpresa() {
  const [estado, acao, salvando] = useActionState<EstadoFormulario, FormData>(criarEmpresa, {});

  return (
    <form action={acao} className="flex flex-col gap-4">
      {estado.erroGeral && <AvisoErro>{estado.erroGeral}</AvisoErro>}
      <Campo rotulo="Nome da empresa" nome="nome" erro={estado.erros?.nome} dica="Construtora, incorporadora ou a área que toca as obras.">
        <input
          id="nome"
          name="nome"
          required
          minLength={2}
          maxLength={120}
          autoFocus
          defaultValue={estado.valores?.nome}
          aria-invalid={Boolean(estado.erros?.nome)}
          className={classeEntrada}
        />
      </Campo>
      <Botao type="submit" disabled={salvando} className="self-start">
        {salvando ? 'Cadastrando…' : 'Cadastrar empresa'}
      </Botao>
    </form>
  );
}
