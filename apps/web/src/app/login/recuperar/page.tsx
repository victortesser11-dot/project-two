import type { Metadata } from 'next';
import { TelaAcesso } from '@/components/TelaAcesso';
import { FormularioRecuperar } from './FormularioRecuperar';

export const metadata: Metadata = { title: 'Esqueci a senha' };

export default function PaginaRecuperar() {
  return (
    <TelaAcesso titulo="Esqueci a senha" texto="Informe o e-mail da conta. Mandamos um link para você escolher uma nova senha.">
      <FormularioRecuperar />
    </TelaAcesso>
  );
}
