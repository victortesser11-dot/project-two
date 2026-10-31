'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { apontamentoSchema, type ApontamentoEntrada } from '@obras/shared';
import { criarClienteServidor } from '@/lib/supabase/server';
import { mensagemDoBanco } from '@/lib/erros';

export type ResultadoApontamento = { id: string; ok: true; percentual: number } | { id: string; ok: false; erro: string; definitivo: boolean };

/**
 * Envia a fila de apontamentos do celular. Cada um é independente: um erro
 * não derruba os outros, e reenviar um que já entrou não duplica (o banco
 * reconhece o id).
 */
export async function sincronizarApontamentos(projetoId: string, lote: ApontamentoEntrada[]): Promise<ResultadoApontamento[]> {
  if (!z.string().uuid().safeParse(projetoId).success || !Array.isArray(lote) || lote.length > 200) {
    return [];
  }
  const supabase = await criarClienteServidor();
  const resultados: ResultadoApontamento[] = [];

  for (const bruto of lote) {
    const id = typeof bruto?.id === 'string' ? bruto.id : '';
    const a = apontamentoSchema.safeParse(bruto);
    if (!a.success) {
      resultados.push({ id, ok: false, erro: a.error.issues[0]?.message ?? 'Apontamento inválido.', definitivo: true });
      continue;
    }
    const { data, error } = await supabase.rpc('registrar_avanco', {
      p_id: a.data.id,
      p_tarefa_id: a.data.tarefa_id,
      p_data: a.data.data,
      p_percentual: a.data.percentual ?? undefined,
      p_quantidade: a.data.quantidade ?? undefined,
      p_observacao: a.data.observacao ?? undefined,
    });
    if (error) {
      // Falha de rede volta para a fila; recusa do banco não adianta reenviar.
      const rede = /fetch failed|network|timeout/i.test(error.message);
      resultados.push({ id, ok: false, erro: mensagemDoBanco(error), definitivo: !rede });
    } else {
      resultados.push({ id, ok: true, percentual: Number(data) });
    }
  }

  if (resultados.some((r) => r.ok)) revalidatePath(`/projetos/${projetoId}`, 'layout');
  return resultados;
}
