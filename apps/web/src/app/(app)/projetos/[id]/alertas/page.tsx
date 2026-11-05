import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { formatarData, ROTULO_CAUSA_ATRASO, ROTULO_SECAO_ALERTA, type CausaAtraso, type SecaoAlerta } from '@obras/shared';
import { buscarProjeto, podeApontarCampo } from '@/lib/dados';
import { alertasDaObra } from '@/lib/alertas';
import { Justificar } from './Justificar';
import { SeloGravidade } from './SeloGravidade';

export const metadata: Metadata = { title: 'Alertas' };

const ORDEM_SECOES: SecaoAlerta[] = ['cronograma', 'clima', 'financeiro', 'almoxarifado', 'diario', 'cameras'];

export default async function PaginaAlertas({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const dados = await buscarProjeto(id);
  if (!dados) notFound();
  const { projeto, papel } = dados;
  const [{ alertas, justificativas, previsao, tarefas }, podeJustificar] = await Promise.all([alertasDaObra(projeto, papel), podeApontarCampo(projeto, papel)]);
  const nomeTarefa = new Map(tarefas.map((t) => [t.id, `${t.codigo} ${t.nome}`]));
  const conta = (g: string) => alertas.filter((a) => a.gravidade === g).length;
  const diasPorCausa = new Map<CausaAtraso, number>();
  for (const j of justificativas) if (j.dias_impacto) diasPorCausa.set(j.causa, (diasPorCausa.get(j.causa) ?? 0) + j.dias_impacto);
  const temLocal = projeto.latitude != null && projeto.longitude != null;

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h2 className="text-xl font-semibold sm:text-2xl">Alertas da obra</h2>
        <p className="mt-1 max-w-3xl text-regua">
          Calculados agora pelo cronograma, diário, almoxarifado, medições, câmeras e previsão do tempo. Tarefa atrasada pede justificativa: ela fica
          registrada e serve para negociar prazo com o cliente.
        </p>
      </div>

      <ul className="flex flex-wrap gap-3 text-sm" aria-label="Resumo dos alertas">
        <li className="numeros flex items-center gap-2">
          <SeloGravidade gravidade="alta" /> {conta('alta')}
        </li>
        <li className="numeros flex items-center gap-2">
          <SeloGravidade gravidade="media" /> {conta('media')}
        </li>
        <li className="numeros flex items-center gap-2">
          <SeloGravidade gravidade="baixa" /> {conta('baixa')}
        </li>
      </ul>

      {temLocal ? (
        previsao.length > 0 && (
          <section aria-labelledby="titulo-previsao" className="rounded-medio border border-linha bg-papel p-4 sm:p-5">
            <h3 id="titulo-previsao" className="mb-3 text-base font-semibold">
              Chuva nos próximos dias
            </h3>
            <ul className="numeros grid grid-cols-4 gap-2 text-center text-sm sm:grid-cols-7">
              {previsao.map((d) => {
                const forte = d.chuva_mm >= 5;
                return (
                  <li key={d.data} className={`rounded-pequeno px-2 py-2 ${forte ? 'bg-cianotipia-claro font-semibold text-cianotipia' : 'bg-concreto'}`}>
                    <span className="block text-xs text-regua">{formatarData(d.data).slice(0, 5)}</span>
                    <span className="block">{d.chuva_mm.toLocaleString('pt-BR', { maximumFractionDigits: 1 })} mm</span>
                    {d.probabilidade !== null && <span className="block text-xs text-regua">{Math.round(d.probabilidade)}%</span>}
                  </li>
                );
              })}
            </ul>
          </section>
        )
      ) : (
        <p className="rounded-medio border border-linha bg-papel p-4 text-sm text-regua">
          A obra ainda não tem localização: os alertas de chuva prevista não aparecem. Grave a localização pelo diário de obra.
        </p>
      )}

      {alertas.length === 0 ? (
        <p className="rounded-medio border border-linha bg-papel p-4 text-regua">Nenhum alerta agora. Tudo em dia.</p>
      ) : (
        ORDEM_SECOES.map((secao) => {
          const lista = alertas.filter((a) => a.secao === secao);
          if (lista.length === 0) return null;
          return (
            <section key={secao} aria-labelledby={`titulo-${secao}`} className="rounded-medio border border-linha bg-papel">
              <h3 id={`titulo-${secao}`} className="border-b border-linha px-4 py-3 text-base font-semibold sm:px-5">
                {ROTULO_SECAO_ALERTA[secao]} <span className="numeros font-normal text-regua">({lista.length})</span>
              </h3>
              <ul className="divide-y divide-linha">
                {lista.map((a) => (
                  <li key={a.chave} className="flex flex-col gap-2 px-4 py-3 sm:px-5">
                    <div className="flex flex-wrap items-center gap-2">
                      <SeloGravidade gravidade={a.gravidade} />
                      <span className="font-semibold">{a.titulo}</span>
                    </div>
                    <p className="text-sm text-regua">{a.detalhe}</p>
                    <div className="flex flex-wrap gap-x-5 gap-y-2 text-sm">
                      {a.caminho && (
                        <Link href={`/projetos/${id}/${a.caminho}`} className="font-semibold text-cianotipia hover:underline underline-offset-4">
                          Abrir
                        </Link>
                      )}
                    </div>
                    {a.tarefaId && !a.justificativa && podeJustificar && (
                      <details className="rounded-medio border border-linha bg-concreto/40 px-3 py-2">
                        <summary className="flex min-h-11 cursor-pointer items-center text-sm font-semibold">Justificar atraso</summary>
                        <div className="pt-2 pb-1">
                          <Justificar projetoId={id} tarefaId={a.tarefaId} sugestao={a.sugestao} diasAtraso={a.diasAtraso} />
                        </div>
                      </details>
                    )}
                  </li>
                ))}
              </ul>
            </section>
          );
        })
      )}

      <section aria-labelledby="titulo-justificativas" className="rounded-medio border border-linha bg-papel">
        <div className="border-b border-linha px-4 py-3 sm:px-5">
          <h3 id="titulo-justificativas" className="text-base font-semibold">
            Justificativas registradas <span className="numeros font-normal text-regua">({justificativas.length})</span>
          </h3>
          {diasPorCausa.size > 0 && (
            <p className="numeros mt-1 text-sm text-regua">
              Dias de impacto por causa:{' '}
              {[...diasPorCausa]
                .sort((a, b) => b[1] - a[1])
                .map(([c, d]) => `${ROTULO_CAUSA_ATRASO[c]} ${d}`)
                .join(' · ')}
            </p>
          )}
        </div>
        {justificativas.length === 0 ? (
          <p className="px-4 py-4 text-sm text-regua sm:px-5">Nenhuma justificativa ainda.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="numeros w-full min-w-[720px] text-left text-sm">
              <thead className="bg-concreto">
                <tr>
                  <th className="px-4 py-2 font-semibold sm:px-5">Data</th>
                  <th className="px-3 py-2 font-semibold">Tarefa</th>
                  <th className="px-3 py-2 font-semibold">Causa</th>
                  <th className="px-3 py-2 text-right font-semibold">Dias</th>
                  <th className="px-3 py-2 font-semibold">O que aconteceu</th>
                  <th className="px-3 py-2 font-semibold">Quem</th>
                </tr>
              </thead>
              <tbody>
                {justificativas.map((j) => (
                  <tr key={j.id} className="border-t border-linha align-top">
                    <td className="px-4 py-2 sm:px-5">{formatarData(j.criado_em.slice(0, 10))}</td>
                    <td className="px-3 py-2">{nomeTarefa.get(j.tarefa_id) ?? 'Tarefa removida'}</td>
                    <td className="px-3 py-2">{ROTULO_CAUSA_ATRASO[j.causa]}</td>
                    <td className="px-3 py-2 text-right">{j.dias_impacto ?? '—'}</td>
                    <td className="px-3 py-2">{j.descricao}</td>
                    <td className="px-3 py-2 text-regua">{j.registrado_nome ?? '—'}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
