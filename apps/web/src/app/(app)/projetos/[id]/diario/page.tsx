import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { diaDaSemana, formatarData, hojeIso, ROTULO_CLIMA, somarDias } from '@obras/shared';
import { buscarProjeto, listarDiarios, podeApontarCampo } from '@/lib/dados';
import { feriadosDoAno } from '@/lib/brasilapi';

export const metadata: Metadata = { title: 'Diário de obra' };

export default async function PaginaDiarios({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const dados = await buscarProjeto(id);
  if (!dados) notFound();
  const { projeto, papel } = dados;
  const [diarios, podeApontar] = await Promise.all([listarDiarios(id), podeApontarCampo(projeto, papel)]);

  const hoje = hojeIso();
  const base = `/projetos/${id}/diario`;
  const ano = Number(hoje.slice(0, 4));
  const feriados = new Set([...(await feriadosDoAno(ano - 1)), ...(await feriadosDoAno(ano))].map((f) => f.data));
  const comDiario = new Set(diarios.map((d) => d.data));
  // Últimos 7 dias (sem domingos e feriados nacionais) dentro do prazo da obra que ainda não têm diário.
  const faltando = Array.from({ length: 8 }, (_, i) => somarDias(hoje, -i - 1))
    .filter((d) => new Date(`${d}T00:00:00Z`).getUTCDay() !== 0)
    .filter((d) => !comDiario.has(d) && !feriados.has(d) && (!projeto.data_inicio || d >= projeto.data_inicio))
    .slice(0, 6);
  const rascunhos = diarios.filter((d) => d.status === 'rascunho' && d.data < hoje).length;

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-6">
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h2 className="text-xl font-semibold sm:text-2xl">Diário de obra</h2>
          <p className="mt-1 text-regua">Clima, equipe, serviços, ocorrências e fotos de cada dia, com assinatura do engenheiro.</p>
        </div>
        <Link
          href={`${base}/${hoje}`}
          className="inline-flex min-h-11 shrink-0 items-center justify-center rounded-medio bg-cianotipia px-4 font-semibold text-white hover:bg-cianotipia-escuro"
        >
          {comDiario.has(hoje) ? 'Abrir o diário de hoje' : podeApontar ? 'Preencher o diário de hoje' : 'Ver o dia de hoje'}
        </Link>
      </div>

      {(faltando.length > 0 || rascunhos > 0) && podeApontar && (
        <div className="rounded-medio border border-marcador/30 bg-marcador-claro px-4 py-3 text-sm text-marcador">
          {rascunhos > 0 && (
            <p className="font-semibold">
              {rascunhos} {rascunhos === 1 ? 'diário de dia anterior ainda está' : 'diários de dias anteriores ainda estão'} sem assinatura.
            </p>
          )}
          {faltando.length > 0 && (
            <p className="mt-1">
              Sem diário:{' '}
              {faltando.map((d, i) => (
                <span key={d}>
                  {i > 0 && ', '}
                  <Link href={`${base}/${d}`} className="font-semibold underline underline-offset-4">
                    {diaDaSemana(d)} {formatarData(d).slice(0, 5)}
                  </Link>
                </span>
              ))}
              .
            </p>
          )}
        </div>
      )}

      {diarios.length === 0 ? (
        <div className="rounded-medio border border-dashed border-campo/60 px-5 py-10 text-center">
          <p className="font-semibold">Nenhum diário ainda</p>
          <p className="mt-1 text-sm text-regua">O primeiro diário nasce quando alguém preenche o dia.</p>
        </div>
      ) : (
        <ul className="divide-y divide-linha rounded-medio border border-linha bg-papel">
          {diarios.map((d) => (
            <li key={d.id}>
              <Link href={`${base}/${d.data}`} className="flex min-h-14 items-center justify-between gap-3 px-4 py-3 hover:bg-concreto/60 sm:px-5">
                <span className="min-w-0">
                  <span className="numeros font-semibold">
                    <span className="capitalize">{diaDaSemana(d.data)}</span> {formatarData(d.data)}
                  </span>
                  <span className="numeros block text-sm text-regua">
                    {d.clima_manha ? `${ROTULO_CLIMA[d.clima_manha]} / ${d.clima_tarde ? ROTULO_CLIMA[d.clima_tarde] : '—'}` : 'Clima não informado'}
                    {` · ${d.pessoas} ${d.pessoas === 1 ? 'pessoa' : 'pessoas'}`}
                    {d.fotos > 0 && ` · ${d.fotos} ${d.fotos === 1 ? 'foto' : 'fotos'}`}
                  </span>
                </span>
                <span
                  className={`shrink-0 rounded-full px-2.5 py-0.5 text-xs font-semibold ${
                    d.status === 'assinado' ? 'bg-obra-ok/10 text-obra-ok' : 'bg-concreto text-regua'
                  }`}
                >
                  {d.status === 'assinado' ? 'Assinado' : 'Rascunho'}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
