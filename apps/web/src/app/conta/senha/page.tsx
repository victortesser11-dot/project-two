import type { Metadata } from 'next';
import Link from 'next/link';
import { TelaAcesso } from '@/components/TelaAcesso';
import { exigirUsuario } from '@/lib/dados';
import { FormularioSenha } from './FormularioSenha';

export const metadata: Metadata = { title: 'Senha', robots: { index: false } };

export default async function PaginaSenha({ searchParams }: { searchParams: Promise<{ convite?: string }> }) {
  const { usuario } = await exigirUsuario();
  const convite = (await searchParams).convite === '1';
  const email = usuario.email ?? '';

  return (
    <TelaAcesso
      titulo={convite ? 'Crie sua senha' : 'Nova senha'}
      texto={
        <>
          {convite ? 'Bem-vindo! Escolha a senha para entrar como ' : 'Escolha a nova senha de '}
          <strong className="font-semibold text-grafite">{email}</strong>.
        </>
      }
    >
      <FormularioSenha email={email} convite={convite} />
      {!convite && (
        <Link href="/" className="text-sm font-semibold text-cianotipia hover:underline underline-offset-4">
          Voltar sem trocar
        </Link>
      )}
    </TelaAcesso>
  );
}
