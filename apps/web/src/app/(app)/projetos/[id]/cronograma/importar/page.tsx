import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { LIMITE_ITENS_IMPORTACAO, LIMITE_NIVEIS_EAP } from '@obras/shared';
import { buscarProjeto, contarItensEap, podeEditarProjeto } from '@/lib/dados';
import { Importador } from './Importador';

export const metadata: Metadata = { title: 'Importar EAP' };

export default async function PaginaImportarEap({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const dados = await buscarProjeto(id);
  if (!dados) notFound();
  const { projeto, papel } = dados;

  const voltar = (
    <Link href={`/projetos/${id}/cronograma`} className="text-sm font-medium text-cianotipia hover:underline underline-offset-4">
      Voltar para a EAP
    </Link>
  );

  if (!(await podeEditarProjeto(projeto, papel))) {
    return (
      <div className="flex max-w-xl flex-col gap-4">
        {voltar}
        <h2 className="text-2xl font-bold">Importar EAP</h2>
        <p className="text-regua">
          Só o engenheiro do projeto ou um administrador da empresa importa a EAP. Peça a um deles para mudar o seu papel no
          painel do projeto.
        </p>
      </div>
    );
  }

  const itensAtuais = await contarItensEap(id);

  return (
    <div className="flex max-w-4xl flex-col gap-6">
      {voltar}
      <div>
        <h2 className="text-2xl font-bold">Importar EAP</h2>
        <p className="mt-1 text-regua">
          Traga etapas e tarefas de uma planilha de orçamento ou do MS Project. Você confere tudo na prévia antes de gravar. Até{' '}
          <span className="numeros">{LIMITE_ITENS_IMPORTACAO.toLocaleString('pt-BR')}</span> itens e {LIMITE_NIVEIS_EAP} níveis.
        </p>
      </div>
      <Importador
        projetoId={id}
        itensAtuais={itensAtuais}
        orcamentoProjeto={projeto.orcamento_total !== null ? Number(projeto.orcamento_total) : null}
      />
    </div>
  );
}
