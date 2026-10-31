import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { dataDoInstante, formatarData, hojeIso, situacaoEmprestimo } from '@obras/shared';
import { buscarItemEstoque, listarEmprestimos, listarEquipeProjeto, listarProjetos, obrasOndeMovimenta } from '@/lib/dados';
import { BotaoDevolucao, FormularioEmprestimo } from '../../projetos/[id]/almoxarifado/ferramentas/ListaFerramentas';

export const metadata: Metadata = { title: 'Ferramenta' };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Página que o QR da etiqueta abre: situação da ferramenta e o empréstimo ou a devolução ali mesmo. */
export default async function PaginaFerramenta({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ obra?: string }> }) {
  const { id } = await params;
  const { obra } = await searchParams;
  if (!UUID.test(id)) notFound();
  const item = await buscarItemEstoque(id);
  if (!item || item.tipo !== 'ferramenta') notFound();
  const hoje = hojeIso();

  const [historico, obras, projetos] = await Promise.all([listarEmprestimos({ itemId: id }), obrasOndeMovimenta(item.empresa_id), listarProjetos()]);
  const nomeObra = new Map(projetos.map((p) => [p.id, p.nome]));
  const aberto = historico.find((e) => e.devolvida_em === null) ?? null;
  const s = aberto ? situacaoEmprestimo(aberto, hoje) : null;
  const podeReceber = aberto !== null && obras.some((o) => o.id === aberto.projeto_id);
  const obraEscolhida = obras.find((o) => o.id === obra) ?? (obras.length === 1 ? obras[0] : undefined);
  const equipe = obraEscolhida && !aberto ? (await listarEquipeProjeto(obraEscolhida.id)).filter((p) => p.na_obra) : [];

  return (
    <div className="mx-auto flex max-w-2xl flex-col gap-6">
      <div>
        <p className="text-sm font-semibold text-regua">Ferramenta</p>
        <h1 className="mt-1 text-2xl font-semibold">{item.nome}</h1>
        <p className="numeros mt-1 text-regua">
          {item.codigo}
          {item.patrimonio ? ` · patrimônio ${item.patrimonio}` : ''}
          {!item.ativo && ' · baixada do patrimônio'}
        </p>
      </div>

      <section
        aria-labelledby="titulo-situacao"
        className={`rounded-medio border p-4 sm:p-5 ${s?.atrasado ? 'border-marcador/40 bg-marcador-claro' : 'border-linha bg-papel'}`}
      >
        <h2 id="titulo-situacao" className="text-base font-semibold">
          {aberto ? (s?.atrasado ? 'Emprestada, com devolução atrasada' : 'Emprestada') : item.ativo ? 'Disponível' : 'Fora de uso'}
        </h2>
        {aberto && (
          <p className="numeros mt-1">
            Com <span className="font-semibold">{aberto.responsavel}</span> desde {formatarData(dataDoInstante(aberto.retirada_em))} ({s!.diasFora}{' '}
            {s!.diasFora === 1 ? 'dia' : 'dias'}) na obra {nomeObra.get(aberto.projeto_id) ?? '—'}
            {aberto.devolver_ate && `. Devolver até ${formatarData(aberto.devolver_ate)}`}.
          </p>
        )}
        <div className="mt-4">
          {aberto ? (
            podeReceber ? (
              <BotaoDevolucao projetoId={aberto.projeto_id} itemId={item.id} />
            ) : (
              <p className="text-sm text-regua">Só o engenheiro e o almoxarife da obra recebem a devolução.</p>
            )
          ) : !item.ativo ? null : obras.length === 0 ? (
            <p className="text-sm text-regua">Só o engenheiro e o almoxarife de uma obra emprestam ferramentas.</p>
          ) : !obraEscolhida ? (
            <div className="flex flex-col gap-2">
              <p className="text-sm font-semibold">Em qual obra a ferramenta vai ficar?</p>
              <ul className="flex flex-col gap-2">
                {obras.map((o) => (
                  <li key={o.id}>
                    <Link
                      href={`/f/${item.id}?obra=${o.id}`}
                      className="flex min-h-11 items-center rounded-medio border border-campo/60 bg-papel px-4 font-semibold hover:border-grafite"
                    >
                      {o.nome}
                    </Link>
                  </li>
                ))}
              </ul>
            </div>
          ) : (
            <div className="flex flex-col gap-3">
              {obras.length > 1 && (
                <p className="text-sm">
                  Obra: <span className="font-semibold">{obraEscolhida.nome}</span>{' '}
                  <Link href={`/f/${item.id}`} className="text-cianotipia underline underline-offset-4">
                    trocar
                  </Link>
                </p>
              )}
              <FormularioEmprestimo projetoId={obraEscolhida.id} itemId={item.id} equipe={equipe} hoje={hoje} />
            </div>
          )}
        </div>
      </section>

      {historico.length > 0 && (
        <section aria-labelledby="titulo-historico" className="rounded-medio border border-linha bg-papel">
          <h2 id="titulo-historico" className="border-b border-linha px-4 py-3 text-base font-semibold sm:px-5">
            Histórico
          </h2>
          <ul className="divide-y divide-linha text-sm">
            {historico.slice(0, 20).map((e) => (
              <li key={e.id} className="px-4 py-2.5 sm:px-5">
                <p className="font-semibold">{e.responsavel}</p>
                <p className="numeros text-regua">
                  {formatarData(dataDoInstante(e.retirada_em))} → {e.devolvida_em ? formatarData(dataDoInstante(e.devolvida_em)) : 'ainda fora'} · {nomeObra.get(e.projeto_id) ?? '—'}
                  {e.observacao ? ` · ${e.observacao}` : ''}
                </p>
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
}
