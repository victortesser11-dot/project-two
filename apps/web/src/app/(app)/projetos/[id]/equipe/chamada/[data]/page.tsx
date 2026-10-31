import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { dataIsoValida, formatarData, formatarDataLonga, hojeIso, somarDias } from '@obras/shared';
import { buscarChamada, buscarEap, buscarProjeto, listarEmpreiteiras, listarEquipeProjeto, podeApontarCampo } from '@/lib/dados';
import { feriadoNoDia } from '@/lib/brasilapi';
import { ChamadaDia } from '../../ChamadaDia';

export const metadata: Metadata = { title: 'Chamada' };

export default async function PaginaChamada({ params }: { params: Promise<{ id: string; data: string }> }) {
  const { id, data } = await params;
  if (!dataIsoValida(data)) notFound();
  const dados = await buscarProjeto(id);
  if (!dados) notFound();
  const { projeto, papel } = dados;
  const hoje = hojeIso();
  const base = `/projetos/${id}/equipe`;

  const [equipe, itens, empreiteiras, chamada, podeApontar, feriado] = await Promise.all([
    listarEquipeProjeto(id),
    buscarEap(id),
    listarEmpreiteiras(projeto.empresa_id),
    buscarChamada(id, data),
    podeApontarCampo(projeto, papel),
    feriadoNoDia(data),
  ]);
  const naChamada = equipe.filter((p) => p.na_obra || chamada.doDia.some((a) => a.trabalhador_id === p.id));
  const tarefas = itens.filter((i) => i.tipo === 'tarefa').map((t) => ({ id: t.id, codigo: t.codigo, nome: t.nome, unidade: t.unidade }));
  const domingo = new Date(`${data}T00:00:00Z`).getUTCDay() === 0;

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-5">
      <nav aria-label="Dias" className="flex items-center justify-between gap-2 text-sm font-semibold">
        <Link href={`${base}/chamada/${somarDias(data, -1)}`} className="flex min-h-11 items-center text-cianotipia hover:underline underline-offset-4">
          ← Dia anterior
        </Link>
        <Link href={base} className="flex min-h-11 items-center text-regua hover:text-grafite">
          Equipe
        </Link>
        {data < hoje ? (
          <Link href={`${base}/chamada/${somarDias(data, 1)}`} className="flex min-h-11 items-center text-cianotipia hover:underline underline-offset-4">
            Próximo dia →
          </Link>
        ) : (
          <span className="w-24" />
        )}
      </nav>
      <div>
        <h2 className="text-xl font-semibold capitalize sm:text-2xl">Chamada de {formatarDataLonga(data)}</h2>
        {chamada.doDia.length > 0 && <p className="mt-1 text-sm text-obra-ok">Chamada já registrada neste dia. Salvar de novo substitui.</p>}
      </div>
      {(feriado || domingo) && (
        <p className="rounded-medio bg-marcador-claro px-4 py-3 text-sm text-marcador">
          <strong className="font-semibold">{feriado ? `Feriado nacional: ${feriado.nome}.` : 'Domingo.'}</strong> Confira se houve trabalho antes de lançar.
        </p>
      )}
      {data > hoje ? (
        <p className="rounded-medio bg-concreto px-4 py-3 text-sm text-regua">Este dia ainda não chegou.</p>
      ) : !podeApontar ? (
        <p className="rounded-medio bg-concreto px-4 py-3 text-sm text-regua">
          {chamada.doDia.length > 0
            ? `${chamada.doDia.filter((a) => a.presente).length} apontamentos de presença em ${formatarData(data)}.`
            : 'Sem chamada neste dia.'}{' '}
          Quem faz a chamada é o mestre ou o engenheiro.
        </p>
      ) : (
        <ChamadaDia
          projetoId={id}
          data={data}
          pessoas={naChamada}
          tarefas={tarefas}
          empreiteiras={Object.fromEntries(empreiteiras.map((e) => [e.id, e.nome]))}
          doDia={chamada.doDia}
          anterior={chamada.anterior}
          dataAnterior={chamada.dataAnterior}
        />
      )}
    </div>
  );
}
