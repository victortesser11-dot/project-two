import Link from 'next/link';
import type { ReactNode } from 'react';
import {
  dataDoInstante,
  diasEntre,
  horaDoInstante,
  formatarData,
  formatarMoeda,
  hojeIso,
  ROTULO_PAPEL_PROJETO,
  type ApontamentoRegistrado,
  type ItemEap,
  type LinhaBase,
  type MembroProjeto,
  type PapelEmpresa,
  type PapelProjeto,
  type Projecao,
  type Projeto,
} from '@obras/shared';
import { MembrosProjeto } from './MembrosProjeto';
import { MODULOS } from './modulos';
import { CurvaS } from './CurvaS';
import { montarPainel } from './painel';
import { Banknote, CalendarClock, Check, ChevronRight, ClipboardList, Pencil, Settings, TrendingUp, TriangleAlert, type LucideIcon } from 'lucide-react';
import { Recolhivel } from '@/components/Recolhivel';

// Passo a passo de configuração (PRD, "Fluxo de criação de um projeto").
const PASSOS = [
  { titulo: 'Dados básicos', modulo: null },
  { titulo: 'EAP e cronograma', modulo: 'cronograma' },
  { titulo: 'Linha de base', modulo: 'cronograma' },
  { titulo: 'Orçamento por etapa', modulo: 'orcamento' },
  { titulo: 'Câmeras', modulo: 'cameras' },
  { titulo: 'Almoxarifado', modulo: 'almoxarifado' },
  { titulo: 'Equipe', modulo: 'equipe' },
] as const;

/**
 * Painel da obra. Em cima, o que se decide no dia: abrir o dia, três números (prazo, avanço, custo) e o que pede
 * atenção. Curva S, etapas e resumo ficam em "Ver detalhes"; acessos e configuração em "Ajustes da obra".
 */
export function PainelObra({
  projeto,
  papel,
  papelEmpresa,
  itens,
  membros,
  podeEditar,
  linhaBase,
  apontamentos,
  maoDeObra = null,
  material = null,
  ultimaFoto = null,
  equipeHoje = null,
  hoje = hojeIso(),
  atencao = null,
  tempo = null,
  ficha = null,
}: {
  projeto: Projeto;
  papel: PapelProjeto | null;
  papelEmpresa: PapelEmpresa | null;
  itens: ItemEap[];
  membros: MembroProjeto[];
  podeEditar: boolean;
  linhaBase: LinhaBase | null;
  apontamentos: ApontamentoRegistrado[];
  /** Gasto com mão de obra (custo calculado no banco). null = sem permissão para ver custos. */
  maoDeObra?: { custo: number; horas: number; semCusto: number } | null;
  /** Almoxarifado: aplicado nas tarefas (custo médio; null = sem permissão para ver custos), itens no catálogo e abaixo do mínimo. */
  material?: { aplicado: number | null; itens: number; abaixoDoMinimo: number } | null;
  /** Foto mais recente das câmeras da obra (URL assinada). */
  ultimaFoto?: { url: string; camera: string; quando: string; cameras: number } | null;
  /** Pessoas presentes na chamada de hoje (null = sem acesso). */
  equipeHoje?: number | null;
  hoje?: string;
  /** Blocos montados pela página: o que pede atenção, a previsão do tempo e a ficha técnica. */
  atencao?: ReactNode;
  tempo?: ReactNode;
  ficha?: ReactNode;
}) {
  const p = montarPainel(itens, apontamentos, linhaBase !== null, hoje);
  const temTarefas = itens.some((i) => i.tipo === 'tarefa');
  const orcamento = projeto.orcamento_total !== null ? Number(projeto.orcamento_total) : null;
  const papelTexto = papel ? ROTULO_PAPEL_PROJETO[papel] : papelEmpresa === 'admin' ? 'Administrador da empresa' : '—';
  const base = `/projetos/${projeto.id}`;

  const feitos: Record<string, boolean> = {
    'Dados básicos': true,
    'EAP e cronograma': temTarefas,
    'Linha de base': linhaBase !== null,
    'Orçamento por etapa': (p.custoTotal ?? 0) > 0,
    Almoxarifado: (material?.itens ?? 0) > 0,
    Câmeras: (ultimaFoto?.cameras ?? 0) > 0,
  };
  const materialAplicado = material?.aplicado ?? null;
  const gastoReal = maoDeObra || materialAplicado !== null ? (maoDeObra?.custo ?? 0) + (materialAplicado ?? 0) : null;
  const proximo = !temTarefas
    ? { texto: 'Monte a EAP para o painel ganhar vida.', acao: 'Importar planilha ou MS Project', href: `${base}/cronograma/importar` }
    : !projeto.data_inicio || !projeto.data_fim_prevista
      ? {
          texto: 'A obra está sem início e fim previsto. Complete os dados (dá para usar as datas do cronograma com um toque).',
          acao: 'Completar os dados da obra',
          href: `${base}/editar`,
        }
      : !linhaBase
      ? {
          texto: 'Defina a linha de base quando o cronograma for aprovado: é contra ela que o atraso é medido.',
          acao: 'Abrir o Gantt',
          href: `${base}/cronograma/gantt`,
        }
      : apontamentos.length === 0
        ? { texto: 'Aponte o avanço das tarefas em "Hoje" para ver o real contra o planejado.', acao: 'Apontar avanço', href: `${base}/hoje` }
        : null;

  const resumoHoje = [
    p.hoje.atrasadas > 0 ? `${p.hoje.atrasadas} ${p.hoje.atrasadas === 1 ? 'atrasado' : 'atrasados'}` : 'nenhum atrasado',
    equipeHoje !== null ? (equipeHoje > 0 ? `${equipeHoje} na chamada` : 'chamada não feita') : null,
    material && material.abaixoDoMinimo > 0 ? `${material.abaixoDoMinimo} ${material.abaixoDoMinimo === 1 ? 'material acabando' : 'materiais acabando'}` : null,
  ].filter(Boolean);

  return (
    <div className="flex flex-col gap-6">
      {proximo && (
        <div className="flex flex-col gap-3 rounded-medio border border-cianotipia/30 bg-cianotipia-claro px-4 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-5">
          <p className="text-sm text-cianotipia">
            <strong className="font-semibold">Próximo passo.</strong> {proximo.texto}
          </p>
          {(podeEditar || proximo.href.endsWith('/hoje')) && (
            <Link
              href={proximo.href}
              className="inline-flex min-h-11 shrink-0 items-center justify-center rounded-medio bg-cianotipia px-4 text-sm font-semibold text-white hover:bg-cianotipia-escuro"
            >
              {proximo.acao}
            </Link>
          )}
        </div>
      )}

      {/* Ação principal: o dia na obra. */}
      {temTarefas && (
        <Link
          href={`${base}/hoje`}
          className="flex min-h-16 items-center gap-4 rounded-cartao bg-cianotipia px-4 py-3 text-white hover:bg-cianotipia-escuro sm:px-5"
        >
          <span aria-hidden className="flex size-11 shrink-0 items-center justify-center rounded-medio bg-white/15">
            <ClipboardList className="size-6" />
          </span>
          <span className="min-w-0 flex-1">
            <span className="numeros block text-lg font-semibold">
              Abrir o dia: {p.hoje.previstas} {p.hoje.previstas === 1 ? 'serviço previsto' : 'serviços previstos'}
            </span>
            <span className="numeros block text-sm text-white/85">{resumoHoje.join(' · ')}</span>
          </span>
          <ChevronRight aria-hidden className="size-6 shrink-0" />
        </Link>
      )}

      {/* Três números. */}
      <section aria-label="Prazo, avanço e custo" className="grid gap-3 md:grid-cols-3">
        <CartaoPrazo projecao={p.projecao} fimProjeto={projeto.data_fim_prevista} />
        <Cartao rotulo="Avanço físico">
          <p className="numeros text-3xl font-bold tracking-tight">
            {Math.round(p.projecao.real)}% <span className="text-base font-normal text-regua">feito</span>
          </p>
          <BarraDupla real={p.projecao.real} planejado={p.projecao.planejado} />
          <p className="numeros mt-2 text-sm text-regua">
            Planejado para hoje: <span className="font-semibold text-grafite">{Math.round(p.projecao.planejado)}%</span>
          </p>
        </Cartao>
        <Cartao rotulo="Custo">
          {gastoReal !== null ? (
            <>
              <p className="numeros text-3xl font-bold tracking-tight">{formatarMoeda(gastoReal, { compacta: true })}</p>
              <p className="numeros mt-1 text-sm text-regua">
                gastos até hoje · {formatarMoeda(p.valorExecutado, { compacta: true })} de serviço feito
              </p>
            </>
          ) : (
            <>
              <p className="numeros text-3xl font-bold tracking-tight">{formatarMoeda(p.valorExecutado, { compacta: true })}</p>
              <p className="numeros mt-1 text-sm text-regua">
                {p.custoTotal !== null ? `de serviço feito, de ${formatarMoeda(p.custoTotal, { compacta: true })} previstos` : 'Preencha o custo dos serviços'}
              </p>
            </>
          )}
          {orcamento !== null && p.custoTotal !== null && p.custoTotal > orcamento && (
            <p className="numeros mt-1 text-sm font-semibold text-marcador">Previsto {Math.round((p.custoTotal / orcamento) * 100 - 100)}% acima do orçamento</p>
          )}
          <Link href={`${base}/orcamento/realizado`} className="mt-auto inline-flex min-h-11 items-center pt-2 text-sm font-semibold text-cianotipia hover:underline underline-offset-4">
            Ver orçado × gasto
          </Link>
        </Cartao>
      </section>

      {atencao}
      {tempo}

      <Recolhivel titulo="Ver detalhes da obra" resumo="Curva S, etapas, última foto, resumo e ficha técnica" icone={TrendingUp}>
        <section aria-labelledby="titulo-curva">
          <h2 id="titulo-curva" className="text-base font-semibold">
            Curva S física
          </h2>
          <p className="mt-1 mb-4 text-sm text-regua">Avanço acumulado da obra, planejado contra o apontado.</p>
          {p.curva.length >= 2 ? (
            <CurvaS pontos={p.curva} hoje={hoje} referencia={linhaBase ? 'linha de base' : 'previsto atual'} />
          ) : (
            <p className="text-sm text-regua">Aparece quando os serviços tiverem datas.</p>
          )}
        </section>

        {p.etapas.length > 0 && (
          <section aria-labelledby="titulo-etapas" className="rounded-medio border border-linha">
            <div className="border-b border-linha px-4 py-3">
              <h2 id="titulo-etapas" className="text-base font-semibold">
                Etapas
              </h2>
              <p className="mt-1 text-sm text-regua">Feito × planejado para hoje e término contra a linha de base.</p>
            </div>
            <ul className="divide-y divide-linha">
              {p.etapas.map((e) => {
                const atras = e.planejado - e.real;
                return (
                  <li key={e.id} className="grid gap-2 px-4 py-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)_auto] sm:items-center sm:gap-4">
                    <p className="min-w-0 font-medium break-words">
                      <span className="numeros mr-1.5 text-sm text-regua">{e.codigo}</span>
                      {e.nome}
                    </p>
                    <div>
                      <BarraDupla real={e.real} planejado={e.planejado} fina />
                      <p className="numeros mt-1 text-xs text-regua">
                        {Math.round(e.real)}% feito · {Math.round(e.planejado)}% planejado
                        {atras >= 5 && <span className="font-semibold text-marcador"> · {Math.round(atras)} p.p. atrás</span>}
                      </p>
                    </div>
                    <p className="numeros text-sm sm:text-right">
                      {e.desvioDias === null ? (
                        <span className="text-regua">Sem base</span>
                      ) : e.desvioDias > 0 ? (
                        <span className="font-semibold text-marcador">+{e.desvioDias} dias</span>
                      ) : e.desvioDias < 0 ? (
                        <span className="font-semibold text-obra-ok">{e.desvioDias} dias</span>
                      ) : (
                        <span className="text-obra-ok">Na data</span>
                      )}
                    </p>
                  </li>
                );
              })}
            </ul>
          </section>
        )}

        <div className="grid gap-6 lg:grid-cols-2">
          {ultimaFoto && (
            <section aria-labelledby="titulo-ultima-foto" className="overflow-hidden rounded-medio border border-linha">
              <Link href={`${base}/cameras`} className="block aspect-video bg-concreto">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={ultimaFoto.url} alt={`Última foto de ${ultimaFoto.camera}`} className="h-full w-full object-cover" />
              </Link>
              <div className="flex items-baseline justify-between gap-3 px-4 py-3">
                <h2 id="titulo-ultima-foto" className="text-base font-semibold">
                  Última foto
                </h2>
                <p className="numeros text-sm text-regua">
                  {ultimaFoto.camera} · {formatarData(dataDoInstante(ultimaFoto.quando))} {horaDoInstante(ultimaFoto.quando)}
                </p>
              </div>
            </section>
          )}
          <section aria-labelledby="titulo-resumo" className="rounded-medio border border-linha">
            <h2 id="titulo-resumo" className="border-b border-linha px-4 py-3 text-base font-semibold">
              Resumo
            </h2>
            <dl className="numeros divide-y divide-linha text-sm">
              <Linha rotulo="Orçamento total" valor={formatarMoeda(projeto.orcamento_total)} />
              <Linha rotulo="Custo previsto nos serviços" valor={formatarMoeda(p.custoTotal)} />
              <Linha rotulo="Início" valor={formatarData(projeto.data_inicio)} />
              <Linha rotulo="Fim previsto" valor={formatarData(projeto.data_fim_prevista)} />
              <Linha
                rotulo="Linha de base"
                valor={linhaBase ? formatarData(hojeIso('America/Sao_Paulo', new Date(linhaBase.definida_em))) : 'Não definida'}
              />
              {p.ultimoApontamento && <Linha rotulo="Último apontamento" valor={formatarData(p.ultimoApontamento)} />}
              {maoDeObra && <Linha rotulo="Gasto com mão de obra" valor={formatarMoeda(maoDeObra.custo)} />}
              {materialAplicado !== null && <Linha rotulo="Gasto com material" valor={formatarMoeda(materialAplicado)} />}
              <Linha rotulo="Seu papel" valor={papelTexto} />
            </dl>
          </section>
        </div>
        {ficha}
      </Recolhivel>

      <Recolhivel titulo="Ajustes da obra" resumo="Dados da obra, quem tem acesso e o que falta configurar" icone={Settings}>
        {podeEditar && (
          <Link
            href={`${base}/editar`}
            className="inline-flex min-h-11 w-fit items-center gap-2 rounded-medio border border-campo/60 bg-papel px-4 font-semibold hover:bg-concreto/50"
          >
            <Pencil aria-hidden className="size-4" />
            Editar dados da obra
          </Link>
        )}
        <MembrosProjeto projetoId={projeto.id} membros={membros} podeEditar={podeEditar} />
        <section aria-labelledby="titulo-config" className="rounded-medio border border-linha px-4 py-4">
          <h2 id="titulo-config" className="text-base font-semibold">
            Configuração da obra
          </h2>
          <ol className="mt-3 flex flex-col gap-2 text-sm">
            {PASSOS.map((passo) => {
              const modulo = passo.modulo ? MODULOS.find((m) => m.slug === passo.modulo) : null;
              const feito = feitos[passo.titulo] ?? false;
              return (
                <li key={passo.titulo} className="flex items-center gap-2.5">
                  <span
                    aria-hidden
                    className={`flex size-5 shrink-0 items-center justify-center rounded-full border-2 ${
                      feito ? 'border-cianotipia bg-cianotipia text-white' : 'border-linha'
                    }`}
                  >
                    {feito && <Check className="size-3" strokeWidth={3} />}
                  </span>
                  <span className={feito ? '' : 'text-regua'}>
                    {passo.titulo}
                    <span className="sr-only">{feito ? ' (feito)' : ' (pendente)'}</span>
                  </span>
                  {modulo && !modulo.disponivel && <span className="ml-auto text-xs text-regua">sprint {modulo.sprint}</span>}
                </li>
              );
            })}
          </ol>
        </section>
      </Recolhivel>
    </div>
  );
}

const ICONE_CARTAO: Record<string, LucideIcon> = {
  Prazo: CalendarClock,
  'Avanço físico': TrendingUp,
  Custo: Banknote,
};

function Cartao({ rotulo, children }: { rotulo: string; children: ReactNode }) {
  const Icone = ICONE_CARTAO[rotulo];
  return (
    <div className="flex flex-col cartao p-4 sm:p-5">
      <h2 className="mb-3 flex items-center gap-2.5 text-sm font-semibold text-regua">
        {Icone && (
          <span aria-hidden className="flex size-8 items-center justify-center rounded-medio bg-cianotipia-claro text-cianotipia">
            <Icone className="size-[18px]" />
          </span>
        )}
        {rotulo}
      </h2>
      {children}
    </div>
  );
}

/** Barra do feito com um traço no planejado para hoje. */
function BarraDupla({ real, planejado, fina }: { real: number; planejado: number; fina?: boolean }) {
  const atrasado = planejado - real >= 5;
  return (
    <div className={`relative mt-3 ${fina ? 'h-2' : 'h-3'} rounded-full bg-linha`} aria-hidden>
      <div className={`absolute inset-y-0 left-0 rounded-full ${atrasado ? 'bg-marcador' : 'bg-cianotipia'}`} style={{ width: `${Math.min(100, real)}%` }} />
      <span
        className={`absolute -translate-x-1/2 rounded-full bg-grafite ring-2 ring-papel ${fina ? '-top-1 h-4 w-1' : '-top-1.5 h-6 w-1'}`}
        style={{ left: `${Math.min(100, planejado)}%` }}
        title={`Planejado: ${Math.round(planejado)}%`}
      />
    </div>
  );
}

const ICONE_OK = <Check aria-hidden className="size-4" strokeWidth={2.5} />;
const ICONE_ALERTA = <TriangleAlert aria-hidden className="size-4" />;

function CartaoPrazo({ projecao, fimProjeto }: { projecao: Projecao; fimProjeto: string | null }) {
  const pr = projecao;
  const fimRef = pr.fimPlanejado ?? fimProjeto;
  const depois = pr.fimProjetado && fimRef ? diasEntre(fimRef, pr.fimProjetado) : null;

  let titulo: ReactNode;
  let detalhe: ReactNode;
  let tom: 'ok' | 'alerta' | 'neutro' = 'neutro';

  switch (pr.situacao) {
    case 'atrasada':
      tom = 'alerta';
      titulo = `${pr.atrasoDias} dias de atraso`;
      detalhe = (
        <span className="flex flex-col gap-1">
          <span>
            Se a obra voltar ao ritmo do plano: <strong className="font-semibold text-grafite">{formatarData(somar(fimRef, pr.atrasoDias ?? 0))}</strong>
          </span>
          <span>
            Mantendo o ritmo atual: <strong className="font-semibold text-grafite">{formatarData(pr.fimProjetado)}</strong>
            {depois !== null && depois > 0 && ` (+${depois} dias)`}
          </span>
          <span className="text-xs">Fim previsto: {formatarData(fimRef)}</span>
        </span>
      );
      break;
    case 'adiantada':
      tom = 'ok';
      titulo = `${-(pr.atrasoDias ?? 0)} dias adiantada`;
      detalhe = <>Nesse ritmo, termina em {formatarData(pr.fimProjetado)} (previsto: {formatarData(fimRef)}).</>;
      break;
    case 'no_prazo':
      tom = 'ok';
      titulo = 'No prazo';
      detalhe = <>Término previsto em {formatarData(fimRef)}.</>;
      break;
    case 'sem_avanco':
      tom = 'alerta';
      titulo = 'Sem avanço apontado';
      detalhe = <>O plano já previa {Math.round(pr.planejado)}% até hoje. Aponte o avanço em &quot;Hoje&quot;.</>;
      break;
    case 'nao_comecou':
      titulo = `Começa em ${formatarData(pr.inicioPlanejado)}`;
      detalhe = <>Término previsto em {formatarData(fimRef)}.</>;
      break;
    case 'concluida':
      tom = 'ok';
      titulo = 'Concluída';
      detalhe = <>Todas as tarefas em 100%.</>;
      break;
    default:
      titulo = 'Sem datas';
      detalhe = <>Preencha início e término das tarefas para projetar o prazo.</>;
  }

  return (
    <Cartao rotulo="Prazo">
      <p
        className={`flex items-center gap-2 text-2xl leading-tight font-semibold ${
          tom === 'alerta' ? 'text-marcador' : tom === 'ok' ? 'text-obra-ok' : ''
        }`}
      >
        {tom === 'alerta' ? ICONE_ALERTA : tom === 'ok' ? ICONE_OK : null}
        <span className="numeros">{titulo}</span>
      </p>
      <div className="numeros mt-2 text-sm text-regua">{detalhe}</div>
      <p className="mt-auto pt-2 text-xs text-regua">
        Medido contra {pr.referencia === 'linha_de_base' ? 'a linha de base' : 'o cronograma atual (sem linha de base)'}.
      </p>
    </Cartao>
  );
}

function somar(iso: string | null, dias: number): string | null {
  if (!iso) return null;
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + dias);
  return d.toISOString().slice(0, 10);
}

function Linha({ rotulo, valor }: { rotulo: string; valor: string }) {
  return (
    <div className="flex justify-between gap-4 px-5 py-3">
      <dt className="text-regua">{rotulo}</dt>
      <dd className="text-right font-semibold">{valor}</dd>
    </div>
  );
}
