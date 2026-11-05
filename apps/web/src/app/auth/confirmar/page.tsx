import type { Metadata } from 'next';
import Link from 'next/link';
import { TelaAcesso } from '@/components/TelaAcesso';
import { Botao } from '@/components/ui';
import { tipoDeLink, tokenValido, type TipoLink } from '@/lib/links-email';
import { confirmarLink } from './acoes';

export const metadata: Metadata = { title: 'Confirmar', robots: { index: false } };

const TEXTOS: Record<TipoLink, { titulo: string; texto: string; botao: string }> = {
  email: { titulo: 'Confirmar e-mail', texto: 'Toque no botão para confirmar o endereço e entrar.', botao: 'Confirmar e entrar' },
  invite: { titulo: 'Aceitar o convite', texto: 'Toque no botão para aceitar e escolher sua senha.', botao: 'Aceitar e criar senha' },
  recovery: { titulo: 'Criar nova senha', texto: 'Toque no botão para continuar e escolher a nova senha.', botao: 'Continuar' },
  email_change: { titulo: 'Confirmar novo e-mail', texto: 'Toque no botão para confirmar a troca do e-mail da conta.', botao: 'Confirmar troca' },
};

export default async function PaginaConfirmar({
  searchParams,
}: {
  searchParams: Promise<{ token_hash?: string; type?: string }>;
}) {
  const { token_hash, type } = await searchParams;
  const tipo = tipoDeLink(type);

  if (!tipo || !tokenValido(token_hash)) {
    return (
      <TelaAcesso titulo="Link incompleto" texto="O endereço do e-mail chegou cortado. Abra o link de novo, direto do e-mail, ou peça outro.">
        <Link href="/login" className="font-semibold text-cianotipia hover:underline underline-offset-4">
          Ir para a tela de entrar
        </Link>
      </TelaAcesso>
    );
  }

  const t = TEXTOS[tipo];
  return (
    <TelaAcesso titulo={t.titulo} texto={t.texto}>
      <form action={confirmarLink} className="flex flex-col gap-3">
        <input type="hidden" name="token_hash" value={token_hash} />
        <input type="hidden" name="type" value={tipo} />
        <Botao type="submit">{t.botao}</Botao>
      </form>
      <p className="text-sm text-regua">
        O link do e-mail só vale depois deste toque: assim, programas que abrem links sozinhos não gastam o seu acesso.
      </p>
    </TelaAcesso>
  );
}
