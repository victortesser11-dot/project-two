import Link from 'next/link';
import { notFound } from 'next/navigation';
import { diasEntre, formatarData, formatarMoeda, ROTULO_PAPEL_PROJETO } from '@obras/shared';
import { buscarEap, buscarProjeto, empresaAtual, listarMembrosProjeto, podeEditarProjeto, resumirEap } from '@/lib/dados';
import { MembrosProjeto } from './MembrosProjeto';
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

  const [itens, membros, podeEditar] = await Promise.all([
    buscarEap(id),
    listarMembrosProjeto(id),
    podeEditarProjeto(projeto, papel),
  ]);
  const eap = resumirEap(itens);
  const orcamento = projeto.orcamento_total !== null ? Number(projeto.orcamento_total) : null;
  const percentualEap = eap.custoTotal !== null && orcamento ? Math.round((eap.custoTotal / orcamento) * 100) : null;

  const prazoDias =
    projeto.data_inicio && projeto.data_fim_prevista ? diasEntre(projeto.data_inicio, projeto.data_fim_prevista) : null;
  const papelTexto = papel ? ROTULO_PAPEL_PROJETO[papel] : empresa?.papel === 'admin' ? 'Administrador da empresa' : '—';

  const feitos: Record<string, boolean> = { 'Dados básicos': true, 'EAP e cronograma': itens.length > 0 };

  return (
    <div className="grid gap-10 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
      <section>
        <h2 className="text-lg font-semibold sm:text-xl">Configuração do projeto</h2>
        <p className="mt-2 text-regua">Cada etapa abre um módulo. Os que ainda não chegaram mostram quando entram.</p>
        <ol className="mt-6 flex flex-col">
          {PASSOS.map((passo, i) => {
            const modulo = passo.modulo ? MODULOS.find((m) => m.slug === passo.modulo) : null;
            const feito = feitos[passo.titulo] ?? false;
            const href = modulo ? `/projetos/${projeto.id}/${modulo.slug}` : null;
            return (
              <li key={passo.titulo} className="relative flex gap-4 pb-6 last:pb-0">
                {i < PASSOS.length - 1 && <span aria-hidden className="absolute top-8 bottom-0 left-[15px] w-px bg-linha" />}
                <span
                  className={`numeros relative flex size-8 shrink-0 items-center justify-center rounded-full border-2 text-sm font-bold ${
                    feito
                      ? 'border-cianotipia bg-cianotipia text-white'
                      : modulo?.disponivel
                        ? 'border-cianotipia bg-papel text-cianotipia'
                        : 'border-linha bg-papel text-regua'
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
                <div className="min-w-0 pt-1">
                  <h3 className="font-semibold">
                    {href ? (
                      <Link href={href} className="hover:text-cianotipia">
                        {passo.titulo}
                      </Link>
                    ) : (
                      passo.titulo
                    )}
                    {feito && <span className="sr-only"> (concluído)</span>}
                  </h3>
                  {passo.modulo === 'cronograma' && itens.length > 0 ? (
                    <p className="numeros mt-0.5 text-sm text-regua">
                      {eap.etapas} {eap.etapas === 1 ? 'etapa' : 'etapas'}, {eap.tarefas} {eap.tarefas === 1 ? 'tarefa' : 'tarefas'}
                      {eap.custoTotal !== null && `, ${formatarMoeda(eap.custoTotal)}`}
                      {eap.inicio && `, de ${formatarData(eap.inicio)} a ${formatarData(eap.fim)}`}.
                    </p>
                  ) : (
                    <p className="mt-0.5 text-sm text-regua">
                      {passo.descricao}
                      {modulo && !modulo.disponivel && ` Chega no sprint ${modulo.sprint}.`}
                    </p>
                  )}
                  {passo.modulo === 'cronograma' && itens.length === 0 && podeEditar && (
                    <p className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-sm font-semibold">
                      <Link href={`/projetos/${projeto.id}/cronograma/importar`} className="text-cianotipia hover:underline underline-offset-4">
                        Importar planilha ou MS Project
                      </Link>
                      <Link href={`/projetos/${projeto.id}/cronograma`} className="text-cianotipia hover:underline underline-offset-4">
                        Montar na tela
                      </Link>
                    </p>
                  )}
                </div>
              </li>
            );
          })}
        </ol>
      </section>

      <div className="flex flex-col gap-6">
        <aside className="rounded-medio border border-linha bg-papel" aria-labelledby="titulo-resumo">
          <h2 id="titulo-resumo" className="border-b border-linha px-5 py-4 text-base font-semibold">
            Resumo
          </h2>
          <dl className="numeros divide-y divide-linha text-sm">
            <Linha rotulo="Orçamento total" valor={formatarMoeda(projeto.orcamento_total)} />
            {eap.custoTotal !== null && (
              <Linha
                rotulo="Custo previsto na EAP"
                valor={formatarMoeda(eap.custoTotal)}
                nota={percentualEap !== null ? `${percentualEap}% do orçamento` : undefined}
                alerta={percentualEap !== null && percentualEap > 100}
              />
            )}
            <Linha rotulo="Início" valor={formatarData(projeto.data_inicio)} />
            <Linha rotulo="Fim previsto" valor={formatarData(projeto.data_fim_prevista)} />
            <Linha rotulo="Prazo" valor={prazoDias !== null ? `${prazoDias} dias` : '—'} />
            <Linha rotulo="Seu papel" valor={papelTexto} />
            <Linha rotulo="Criado em" valor={formatarData(projeto.criado_em)} />
          </dl>
        </aside>

        <MembrosProjeto projetoId={projeto.id} membros={membros} podeEditar={podeEditar} />
      </div>
    </div>
  );
}

function Linha({ rotulo, valor, nota, alerta }: { rotulo: string; valor: string; nota?: string; alerta?: boolean }) {
  return (
    <div className="flex justify-between gap-4 px-5 py-3">
      <dt className="text-regua">{rotulo}</dt>
      <dd className="text-right font-semibold">
        {valor}
        {nota && <span className={`block text-xs ${alerta ? 'text-marcador' : 'font-normal text-regua'}`}>{nota}</span>}
      </dd>
    </div>
  );
}
