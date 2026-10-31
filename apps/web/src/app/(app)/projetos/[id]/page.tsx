import { notFound } from 'next/navigation';
import {
  buscarApontamentos,
  buscarEap,
  buscarLinhaBase,
  buscarProjeto,
  empresaAtual,
  listarMembrosProjeto,
  podeEditarProjeto,
} from '@/lib/dados';
import { PainelObra } from './PainelObra';

export default async function PainelProjeto({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [dados, empresa] = await Promise.all([buscarProjeto(id), empresaAtual()]);
  if (!dados) notFound();
  const { projeto, papel } = dados;

  const [itens, membros, podeEditar, linhaBase, apontamentos] = await Promise.all([
    buscarEap(id),
    listarMembrosProjeto(id),
    podeEditarProjeto(projeto, papel),
    buscarLinhaBase(id),
    buscarApontamentos(id),
  ]);

  return (
    <PainelObra
      projeto={projeto}
      papel={papel}
      papelEmpresa={empresa?.papel ?? null}
      itens={itens}
      membros={membros}
      podeEditar={podeEditar}
      linhaBase={linhaBase}
      apontamentos={apontamentos}
    />
  );
}
