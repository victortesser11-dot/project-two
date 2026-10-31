import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { hojeIso } from '@obras/shared';
import { buscarEap, buscarProjeto, listarEmprestimos, listarItensEstoque, listarMovimentos, listarSaldos, podeMovimentarEstoque } from '@/lib/dados';
import { EstoqueObra } from './EstoqueObra';

export const metadata: Metadata = { title: 'Almoxarifado' };

export default async function PaginaAlmoxarifado({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const dados = await buscarProjeto(id);
  if (!dados) notFound();
  const { projeto, papel } = dados;

  const [itens, saldos, movimentos, emprestimos, eap, podeMovimentar] = await Promise.all([
    listarItensEstoque(projeto.empresa_id),
    listarSaldos(id),
    listarMovimentos(id),
    listarEmprestimos({ projetoId: id, abertos: true }),
    buscarEap(id),
    podeMovimentarEstoque(projeto, papel),
  ]);

  return (
    <EstoqueObra
      projetoId={id}
      itens={itens}
      saldos={saldos}
      movimentos={movimentos}
      emprestimos={emprestimos}
      eap={eap}
      podeMovimentar={podeMovimentar}
      hoje={hojeIso()}
    />
  );
}
