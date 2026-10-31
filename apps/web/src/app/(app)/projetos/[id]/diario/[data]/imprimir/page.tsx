import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { dataIsoValida, formatarData } from '@obras/shared';
import { buscarDiario, buscarProjeto } from '@/lib/dados';
import { DocumentoDiario } from '../../DocumentoDiario';
import { BotaoImprimir } from '../../AcoesDiario';
import { conteudoParaExibir, urlsDasFotos } from '../../conteudo';

export async function generateMetadata({ params }: { params: Promise<{ data: string }> }): Promise<Metadata> {
  const { data } = await params;
  return { title: `Diário ${formatarData(data)}` };
}

export default async function ImprimirDiario({ params }: { params: Promise<{ id: string; data: string }> }) {
  const { id, data } = await params;
  if (!dataIsoValida(data)) notFound();
  const dados = await buscarProjeto(id);
  if (!dados) notFound();
  const { diario, efetivo, fotos, avancos } = await buscarDiario(id, data);
  if (!diario) notFound();
  const assinado = diario.status === 'assinado';

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-4">
      <div className="flex flex-wrap items-center justify-between gap-3 print:hidden">
        <Link href={`/projetos/${id}/diario/${data}`} className="flex min-h-11 items-center text-sm font-semibold text-cianotipia hover:underline underline-offset-4">
          ← Voltar ao diário
        </Link>
        <BotaoImprimir />
      </div>
      <div className="rounded-medio border border-linha bg-papel p-5 sm:p-8 print:border-0 print:p-0">
        <DocumentoDiario
          conteudo={conteudoParaExibir(dados.projeto, data, diario, efetivo, fotos, avancos)}
          assinatura={assinado && diario.assinado_em && diario.hash_conteudo ? { nome: diario.assinado_nome, em: diario.assinado_em, hash: diario.hash_conteudo } : null}
          urls={urlsDasFotos(fotos)}
        />
      </div>
    </div>
  );
}
