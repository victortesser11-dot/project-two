import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import { agruparVersoes, CAMPOS_FICHA, conferirSugestoes, leituraArquivosSchema, mimeParaIa } from '@obras/shared';
import { buscarEap, buscarProjeto, leiturasIaHoje, listarAnalisesIa, listarArquivos, podeApontarCampo, podeEditarProjeto } from '@/lib/dados';
import { iaConfigurada, iaLePdf, limiteDiarioIa } from '@/lib/ia';
import { Arquivos } from './Arquivos';
import { LeituraIa, type LeituraAnterior } from './LeituraIa';

export const metadata: Metadata = { title: 'Arquivos' };
// A leitura com IA de várias pranchas pode levar mais de um minuto.
export const maxDuration = 300;

export default async function PaginaArquivos({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const dados = await buscarProjeto(id);
  if (!dados) notFound();
  const { projeto, papel } = dados;
  const [arquivos, podeEditar, podeEnviar] = await Promise.all([
    listarArquivos(projeto.id),
    podeEditarProjeto(projeto, papel),
    podeApontarCampo(projeto, papel),
  ]);

  // Leitura com IA: quem edita a obra, com a chave cadastrada.
  const comIa = podeEditar && iaConfigurada();
  let ia: { legiveis: typeof arquivos; ilegiveis: number; anteriores: LeituraAnterior[]; restantesHoje: number } | null = null;
  if (comIa) {
    const vigentes = agruparVersoes(arquivos).map((d) => d.atual);
    const lePdf = iaLePdf();
    const legiveis = vigentes.filter((a) => {
      const mime = mimeParaIa(a.nome);
      return mime !== null && (lePdf || mime !== 'application/pdf');
    });
    const [analises, usadas] = await Promise.all([listarAnalisesIa(projeto.id, 'arquivos'), leiturasIaHoje(projeto.id)]);
    const eap = analises.length > 0 ? await buscarEap(projeto.id) : [];
    const anteriores = analises.flatMap((a) => {
      const leitura = leituraArquivosSchema.safeParse(a.resultado);
      if (!leitura.success) return [];
      return [{ id: a.id, modelo: a.modelo, criado_em: a.criado_em, arquivos: a.arquivos, leitura: leitura.data, sugestoes: conferirSugestoes(leitura.data.tarefas, eap) }];
    });
    ia = { legiveis, ilegiveis: vigentes.length - legiveis.length, anteriores, restantesHoje: Math.max(0, limiteDiarioIa() - usadas) };
  }

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h2 className="text-xl font-semibold sm:text-2xl">Arquivos da obra</h2>
        <p className="mt-1 max-w-3xl text-regua">
          Projetos (DWG, PDF, IFC), alvará, ART, contratos e orçamentos num lugar só. Todo mundo da obra abre e baixa; engenheiro e mestre enviam.
          Revisão nova entra como nova versão e a anterior fica guardada.
        </p>
      </div>
      {/* Arquivo novo enviado: a chave muda e a lista volta com os ainda não lidos já marcados. */}
      {ia && arquivos.length > 0 && (
        <LeituraIa
          key={ia.legiveis.map((a) => a.id).join()}
          projetoId={projeto.id}
          {...ia}
          fichaAtual={{
            endereco: projeto.endereco,
            cep: projeto.cep ?? null,
            ...Object.fromEntries(CAMPOS_FICHA.map((c) => [c.campo, projeto[c.campo] ?? null])),
          }}
        />
      )}
      <Arquivos projetoId={projeto.id} arquivos={arquivos} podeEditar={podeEditar} podeEnviar={podeEnviar} />
    </div>
  );
}
