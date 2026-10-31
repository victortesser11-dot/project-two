import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { buscarProjeto, listarItensEstoque, podeMovimentarEstoque } from '@/lib/dados';
import { TopoAlmoxarifado } from '../NavAlmoxarifado';
import { FormularioItem, ListaCatalogo } from './Catalogo';

export const metadata: Metadata = { title: 'Catálogo do almoxarifado' };

export default async function PaginaCatalogo({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ tipo?: string }> }) {
  const { id } = await params;
  const { tipo: tipoBruto } = await searchParams;
  const tipo = tipoBruto === 'ferramenta' ? 'ferramenta' : 'material';
  const dados = await buscarProjeto(id);
  if (!dados) notFound();
  const { projeto, papel } = dados;
  const [itens, podeGerir] = await Promise.all([listarItensEstoque(projeto.empresa_id), podeMovimentarEstoque(projeto, papel)]);
  const doTipo = itens.filter((i) => i.tipo === tipo).sort((a, b) => Number(b.ativo) - Number(a.ativo) || a.nome.localeCompare(b.nome, 'pt-BR'));
  const categorias = [...new Set(itens.map((i) => i.categoria).filter((c): c is string => !!c))].sort();
  const base = `/projetos/${id}/almoxarifado/catalogo`;

  return (
    <div className="flex flex-col gap-6">
      <TopoAlmoxarifado
        projetoId={id}
        ativa="catalogo"
        titulo="Catálogo"
        descricao="Materiais e ferramentas da empresa, os mesmos em todas as obras. O saldo é de cada obra; o cadastro é um só."
      />
      <nav aria-label="Tipo de item" className="inline-flex self-start rounded-medio border border-linha bg-concreto p-0.5">
        {[
          { href: base, nome: 'Materiais', ativo: tipo === 'material' },
          { href: `${base}?tipo=ferramenta`, nome: 'Ferramentas', ativo: tipo === 'ferramenta' },
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
      <div className="grid gap-6 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)] lg:items-start">
        <ListaCatalogo projetoId={id} itens={doTipo} podeGerir={podeGerir} />
        {podeGerir && (
          <section aria-labelledby="titulo-novo-item" className="rounded-medio border border-linha bg-papel p-4 sm:p-5">
            <h3 id="titulo-novo-item" className="mb-4 text-base font-semibold">
              Cadastrar {tipo === 'ferramenta' ? 'ferramenta' : 'material'}
            </h3>
            <FormularioItem key={tipo} projetoId={id} tipoInicial={tipo} categorias={categorias} />
          </section>
        )}
      </div>
    </div>
  );
}
