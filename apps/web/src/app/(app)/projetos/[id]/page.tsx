import Link from 'next/link';
import { notFound } from 'next/navigation';
import { diasEntre, formatarData, formatarMoeda, ROTULO_PAPEL_PROJETO } from '@obras/shared';
import { buscarProjeto, empresaAtual } from '@/lib/dados';
import { MODULOS } from './modulos';

// Passo a passo de configuração (PRD, "Fluxo de criação de um projeto").
const PASSOS = [
  { titulo: 'Dados básicos', descricao: 'Nome, endereço, prazo e orçamento total.', modulo: null },
  { titulo: 'EAP e cronograma', descricao: 'Montar na tela ou importar planilha e MS Project.', modulo: 'cronograma' },
  { titulo: 'Orçamento por etapa', descricao: 'Digitar ou importar a planilha de orçamento.', modulo: 'orcamento' },
  { titulo: 'Câmeras', descricao: 'Cadastrar as câmeras fixas, testar a foto e definir horários.', modulo: 'cameras' },
  { titulo: 'Almoxarifado', descricao: 'Saldo inicial de materiais e ferramentas.', modulo: 'almoxarifado' },
  { titulo: 'Equipe', descricao: 'Pessoas e empreiteiras que trabalham na obra.', modulo: 'equipe' },
] as const;

export default async function PainelProjeto({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [dados, empresa] = await Promise.all([buscarProjeto(id), empresaAtual()]);
  if (!dados) notFound();
  const { projeto, papel } = dados;

  const prazoDias =
    projeto.data_inicio && projeto.data_fim_prevista ? diasEntre(projeto.data_inicio, projeto.data_fim_prevista) : null;
  const papelTexto = papel ? ROTULO_PAPEL_PROJETO[papel] : empresa?.papel === 'admin' ? 'Administrador da empresa' : '—';

  return (
    <div className="grid gap-10 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
      <section>
        <h2 className="text-xl font-bold">Configuração do projeto</h2>
        <p className="mt-2 text-regua">Cada etapa abre um módulo. Os que ainda não chegaram mostram quando entram.</p>
        <ol className="mt-6 flex flex-col">
          {PASSOS.map((passo, i) => {
            const modulo = passo.modulo ? MODULOS.find((m) => m.slug === passo.modulo) : null;
            const feito = i === 0;
            return (
              <li key={passo.titulo} className="relative flex gap-4 pb-6 last:pb-0">
                {i < PASSOS.length - 1 && <span aria-hidden className="absolute top-8 bottom-0 left-[15px] w-px bg-linha" />}
                <span
                  className={`numeros relative flex size-8 shrink-0 items-center justify-center rounded-full border-2 text-sm font-bold ${
                    feito ? 'border-cianotipia bg-cianotipia text-white' : 'border-linha bg-papel text-regua'
                  }`}
                >
                  {feito ? (
                    <svg aria-hidden viewBox="0 0 16 16" className="size-4" fill="none" stroke="currentColor" strokeWidth="2.5">
                      <path d="m3.5 8.5 3 3 6-7" />
                    </svg>
                  ) : (
                    i + 1
                  )}
                </span>
                <div className="pt-1">
                  <h3 className="font-semibold [font-stretch:100%]">
                    {modulo ? (
                      <Link href={`/projetos/${projeto.id}/${modulo.slug}`} className="hover:text-cianotipia">
                        {passo.titulo}
                      </Link>
                    ) : (
                      passo.titulo
                    )}
                  </h3>
                  <p className="mt-0.5 text-sm text-regua">
                    {passo.descricao}
                    {feito && ' Concluído.'}
                    {modulo && ` Chega no sprint ${modulo.sprint}.`}
                  </p>
                </div>
              </li>
            );
          })}
        </ol>
      </section>

      <aside className="h-fit rounded-medio border border-linha bg-papel">
        <h2 className="border-b border-linha px-5 py-4 text-base font-bold">Resumo</h2>
        <dl className="numeros divide-y divide-linha text-sm">
          <Linha rotulo="Orçamento total" valor={formatarMoeda(projeto.orcamento_total)} />
          <Linha rotulo="Início" valor={formatarData(projeto.data_inicio)} />
          <Linha rotulo="Fim previsto" valor={formatarData(projeto.data_fim_prevista)} />
          <Linha rotulo="Prazo" valor={prazoDias !== null ? `${prazoDias} dias` : '—'} />
          <Linha rotulo="Seu papel" valor={papelTexto} />
          <Linha rotulo="Criado em" valor={formatarData(projeto.criado_em)} />
        </dl>
      </aside>
    </div>
  );
}

function Linha({ rotulo, valor }: { rotulo: string; valor: string }) {
  return (
    <div className="flex justify-between gap-4 px-5 py-3">
      <dt className="text-regua">{rotulo}</dt>
      <dd className="text-right font-semibold">{valor}</dd>
    </div>
  );
}
