import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { hojeIso, itensComSaldo } from '@obras/shared';
import { buscarProjeto, listarItensEstoque, listarSaldos, podeMovimentarEstoque } from '@/lib/dados';
import { TopoAlmoxarifado } from '../NavAlmoxarifado';
import { Inventario } from './Inventario';

export const metadata: Metadata = { title: 'Inventário' };

export default async function PaginaInventario({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const dados = await buscarProjeto(id);
  if (!dados) notFound();
  const { projeto, papel } = dados;
  const [itens, saldos, podeMovimentar] = await Promise.all([listarItensEstoque(projeto.empresa_id), listarSaldos(id), podeMovimentarEstoque(projeto, papel)]);
  const materiais = itensComSaldo(
    itens.filter((i) => i.tipo === 'material'),
    saldos,
  )
    .filter((i) => i.ativo || i.quantidade > 0)
    .sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR'));

  return (
    <div className="flex flex-col gap-6">
      <TopoAlmoxarifado
        projetoId={id}
        ativa="estoque"
        titulo="Inventário"
        descricao="Conte o que há no almoxarifado e digite a quantidade. Só os itens com diferença viram ajuste, com o motivo e o valor da perda ou sobra."
      />
      {!podeMovimentar ? (
        <p className="rounded-medio border border-linha bg-papel p-4 text-regua">Só o engenheiro e o almoxarife da obra fazem o inventário.</p>
      ) : materiais.length === 0 ? (
        <p className="rounded-medio border border-linha bg-papel p-4 text-regua">Nenhum material no catálogo ainda.</p>
      ) : (
        <Inventario projetoId={id} materiais={materiais} hoje={hojeIso()} />
      )}
    </div>
  );
}
