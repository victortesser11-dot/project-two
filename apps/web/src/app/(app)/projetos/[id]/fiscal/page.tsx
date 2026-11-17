import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { ScanEye, ShieldCheck } from 'lucide-react';
import {
  formatarData,
  hojeIso,
  leituraFiscalSchema,
  ROTULO_TIPO_ACHADO,
  taxaDeAcerto,
  TIPOS_ACHADO,
} from '@obras/shared';
import { buscarProjeto, leiturasIaHoje, listarAchadosFiscais, listarLeiturasFiscais, podeApontarCampo } from '@/lib/dados';
import { iaConfigurada, limiteDiarioIa } from '@/lib/ia';
import { FiscalizarDia, ItemAchado, SeloSituacao } from './Fiscal';

export const metadata: Metadata = { title: 'Fiscal da obra' };
// A leitura de várias câmeras com o modelo grátis pode levar minutos.
export const maxDuration = 300;

const META_ACERTO = 0.7;

export default async function PaginaFiscal({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const dados = await buscarProjeto(id);
  if (!dados) notFound();
  const { projeto, papel } = dados;
  const [achados, leituras, podeConferir, usadas] = await Promise.all([
    listarAchadosFiscais(id),
    listarLeiturasFiscais(id, 5),
    podeApontarCampo(projeto, papel),
    leiturasIaHoje(id),
  ]);
  const comIa = iaConfigurada();
  const pendentes = achados.filter((a) => a.situacao === 'pendente');
  const conferidos = achados.filter((a) => a.situacao !== 'pendente').slice(0, 30);
  const acerto = taxaDeAcerto(achados);
  const ultima = leituras[0];
  const leitura = ultima ? leituraFiscalSchema.safeParse((ultima.resultado as { leitura?: unknown } | null)?.leitura) : null;

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h2 className="text-xl font-semibold tracking-tight sm:text-2xl">Fiscal da obra</h2>
        <p className="mt-1 max-w-3xl text-regua">
          A IA compara a foto de cada câmera com a do dia anterior e com as fotos do diário, cruza com as tarefas previstas e com o avanço
          apontado, e aponta divergências e itens de segurança das normas regulamentadoras (NR). É sugestão: cada achado espera alguém
          conferir, e o que a IA erra conta na taxa de acerto.
        </p>
      </div>

      <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,20rem)]">
        <section aria-labelledby="titulo-fiscalizar" className="cartao p-5">
          <h3 id="titulo-fiscalizar" className="flex items-center gap-3 font-semibold tracking-tight">
            <span aria-hidden className="flex size-9 items-center justify-center rounded-medio bg-cianotipia-claro text-cianotipia">
              <ScanEye className="size-5" />
            </span>
            Fiscalizar um dia
          </h3>
          <div className="mt-4">
            {!comIa ? (
              <p className="text-sm text-regua">A IA não está ligada (falta a chave na Vercel).</p>
            ) : podeConferir ? (
              <FiscalizarDia projetoId={id} hoje={hojeIso()} restantesHoje={Math.max(0, limiteDiarioIa() - usadas)} />
            ) : (
              <p className="text-sm text-regua">O engenheiro, o mestre e o admin pedem a leitura e conferem os achados.</p>
            )}
          </div>
        </section>

        <section aria-labelledby="titulo-acerto" className="cartao p-5">
          <h3 id="titulo-acerto" className="flex items-center gap-3 font-semibold tracking-tight">
            <span aria-hidden className="flex size-9 items-center justify-center rounded-medio bg-cianotipia-claro text-cianotipia">
              <ShieldCheck className="size-5" />
            </span>
            Acerto da IA (60 dias)
          </h3>
          {acerto.taxa === null ? (
            <p className="mt-3 text-sm text-regua">Ainda não há achado conferido.</p>
          ) : (
            <>
              <p className="numeros mt-3 text-3xl font-bold">{Math.round(acerto.taxa * 100)}%</p>
              <p className="numeros text-sm text-regua">
                {acerto.confirmados} certos, {acerto.corrigidos} corrigidos e {acerto.descartados} errados em {acerto.conferidos} conferidos. Meta:{' '}
                {Math.round(META_ACERTO * 100)}%.
              </p>
            </>
          )}
        </section>
      </div>

      <section aria-labelledby="titulo-pendentes" className="cartao">
        <h3 id="titulo-pendentes" className="border-b border-linha px-4 py-3 text-base font-semibold sm:px-5">
          A conferir <span className="numeros font-normal text-regua">({pendentes.length})</span>
        </h3>
        {pendentes.length === 0 ? (
          <p className="px-4 py-4 text-sm text-regua sm:px-5">Nada a conferir. Peça a leitura de um dia para a IA apontar divergências e itens de segurança.</p>
        ) : (
          TIPOS_ACHADO.map((tipo) => {
            const lista = pendentes.filter((a) => a.tipo === tipo);
            if (lista.length === 0) return null;
            return (
              <div key={tipo}>
                <h4 className="border-b border-linha bg-concreto/40 px-4 py-2 text-sm font-semibold tracking-wide text-regua uppercase sm:px-5">
                  {ROTULO_TIPO_ACHADO[tipo]} <span className="numeros font-normal">({lista.length})</span>
                </h4>
                <ul className="divide-y divide-linha">
                  {lista.map((a) => (
                    <ItemAchado key={a.id} projetoId={id} achado={a} podeConferir={podeConferir} />
                  ))}
                </ul>
              </div>
            );
          })
        )}
      </section>

      {ultima && leitura?.success && (
        <section aria-labelledby="titulo-ultima" className="cartao p-5">
          <h3 id="titulo-ultima" className="font-semibold tracking-tight">
            Última leitura: {formatarData(ultima.data ?? hojeIso())}
          </h3>
          <p className="mt-2">{leitura.data.resumo || 'A IA não resumiu o dia.'}</p>
          {leitura.data.mudancas.length > 0 && (
            <>
              <h4 className="mt-4 text-sm font-semibold tracking-wide text-regua uppercase">O que mudou desde o dia anterior</h4>
              <ul className="mt-1 list-disc pl-5 text-sm">
                {leitura.data.mudancas.map((m, i) => (
                  <li key={i}>{m}</li>
                ))}
              </ul>
            </>
          )}
          <dl className="mt-4 flex flex-wrap gap-2 text-sm">
            <div className="rounded-medio border border-linha bg-papel px-3 py-1.5">
              <dt className="inline text-regua">Pessoas: </dt>
              <dd className="numeros inline font-medium">{leitura.data.pessoas ?? 'não deu para contar'}</dd>
            </div>
            {leitura.data.maquinas.length > 0 && (
              <div className="rounded-medio border border-linha bg-papel px-3 py-1.5">
                <dt className="inline text-regua">Máquinas: </dt>
                <dd className="inline font-medium">{leitura.data.maquinas.join(', ')}</dd>
              </div>
            )}
          </dl>
          <p className="mt-3 text-xs text-regua">Leitura automática ({ultima.modelo}): confira antes de usar.</p>
        </section>
      )}

      {conferidos.length > 0 && (
        <section aria-labelledby="titulo-conferidos" className="cartao">
          <h3 id="titulo-conferidos" className="border-b border-linha px-4 py-3 text-base font-semibold sm:px-5">
            Conferidos recentemente
          </h3>
          <ul className="divide-y divide-linha">
            {conferidos.map((a) => (
              <li key={a.id} className="flex flex-wrap items-center gap-x-3 gap-y-1 px-4 py-3 text-sm sm:px-5">
                <SeloSituacao situacao={a.situacao} />
                <span className="min-w-0 flex-1">{a.titulo}</span>
                {a.percentual_final !== null && <span className="numeros text-regua">gravado {Math.round(Number(a.percentual_final))}%</span>}
                {a.resposta && <span className="w-full text-regua">{a.resposta}</span>}
              </li>
            ))}
          </ul>
        </section>
      )}

      <p className="text-sm text-regua">
        Documentação das NR (ASO, treinamentos de altura e de obra) não se confere por foto: entra na{' '}
        <Link href={`/projetos/${id}/equipe`} className="font-medium text-cianotipia underline-offset-4 hover:underline">
          Equipe
        </Link>{' '}
        na próxima etapa.
      </p>
    </div>
  );
}
