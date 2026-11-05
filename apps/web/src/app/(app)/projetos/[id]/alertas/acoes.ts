'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { CAUSAS_ATRASO } from '@obras/shared';
import { criarClienteServidor } from '@/lib/supabase/server';
import { mensagemDoBanco } from '@/lib/erros';

export type EstadoJustificativa = { ok?: boolean; mensagem?: string; erros?: Record<string, string>; erroGeral?: string };

const esquema = z.object({
  projeto_id: z.string().uuid(),
  tarefa_id: z.string().uuid(),
  causa: z.enum(CAUSAS_ATRASO, { error: 'Escolha a causa' }),
  descricao: z.string().trim().min(3, 'Descreva o que aconteceu').max(1000, 'Use no máximo 1.000 caracteres'),
  dias_impacto: z
    .string()
    .optional()
    .transform((v, ctx) => {
      if (!v || !v.trim()) return null;
      const n = Number(v.trim());
      if (!Number.isInteger(n) || n < 0 || n > 365) {
        ctx.addIssue({ code: 'custom', message: 'Dias inteiros, de 0 a 365' });
        return z.NEVER;
      }
      return n;
    }),
});

export async function justificarAtraso(_: EstadoJustificativa, form: FormData): Promise<EstadoJustificativa> {
  const v = esquema.safeParse(Object.fromEntries([...form.entries()].map(([k, x]) => [k, String(x)])));
  if (!v.success) {
    const erros: Record<string, string> = {};
    for (const i of v.error.issues) erros[i.path.join('.')] ??= i.message;
    return { erros };
  }
  const supabase = await criarClienteServidor();
  const { error } = await supabase.rpc('justificar_atraso', {
    p_tarefa_id: v.data.tarefa_id,
    p_causa: v.data.causa,
    p_descricao: v.data.descricao,
    ...(v.data.dias_impacto !== null ? { p_dias_impacto: v.data.dias_impacto } : {}),
  });
  if (error) return { erroGeral: mensagemDoBanco(error) };
  revalidatePath(`/projetos/${v.data.projeto_id}`, 'layout');
  return { ok: true, mensagem: 'Justificativa registrada.' };
}
