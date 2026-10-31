import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { dataIsoValida, efetivoDaChamada, formatarDataLonga, hojeIso, somarDias } from '@obras/shared';
import {
  buscarChamada,
  buscarDiario,
  buscarEap,
  buscarProjeto,
  listarEmpreiteiras,
  listarEquipeProjeto,
  podeApontarCampo,
  podeEditarProjeto,
} from '@/lib/dados';
import { buscarClimaDoDia } from '@/lib/clima';
import { DocumentoDiario } from '../DocumentoDiario';
import { FormularioDiario } from '../FormularioDiario';
import { EditorEfetivo } from '../EditorEfetivo';
import { FotosDiario } from '../FotosDiario';
import { BotaoAssinar, BotaoLocalizacao, FormularioCep } from '../AcoesDiario';
import { conteudoParaExibir, urlsDasFotos } from '../conteudo';

export const metadata: Metadata = { title: 'Diário do dia' };

const quantidadeBr = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 2 });

export default async function PaginaDiarioDoDia({ params }: { params: Promise<{ id: string; data: string }> }) {
  const { id, data } = await params;
  if (!dataIsoValida(data)) notFound();
  const dados = await buscarProjeto(id);
  if (!dados) notFound();
  const { projeto, papel } = dados;

  const hoje = hojeIso();
  const base = `/projetos/${id}/diario`;
  const futuro = data > hoje;

  const [dia, podeApontar, podeEditar, itens] = await Promise.all([
    buscarDiario(id, data),
    podeApontarCampo(projeto, papel),
    podeEditarProjeto(projeto, papel),
    buscarEap(id),
  ]);
  const { diario, efetivo, fotos, avancos } = dia;
  const assinado = diario?.status === 'assinado';
  const editavel = podeApontar && !assinado && !futuro;
  const temCoordenadas = projeto.latitude != null && projeto.longitude != null;
  const sugestao =
    editavel && !diario?.clima_manha && temCoordenadas ? await buscarClimaDoDia(Number(projeto.latitude), Number(projeto.longitude), data) : null;
  const tarefas = itens.filter((i) => i.tipo === 'tarefa').map((t) => ({ id: t.id, codigo: t.codigo, nome: t.nome }));

  // Equipe do diário a partir da chamada do dia (RF-302 → RF-203).
  let daChamada: { funcao: string; empresa_terceira: string | null; quantidade: number }[] = [];
  if (editavel) {
    const [chamada, equipe, empreiteiras] = await Promise.all([buscarChamada(id, data), listarEquipeProjeto(id), listarEmpreiteiras(projeto.empresa_id)]);
    const presentes = new Set(chamada.doDia.filter((a) => a.presente).map((a) => a.trabalhador_id));
    const nomeEmp = new Map(empreiteiras.map((e) => [e.id, e.nome]));
    daChamada = efetivoDaChamada(
      equipe.filter((p) => presentes.has(p.id)).map((p) => ({ funcao: p.funcao, empreiteira: p.empreiteira_id ? (nomeEmp.get(p.empreiteira_id) ?? null) : null })),
    );
  }

  return (
    <div className="mx-auto flex max-w-3xl flex-col gap-6">
      <nav aria-label="Dias" className="flex items-center justify-between gap-2 text-sm font-semibold">
        <Link href={`${base}/${somarDias(data, -1)}`} className="flex min-h-11 items-center text-cianotipia hover:underline underline-offset-4">
          ← Dia anterior
        </Link>
        <Link href={base} className="flex min-h-11 items-center text-regua hover:text-grafite">
          Todos os diários
        </Link>
        {data < hoje ? (
          <Link href={`${base}/${somarDias(data, 1)}`} className="flex min-h-11 items-center text-cianotipia hover:underline underline-offset-4">
            Próximo dia →
          </Link>
        ) : (
          <span className="w-24" />
        )}
      </nav>

      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="text-xl font-semibold capitalize sm:text-2xl">{formatarDataLonga(data)}</h2>
          <p className="mt-1 text-sm">
            {assinado ? (
              <span className="rounded-full bg-obra-ok/10 px-2.5 py-0.5 font-semibold text-obra-ok">Assinado</span>
            ) : diario ? (
              <span className="rounded-full bg-concreto px-2.5 py-0.5 font-semibold text-regua">Rascunho</span>
            ) : (
              <span className="text-regua">Ainda não preenchido</span>
            )}
          </p>
        </div>
        {diario && (
          <Link href={`${base}/${data}/imprimir`} className="inline-flex min-h-11 items-center text-sm font-semibold text-cianotipia hover:underline underline-offset-4">
            Imprimir ou salvar em PDF
          </Link>
        )}
      </div>

      {futuro ? (
        <p className="rounded-medio bg-concreto px-4 py-3 text-sm text-regua">Este dia ainda não chegou.</p>
      ) : !editavel ? (
        diario ? (
          <div className="rounded-medio border border-linha bg-papel p-4 sm:p-6">
            <DocumentoDiario
              conteudo={conteudoParaExibir(projeto, data, diario, efetivo, fotos, avancos)}
              assinatura={assinado && diario.assinado_em && diario.hash_conteudo ? { nome: diario.assinado_nome, em: diario.assinado_em, hash: diario.hash_conteudo } : null}
              urls={urlsDasFotos(fotos)}
            />
          </div>
        ) : (
          <p className="rounded-medio bg-concreto px-4 py-3 text-sm text-regua">Ninguém preencheu o diário deste dia.</p>
        )
      ) : (
        <>
          {!temCoordenadas && (
            <section className="flex flex-col gap-3 rounded-medio border border-cianotipia/30 bg-cianotipia-claro p-4 text-sm sm:p-5">
              <p className="text-cianotipia">
                <strong className="font-semibold">Clima automático.</strong>{' '}
                {podeEditar
                  ? 'Grave a localização da obra (pelo aparelho, na obra, ou pelo CEP): daí em diante o clima de cada dia vem preenchido.'
                  : 'Peça ao engenheiro para gravar a localização da obra: o clima passa a vir preenchido.'}
              </p>
              {podeEditar && (
                <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:gap-6">
                  <BotaoLocalizacao projetoId={id} />
                  <FormularioCep projetoId={id} />
                </div>
              )}
            </section>
          )}

          <FormularioDiario projetoId={id} data={data} diario={diario} sugestao={sugestao} />
          <EditorEfetivo projetoId={id} data={data} inicial={efetivo} daChamada={daChamada} />

          <section aria-labelledby="titulo-servicos" className="flex flex-col gap-3 rounded-medio border border-linha bg-papel p-4 sm:p-5">
            <div className="flex items-baseline justify-between gap-3">
              <h3 id="titulo-servicos" className="text-base font-semibold">
                Serviços do dia
              </h3>
              <Link href={`/projetos/${id}/hoje`} className="text-sm font-semibold text-cianotipia hover:underline underline-offset-4">
                Apontar avanço
              </Link>
            </div>
            {avancos.length === 0 ? (
              <p className="text-sm text-regua">Nenhum avanço apontado neste dia. Os apontamentos de &quot;Hoje&quot; aparecem aqui sozinhos.</p>
            ) : (
              <ul className="numeros flex flex-col gap-1 text-sm">
                {avancos.map((a, i) => (
                  <li key={i}>
                    <span className="font-medium">{a.tarefa}</span>
                    {' — '}
                    {a.quantidade !== null ? `${quantidadeBr.format(a.quantidade)} ${a.unidade ?? ''} (${Math.round(a.percentual)}%)` : `${Math.round(a.percentual)}%`}
                    {a.observacao && <span className="text-regua"> · {a.observacao}</span>}
                  </li>
                ))}
              </ul>
            )}
          </section>

          <FotosDiario projetoId={id} data={data} diarioId={diario?.id ?? null} fotos={fotos} tarefas={tarefas} podeEnviar />

          <section aria-labelledby="titulo-assinatura" className="flex flex-col gap-3 rounded-medio border border-linha bg-papel p-4 sm:p-5">
            <h3 id="titulo-assinatura" className="text-base font-semibold">
              Assinatura
            </h3>
            {podeEditar && diario ? (
              <BotaoAssinar projetoId={id} diarioId={diario.id} prontoParaAssinar={Boolean(diario.clima_manha && diario.clima_tarde)} />
            ) : (
              <p className="text-sm text-regua">
                {diario ? 'O engenheiro da obra confere e assina o diário.' : 'Salve o diário para o engenheiro poder assinar.'}
              </p>
            )}
          </section>
        </>
      )}
    </div>
  );
}
