import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { hojeIso } from '@obras/shared';
import { buscarProjeto, listarItensEstoque, listarVinculosFornecedor, podeMovimentarEstoque } from '@/lib/dados';
import { TopoAlmoxarifado } from '../NavAlmoxarifado';
import { EntradaNfe } from './EntradaNfe';
import { EntradaManual } from './EntradaManual';

export const metadata: Metadata = { title: 'Entrada no almoxarifado' };

export default async function PaginaEntrada({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ modo?: string }> }) {
  const { id } = await params;
  const { modo } = await searchParams;
  const dados = await buscarProjeto(id);
  if (!dados) notFound();
  const { projeto, papel } = dados;
  const [itens, vinculos, podeMovimentar] = await Promise.all([
    listarItensEstoque(projeto.empresa_id),
    listarVinculosFornecedor(projeto.empresa_id),
    podeMovimentarEstoque(projeto, papel),
  ]);
  const materiais = itens.filter((i) => i.tipo === 'material' && i.ativo);
  const manual = modo === 'manual';
  const base = `/projetos/${id}/almoxarifado/entrada`;

  return (
    <div className="flex flex-col gap-6">
      <TopoAlmoxarifado
        projetoId={id}
        ativa="entrada"
        titulo="Dar entrada"
        descricao="Suba o XML da NF-e e confira: os itens já conhecidos vêm ligados ao catálogo e o custo inclui frete, IPI e ST. Sem XML, lance à mão."
      />
      {!podeMovimentar ? (
        <p className="rounded-medio border border-linha bg-papel p-4 text-regua">Só o engenheiro e o almoxarife da obra dão entrada no estoque.</p>
      ) : (
        <>
          <nav aria-label="Como dar entrada" className="inline-flex self-start rounded-medio border border-linha bg-concreto p-0.5">
            {[
              { href: base, nome: 'XML da NF-e', ativo: !manual },
              { href: `${base}?modo=manual`, nome: 'Sem XML (à mão)', ativo: manual },
            ].map((a) => (
              <Link
                key={a.href}
                href={a.href}
                aria-current={a.ativo ? 'page' : undefined}
                className={`flex min-h-10 items-center rounded-[8px] px-4 text-sm font-semibold ${
                  a.ativo ? 'bg-papel text-grafite shadow-[0_0_0_1px_var(--color-linha)]' : 'text-regua hover:text-grafite'
                }`}
              >
                {a.nome}
              </Link>
            ))}
          </nav>
          {manual ? (
            materiais.length === 0 ? (
              <p className="text-regua">
                Cadastre os materiais no{' '}
                <Link href={`/projetos/${id}/almoxarifado/catalogo`} className="font-semibold text-cianotipia underline underline-offset-4">
                  catálogo
                </Link>{' '}
                antes, ou use o XML da NF-e (os itens da nota entram no catálogo sozinhos).
              </p>
            ) : (
              <EntradaManual projetoId={id} materiais={materiais} hoje={hojeIso()} />
            )
          ) : (
            <EntradaNfe projetoId={id} materiais={materiais} vinculos={vinculos} hoje={hojeIso()} />
          )}
        </>
      )}
    </div>
  );
}
