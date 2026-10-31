import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { hojeIso } from '@obras/shared';
import { buscarProjeto, listarEmprestimos, listarEquipeProjeto, listarItensEstoque, listarProjetos, podeMovimentarEstoque } from '@/lib/dados';
import { classeLinkPrimario, classeLinkSecundario, TopoAlmoxarifado } from '../NavAlmoxarifado';
import { ListaFerramentas } from './ListaFerramentas';

export const metadata: Metadata = { title: 'Ferramentas' };

export default async function PaginaFerramentas({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const dados = await buscarProjeto(id);
  if (!dados) notFound();
  const { projeto, papel } = dados;
  const [itens, emprestimos, equipe, projetos, podeMovimentar] = await Promise.all([
    listarItensEstoque(projeto.empresa_id),
    listarEmprestimos({ abertos: true }),
    listarEquipeProjeto(id),
    listarProjetos(),
    podeMovimentarEstoque(projeto, papel),
  ]);
  const ferramentas = itens.filter((i) => i.tipo === 'ferramenta');
  const base = `/projetos/${id}/almoxarifado`;

  return (
    <div className="flex flex-col gap-6">
      <TopoAlmoxarifado
        projetoId={id}
        ativa="ferramentas"
        titulo="Ferramentas"
        descricao="Cada ferramenta tem uma etiqueta com QR. Leia a etiqueta para emprestar ou receber; a câmera do celular também abre a ferramenta direto."
        acoes={
          ferramentas.length > 0 ? (
            <>
              <Link href={`${base}/ferramentas/etiquetas`} className={classeLinkSecundario}>
                Imprimir etiquetas
              </Link>
              {podeMovimentar && (
                <Link href={`${base}/catalogo?tipo=ferramenta`} className={classeLinkSecundario}>
                  Cadastrar ferramenta
                </Link>
              )}
            </>
          ) : undefined
        }
      />
      {ferramentas.length === 0 ? (
        <section className="rounded-medio border border-linha bg-papel p-5">
          <h3 className="text-base font-semibold">Nenhuma ferramenta cadastrada</h3>
          <p className="mt-1 text-regua">Cadastre as ferramentas da empresa (furadeira, betoneira, serra…) e imprima as etiquetas com QR.</p>
          {podeMovimentar && (
            <Link href={`${base}/catalogo?tipo=ferramenta`} className={`${classeLinkPrimario} mt-4`}>
              Cadastrar ferramenta
            </Link>
          )}
        </section>
      ) : (
        <ListaFerramentas
          projetoId={id}
          ferramentas={ferramentas}
          emprestimos={emprestimos}
          nomeObra={Object.fromEntries(projetos.map((p) => [p.id, p.nome]))}
          equipe={equipe.filter((p) => p.na_obra)}
          hoje={hojeIso()}
          podeMovimentar={podeMovimentar}
        />
      )}
    </div>
  );
}
