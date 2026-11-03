import { ROTULO_SITUACAO_PAGAMENTO, type ContratoMedicao, type SituacaoPagamento } from '@obras/shared';

export const fmtQtd = (n: number) => n.toLocaleString('pt-BR', { maximumFractionDigits: 4 });

const COR_SITUACAO: Record<SituacaoPagamento, string> = {
  rascunho: 'bg-concreto text-regua',
  a_vencer: 'bg-cianotipia-claro text-cianotipia',
  vencida: 'bg-marcador-claro text-marcador',
  paga: 'bg-obra-ok/10 text-obra-ok',
};

export function SeloSituacao({ situacao, parte }: { situacao: SituacaoPagamento; parte: ContratoMedicao['parte'] }) {
  const rotulo =
    parte === 'cliente' && situacao === 'paga'
      ? 'Recebida'
      : parte === 'cliente' && situacao === 'a_vencer'
        ? 'Liberada para receber'
        : ROTULO_SITUACAO_PAGAMENTO[situacao];
  return <span className={`inline-flex rounded-full px-2.5 py-0.5 text-xs font-semibold whitespace-nowrap ${COR_SITUACAO[situacao]}`}>{rotulo}</span>;
}

