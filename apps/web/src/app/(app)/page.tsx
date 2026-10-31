import Link from 'next/link';
import type { Metadata } from 'next';
import { formatarMoeda, hojeIso, ROTULO_STATUS, STATUS_PROJETO, type Projeto } from '@obras/shared';
import { empresaAtual, listarProjetos } from '@/lib/dados';
import { classeBotao, SeloStatus } from '@/components/ui';
import { Regua } from '@/components/Regua';
import { FormularioEmpresa } from './FormularioEmpresa';

export const metadata: Metadata = { title: 'Obras' };

export default async function Portfolio() {
  const empresa = await empresaAtual();

  if (!empresa) {
    return (
      <section className="mx-auto max-w-lg">
        <h1 className="text-2xl font-semibold sm:text-3xl">Cadastre sua empresa</h1>
        <p className="mt-3 mb-8 text-regua">
          Cada obra vira um projeto dentro da empresa. Você fica como administrador e pode convidar a equipe depois.
        </p>
        <FormularioEmpresa />
      </section>
    );
  }

  const projetos = await listarProjetos();
  const hoje = hojeIso();

  if (projetos.length === 0) {
    return (
      <section className="mx-auto max-w-lg py-8">
        <h1 className="text-2xl font-semibold sm:text-3xl">Nenhuma obra cadastrada</h1>
        <p className="mt-3 mb-8 text-regua">
          Crie o primeiro projeto com endereço, prazo e orçamento. Cronograma, câmeras, almoxarifado e equipe ficam dentro dele.
        </p>
        <Link href="/projetos/novo" className={classeBotao()}>
          Criar projeto
        </Link>
      </section>
    );
  }

  const orcamentoTotal = projetos.reduce((s, p) => s + (p.orcamento_total ?? 0), 0);
  const porStatus = STATUS_PROJETO.map((s) => ({ s, n: projetos.filter((p) => p.status === s).length })).filter((x) => x.n > 0);

  return (
    <section>
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold sm:text-3xl">Obras</h1>
          <p className="numeros mt-2 text-regua">
            {projetos.length} {projetos.length === 1 ? 'projeto' : 'projetos'}
            {porStatus.map(({ s, n }) => `, ${n} ${ROTULO_STATUS[s].toLowerCase()}`).join('')}.
            {orcamentoTotal > 0 && ` Orçamento somado: ${formatarMoeda(orcamentoTotal, { compacta: true })}.`}
          </p>
        </div>
        <Link href="/projetos/novo" className={classeBotao()}>
          Criar projeto
        </Link>
      </div>

      <ul className="mt-8 divide-y divide-linha overflow-hidden rounded-medio border border-linha bg-papel">
        {projetos.map((p) => (
          <LinhaProjeto key={p.id} projeto={p} hoje={hoje} />
        ))}
      </ul>
    </section>
  );
}

function LinhaProjeto({ projeto: p, hoje }: { projeto: Projeto; hoje: string }) {
  return (
    <li>
      <Link
        href={`/projetos/${p.id}`}
        className="grid gap-x-8 gap-y-4 px-5 py-5 transition-colors hover:bg-concreto/60 sm:grid-cols-[minmax(0,1.1fr)_minmax(0,1.6fr)_auto] sm:items-center"
      >
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2.5">
            <h2 className="truncate text-base font-semibold sm:text-lg">{p.nome}</h2>
            <SeloStatus status={p.status} />
          </div>
          {p.endereco && <p className="mt-1 truncate text-sm text-regua">{p.endereco}</p>}
        </div>
        <Regua inicio={p.data_inicio} fim={p.data_fim_prevista} hoje={hoje} compacta />
        <p className="numeros text-right font-semibold sm:min-w-28">
          {p.orcamento_total ? formatarMoeda(p.orcamento_total, { compacta: true }) : <span className="font-normal text-regua">Sem orçamento</span>}
        </p>
      </Link>
    </li>
  );
}
