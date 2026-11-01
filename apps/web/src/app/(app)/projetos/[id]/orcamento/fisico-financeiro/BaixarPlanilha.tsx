'use client';

import { useState } from 'react';
import { rotuloMes, type LinhaTabelaFF } from '@obras/shared';
import { Botao } from '@/components/ui';

/** Exporta o físico-financeiro em XLSX, gerado no aparelho. */
export function BaixarPlanilha({
  obra,
  referencia,
  meses,
  linhas,
  porMes,
  acumulado,
}: {
  obra: string;
  referencia: string;
  meses: string[];
  linhas: LinhaTabelaFF[];
  porMes: number[];
  acumulado: number[];
}) {
  const [gerando, setGerando] = useState(false);

  async function baixar() {
    setGerando(true);
    try {
      const { default: escrever } = await import('write-excel-file/browser');
      const moeda = '#,##0.00';
      const total = acumulado.at(-1) ?? 0;
      const cabecalho = ['Código', 'Item', ...meses.map(rotuloMes), 'Total'].map((value) => ({ value, fontWeight: 'bold' as const }));
      const dados = linhas.map((l) => [
        { value: l.codigo },
        { value: `${'  '.repeat(Math.max(0, l.nivel - 1))}${l.nome}`, fontWeight: l.tipo === 'etapa' ? ('bold' as const) : undefined },
        ...l.valores.map((v) => ({ value: v, type: Number, format: moeda })),
        { value: l.total, type: Number, format: moeda, fontWeight: 'bold' as const },
      ]);
      const rodape = [
        [{ value: '' }, { value: 'Total do mês', fontWeight: 'bold' as const }, ...porMes.map((v) => ({ value: v, type: Number, format: moeda, fontWeight: 'bold' as const })), { value: total, type: Number, format: moeda, fontWeight: 'bold' as const }],
        [{ value: '' }, { value: 'Acumulado' }, ...acumulado.map((v) => ({ value: v, type: Number, format: moeda })), { value: '' }],
        [{ value: '' }, { value: '% acumulado' }, ...acumulado.map((v) => ({ value: total > 0 ? v / total : 0, type: Number, format: '0.0%' })), { value: '' }],
      ];
      await escrever([cabecalho, ...dados, ...rodape] as never, {
        sheet: 'Físico-financeiro',
        columns: [{ width: 10 }, { width: 48 }, ...meses.map(() => ({ width: 14 })), { width: 16 }],
      }).toFile(`fisico-financeiro-${obra.toLowerCase().replace(/[^a-z0-9]+/gi, '-')}-${referencia}.xlsx`);
    } finally {
      setGerando(false);
    }
  }

  return (
    <Botao type="button" variante="secundario" onClick={baixar} disabled={gerando}>
      {gerando ? 'Gerando…' : 'Baixar planilha (XLSX)'}
    </Botao>
  );
}
