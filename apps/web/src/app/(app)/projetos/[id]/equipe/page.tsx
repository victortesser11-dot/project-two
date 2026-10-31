import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { custoPorDia, custoPorTarefa, formatarData, formatarMoeda, hojeIso, somarDias, totalMaoObra } from '@obras/shared';
import {
  buscarEap,
  buscarProjeto,
  custoMaoObra,
  custosVigentesEm,
  listarCustos,
  listarEmpreiteiras,
  listarEquipeProjeto,
  listarTrabalhadores,
  podeApontarCampo,
  podeEditarProjeto,
  podeVerCustos,
} from '@/lib/dados';
import { BotaoNaObra, FormularioPessoa, IncluirPessoas } from './Formularios';
import { FuncoesObra } from './FuncoesObra';

export const metadata: Metadata = { title: 'Equipe' };

const horasBr = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 1 });

export default async function PaginaEquipe({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const dados = await buscarProjeto(id);
  if (!dados) notFound();
  const { projeto, papel } = dados;
  const hoje = hojeIso();

  const [equipe, empreiteiras, todas, podeGerir, podeApontar, verCustos] = await Promise.all([
    listarEquipeProjeto(id),
    listarEmpreiteiras(projeto.empresa_id),
    listarTrabalhadores(projeto.empresa_id),
    podeEditarProjeto(projeto, papel),
    podeApontarCampo(projeto, papel),
    podeVerCustos(projeto, papel),
  ]);
  const [custos, linhas, itens] = await Promise.all([
    verCustos ? listarCustos(projeto.empresa_id) : Promise.resolve([]),
    verCustos ? custoMaoObra(id) : Promise.resolve(null),
    verCustos ? buscarEap(id) : Promise.resolve([]),
  ]);
  const vigentes = custosVigentesEm(custos, hoje);
  const nomeEmpreiteira = Object.fromEntries(empreiteiras.map((e) => [e.id, e.nome]));
  const naObra = new Set(equipe.map((p) => p.id));
  const foraDaObra = todas.filter((p) => !naObra.has(p.id) && p.ativo);
  const base = `/projetos/${id}/equipe`;

  const total = linhas ? totalMaoObra(linhas) : null;
  const semana = linhas ? totalMaoObra(linhas.filter((l) => l.data > somarDias(hoje, -7))) : null;
  const porTarefa = linhas ? custoPorTarefa(linhas).slice(0, 8) : [];
  const porDia = linhas ? custoPorDia(linhas).slice(0, 7) : [];
  const nomeTarefa = new Map(itens.map((i) => [i.id, `${i.codigo} ${i.nome}`]));

  return (
    <div className="flex flex-col gap-8">
      <FuncoesObra />
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h2 className="text-xl font-semibold sm:text-2xl">Equipe</h2>
          <p className="mt-1 text-regua">Quem trabalha na obra, a chamada do dia e o custo de mão de obra por tarefa.</p>
        </div>
        <div className="flex flex-wrap gap-2">
          {podeApontar && (
            <Link
              href={`${base}/chamada/${hoje}`}
              className="inline-flex min-h-11 items-center justify-center rounded-medio bg-cianotipia px-4 font-semibold text-white hover:bg-cianotipia-escuro"
            >
              Fazer a chamada de hoje
            </Link>
          )}
          <Link
            href={`${base}/empreiteiras`}
            className="inline-flex min-h-11 items-center justify-center rounded-medio border border-campo/60 bg-papel px-4 font-semibold hover:border-grafite"
          >
            Empreiteiras
          </Link>
        </div>
      </div>

      {verCustos && total && (
        <section aria-labelledby="titulo-custo-mo" className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)]">
          <div className="grid grid-cols-2 gap-3">
            <div className="rounded-medio border border-linha bg-papel p-4">
              <h3 id="titulo-custo-mo" className="text-sm font-semibold text-regua">
                Mão de obra na obra
              </h3>
              <p className="numeros mt-1 text-2xl font-semibold">{formatarMoeda(total.custo, { compacta: true })}</p>
              <p className="numeros text-sm text-regua">{horasBr.format(total.horas)} h apontadas</p>
            </div>
            <div className="rounded-medio border border-linha bg-papel p-4">
              <h3 className="text-sm font-semibold text-regua">Últimos 7 dias</h3>
              <p className="numeros mt-1 text-2xl font-semibold">{formatarMoeda(semana?.custo ?? 0, { compacta: true })}</p>
              <p className="numeros text-sm text-regua">{horasBr.format(semana?.horas ?? 0)} h</p>
            </div>
            {total.semCusto > 0 && (
              <p className="col-span-2 rounded-medio bg-marcador-claro px-3 py-2 text-sm font-semibold text-marcador">
                {total.semCusto} {total.semCusto === 1 ? 'apontamento está' : 'apontamentos estão'} sem custo: lance o custo das pessoas destacadas abaixo.
              </p>
            )}
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="rounded-medio border border-linha bg-papel">
              <h3 className="border-b border-linha px-4 py-3 text-sm font-semibold">Por tarefa</h3>
              {porTarefa.length === 0 ? (
                <p className="px-4 py-3 text-sm text-regua">Sem chamada registrada.</p>
              ) : (
                <ul className="numeros divide-y divide-linha text-sm">
                  {porTarefa.map((t) => (
                    <li key={t.chave} className="flex justify-between gap-3 px-4 py-2">
                      <span className="min-w-0 truncate">{nomeTarefa.get(t.chave) ?? 'Tarefa removida'}</span>
                      <span className="shrink-0 font-semibold">{formatarMoeda(t.custo)}</span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
            <div className="rounded-medio border border-linha bg-papel">
              <h3 className="border-b border-linha px-4 py-3 text-sm font-semibold">Por dia</h3>
              {porDia.length === 0 ? (
                <p className="px-4 py-3 text-sm text-regua">Sem chamada registrada.</p>
              ) : (
                <ul className="numeros divide-y divide-linha text-sm">
                  {porDia.map((d) => (
                    <li key={d.chave} className="flex justify-between gap-3 px-4 py-2">
                      <Link href={`${base}/chamada/${d.chave}`} className="text-cianotipia hover:underline underline-offset-4">
                        {formatarData(d.chave)}
                      </Link>
                      <span className="font-semibold">
                        {formatarMoeda(d.custo)}
                        {d.semCusto > 0 && <span className="ml-1 text-marcador">*</span>}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          </div>
        </section>
      )}

      <section aria-labelledby="titulo-equipe-obra" className="rounded-medio border border-linha bg-papel">
        <div className="flex items-baseline justify-between gap-3 border-b border-linha px-4 py-3 sm:px-5">
          <h3 id="titulo-equipe-obra" className="text-base font-semibold">
            Equipe da obra
          </h3>
          <span className="numeros text-sm text-regua">{equipe.filter((p) => p.na_obra).length} na chamada</span>
        </div>
        {equipe.length === 0 ? (
          <p className="px-4 py-6 text-sm text-regua sm:px-5">Ninguém na equipe ainda. {podeGerir ? 'Cadastre ou traga pessoas abaixo.' : ''}</p>
        ) : (
          <ul className="divide-y divide-linha">
            {equipe.map((p) => {
              const c = vigentes.get(p.id);
              return (
                <li key={p.id} className={`flex flex-wrap items-center justify-between gap-2 px-4 py-3 sm:px-5 ${p.na_obra ? '' : 'bg-concreto/50'}`}>
                  <div className="min-w-0">
                    <Link href={`${base}/pessoa/${p.id}`} className="font-semibold hover:text-cianotipia">
                      {p.nome}
                    </Link>
                    <p className="numeros text-sm text-regua">
                      {p.funcao}
                      {p.empreiteira_id && nomeEmpreiteira[p.empreiteira_id] ? ` · ${nomeEmpreiteira[p.empreiteira_id]}` : ' · Própria'}
                      {p.cpf_mascarado ? ` · CPF ${p.cpf_mascarado}` : ''}
                      {!p.na_obra && ' · fora da chamada'}
                    </p>
                  </div>
                  <div className="flex items-center gap-2">
                    {verCustos &&
                      (c ? (
                        <span className="numeros text-sm">
                          {formatarMoeda(c.valor)}
                          <span className="text-regua"> {c.tipo === 'hora' ? '/h' : c.tipo === 'diaria' ? '/dia' : `/${c.unidade_producao}`}</span>
                        </span>
                      ) : (
                        <Link href={`${base}/pessoa/${p.id}`} className="text-sm font-semibold text-marcador hover:underline underline-offset-4">
                          Sem custo
                        </Link>
                      ))}
                    {podeGerir && <BotaoNaObra projetoId={id} pessoaId={p.id} naObra={p.na_obra} />}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      {podeGerir && (
        <div className="grid gap-6 lg:grid-cols-2">
          <section aria-labelledby="titulo-cadastrar" className="rounded-medio border border-linha bg-papel p-4 sm:p-5">
            <h3 id="titulo-cadastrar" className="mb-4 text-base font-semibold">
              Cadastrar pessoa
            </h3>
            <FormularioPessoa projetoId={id} empreiteiras={empreiteiras} />
          </section>
          <section aria-labelledby="titulo-trazer" className="rounded-medio border border-linha bg-papel p-4 sm:p-5">
            <h3 id="titulo-trazer" className="mb-4 text-base font-semibold">
              Trazer pessoas de outras obras da empresa
            </h3>
            <IncluirPessoas projetoId={id} foraDaObra={foraDaObra} />
          </section>
        </div>
      )}
    </div>
  );
}
