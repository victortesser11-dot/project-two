import Link from 'next/link';
import type { Metadata } from 'next';
import { formatarMoeda, hojeIso, ROTULO_STATUS, STATUS_PROJETO, type CorSemaforo, type Projeto } from '@obras/shared';
import { empresaAtual, listarProjetos, regraSemaforo } from '@/lib/dados';
import { resumoDaObra, type ResumoPortfolio } from '@/lib/portfolio';
import { classeBotao, SeloStatus } from '@/components/ui';
import { Regua } from '@/components/Regua';
import { SeloSemaforo } from '@/components/Semaforo';
import { FormularioEmpresa } from './FormularioEmpresa';
import { RegrasSemaforo } from './RegrasSemaforo';
import { ObraExemplo } from './ObraExemplo';

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
        {empresa.papel === 'admin' && (
          <div className="mt-10 border-t border-linha pt-6">
            <h2 className="mb-2 font-semibold">Quer ver o app funcionando antes?</h2>
            <ObraExemplo existe={false} />
          </div>
        )}
      </section>
    );
  }

  const orcamentoTotal = projetos.reduce((s, p) => s + (p.orcamento_total ?? 0), 0);
  const porStatus = STATUS_PROJETO.map((s) => ({ s, n: projetos.filter((p) => p.status === s).length })).filter((x) => x.n > 0);
  const regra = await regraSemaforo(empresa.id);
  // Semáforo de cada obra; uma obra com erro nos dados não derruba o portfólio.
  const resumos = new Map(
    await Promise.all(
      projetos.map(async (p) => [p.id, p.status === 'concluido' ? null : await resumoDaObra(p, regra, hoje).catch(() => null)] as const),
    ),
  );
  const ordem: CorSemaforo[] = ['vermelho', 'amarelo', 'verde', 'sem_dados'];
  const contagem = ordem.map((c) => ({ c, n: [...resumos.values()].filter((r) => r?.semaforo.cor === c).length }));
  const ordenados = [...projetos].sort(
    (a, b) =>
      ordem.indexOf(resumos.get(a.id)?.semaforo.cor ?? 'sem_dados') - ordem.indexOf(resumos.get(b.id)?.semaforo.cor ?? 'sem_dados') ||
      a.nome.localeCompare(b.nome, 'pt-BR'),
  );

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

      {contagem.some((x) => x.c !== 'sem_dados' && x.n > 0) && (
        <ul className="mt-6 flex flex-wrap gap-3" aria-label="Obras por situação">
          {contagem
            .filter((x) => x.n > 0)
            .map(({ c, n }) => (
              <li key={c} className="numeros flex items-center gap-2 text-sm">
                <SeloSemaforo cor={c} /> {n} {n === 1 ? 'obra' : 'obras'}
              </li>
            ))}
        </ul>
      )}

      <ul className="mt-6 divide-y divide-linha overflow-hidden rounded-medio border border-linha bg-papel">
        {ordenados.map((p) => (
          <LinhaProjeto key={p.id} projeto={p} hoje={hoje} resumo={resumos.get(p.id) ?? null} />
        ))}
      </ul>

      {empresa.papel === 'admin' && (
        <details className="mt-6 rounded-medio border border-linha bg-papel">
          <summary className="flex min-h-11 cursor-pointer items-center px-5 font-semibold">Regras do semáforo</summary>
          <div className="border-t border-linha px-5 py-4">
            <p className="mb-4 text-sm text-regua">
              A cor de cada obra é a pior entre o prazo (dias de atraso pelo avanço apontado) e o custo (quanto o gasto passou do que o serviço feito vale pelo
              orçamento).
            </p>
            <RegrasSemaforo empresaId={empresa.id} regra={regra} />
          </div>
        </details>
      )}

      {empresa.papel === 'admin' && (
        <details className="mt-3 rounded-medio border border-linha bg-papel" open={!projetos.some((p) => p.exemplo) && projetos.length < 2}>
          <summary className="flex min-h-11 cursor-pointer items-center px-5 font-semibold">Obra de exemplo</summary>
          <div className="border-t border-linha px-5 py-4">
            <ObraExemplo existe={projetos.some((p) => p.exemplo)} />
          </div>
        </details>
      )}
    </section>
  );
}

function SeloExemplo() {
  return <span className="rounded-full bg-concreto px-2.5 py-0.5 text-xs font-semibold text-regua">Exemplo</span>;
}

function LinhaProjeto({ projeto: p, hoje, resumo }: { projeto: Projeto; hoje: string; resumo: ResumoPortfolio | null }) {
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
            {p.exemplo && <SeloExemplo />}
            {resumo && <SeloSemaforo cor={resumo.semaforo.cor} />}
          </div>
          {p.endereco && <p className="mt-1 truncate text-sm text-regua">{p.endereco}</p>}
          {resumo && resumo.semaforo.cor !== 'sem_dados' && (
            <p className={`numeros mt-1 text-sm ${resumo.semaforo.cor === 'vermelho' ? 'font-semibold text-marcador' : resumo.semaforo.cor === 'amarelo' ? 'font-semibold text-atencao' : 'text-regua'}`}>
              {resumo.real !== null && `${Math.round(resumo.real)}% feito · `}
              {resumo.semaforo.motivos.join(' · ')}
            </p>
          )}
        </div>
        <Regua inicio={p.data_inicio} fim={p.data_fim_prevista} hoje={hoje} compacta />
        <p className="numeros text-right font-semibold sm:min-w-28">
          {p.orcamento_total ? formatarMoeda(p.orcamento_total, { compacta: true }) : <span className="font-normal text-regua">Sem orçamento</span>}
        </p>
      </Link>
    </li>
  );
}
