import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { executadoAte, hojeIso, situacaoPagamento } from '@obras/shared';
import {
  buscarApontamentos,
  buscarEap,
  buscarProjeto,
  listarContratosMedicao,
  listarItensContrato,
  listarItensMedidos,
  listarMedicoes,
  podeEditarProjeto,
  podeFinanceiro,
} from '@/lib/dados';
import { Boletim, type LinhaBoletim } from './Boletim';

export const metadata: Metadata = { title: 'Boletim de medição' };

const q4 = (v: number) => Math.round(v * 10000) / 10000;

export default async function PaginaBoletim({ params }: { params: Promise<{ id: string; medicaoId: string }> }) {
  const { id, medicaoId } = await params;
  const dados = await buscarProjeto(id);
  if (!dados) notFound();
  const { projeto, papel } = dados;
  const voltar = (
    <Link href={`/projetos/${id}/orcamento/medicoes`} className="text-sm font-medium text-cianotipia hover:underline underline-offset-4 print:hidden">
      Voltar para as medições
    </Link>
  );
  if (!(await podeFinanceiro(projeto, papel))) {
    return (
      <div className="flex flex-col gap-4">
        {voltar}
        <p className="rounded-medio border border-linha bg-papel p-4 text-regua">Só o engenheiro, o financeiro e o admin veem as medições.</p>
      </div>
    );
  }

  const [eap, contratos, itens, medicoes, medidos, apontamentos, podeAprovar] = await Promise.all([
    buscarEap(id),
    listarContratosMedicao(id),
    listarItensContrato(id),
    listarMedicoes(id),
    listarItensMedidos(id),
    buscarApontamentos(id),
    podeEditarProjeto(projeto, papel),
  ]);
  const m = medicoes.find((x) => x.id === medicaoId);
  if (!m) notFound();
  const contrato = contratos.find((c) => c.id === m.contrato_id)!;
  const porId = new Map(eap.map((i) => [i.id, i]));
  const anteriores = new Set(medicoes.filter((x) => x.contrato_id === contrato.id && x.status !== 'rascunho' && x.numero < m.numero).map((x) => x.id));
  const antes = new Map<string, number>();
  const nesta = new Map<string, { quantidade: number; executado: number }>();
  for (const mi of medidos) {
    if (anteriores.has(mi.medicao_id)) antes.set(mi.contrato_item_id, q4((antes.get(mi.contrato_item_id) ?? 0) + mi.quantidade));
    if (mi.medicao_id === m.id) nesta.set(mi.contrato_item_id, { quantidade: mi.quantidade, executado: mi.executado_acumulado });
  }
  const executado = executadoAte(apontamentos, m.fim);
  const linhas: LinhaBoletim[] = itens
    .filter((i) => i.contrato_id === contrato.id)
    .sort((a, b) => (porId.get(a.tarefa_id)?.posicao ?? 0) - (porId.get(b.tarefa_id)?.posicao ?? 0))
    .map((i) => {
      const t = porId.get(i.tarefa_id);
      const atual = nesta.get(i.id);
      return {
        itemId: i.id,
        codigo: t?.codigo ?? '',
        tarefa: t?.nome ?? 'Tarefa removida',
        unidade: i.unidade,
        contratado: i.quantidade,
        precoUnitario: i.preco_unitario,
        antes: antes.get(i.id) ?? 0,
        // Na medição aprovada vale a evidência congelada; no rascunho, o avanço apontado até o fim do período.
        executado: atual && m.status !== 'rascunho' ? atual.executado : q4((executado.get(i.tarefa_id) ?? 0) * i.quantidade),
        atual: atual?.quantidade ?? 0,
      };
    });

  return (
    <div className="flex flex-col gap-6">
      {voltar}
      <Boletim
        projetoId={id}
        obra={projeto.nome}
        medicao={m}
        contrato={{ nome: contrato.nome, parte: contrato.parte, retencao_pct: contrato.retencao_pct }}
        linhas={linhas}
        situacao={situacaoPagamento(m, hojeIso())}
        podeAprovar={podeAprovar}
        hoje={hojeIso()}
      />
    </div>
  );
}
