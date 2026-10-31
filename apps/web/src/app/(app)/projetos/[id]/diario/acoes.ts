'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { dataIsoValida, diarioSchema, efetivoSchema, errosPorCampo } from '@obras/shared';
import { criarClienteServidor } from '@/lib/supabase/server';
import { mensagemDoBanco } from '@/lib/erros';

export type Resultado<T = undefined> = { ok: true; mensagem?: string; valor?: T } | { ok: false; erro: string };

export type EstadoDiario = { ok?: boolean; mensagem?: string; erros?: Record<string, string>; erroGeral?: string };

const uuid = z.string().uuid();
const data = z.string().refine(dataIsoValida, 'Data inválida');

function revalidar(projetoId: string) {
  revalidatePath(`/projetos/${projetoId}`, 'layout');
}

/** Clima, ocorrências e observações do dia. Cria o diário se ainda não existe. */
export async function salvarDiario(_: EstadoDiario, form: FormData): Promise<EstadoDiario> {
  const valores = Object.fromEntries([...form.entries()].map(([k, v]) => [k, String(v)]));
  const ids = z.object({ projeto_id: uuid, data }).safeParse(valores);
  if (!ids.success) return { erroGeral: 'Obra ou data inválida.' };

  const d = diarioSchema.safeParse(valores);
  if (!d.success) return { erros: errosPorCampo(d.error) };

  const supabase = await criarClienteServidor();
  const { error } = await supabase.rpc('salvar_diario', {
    p_projeto_id: ids.data.projeto_id,
    p_data: ids.data.data,
    p_campos: d.data,
  });
  if (error) return { erroGeral: mensagemDoBanco(error) };
  revalidar(ids.data.projeto_id);
  return { ok: true, mensagem: 'Diário salvo.' };
}

/** Garante que o diário do dia existe (antes de enviar fotos) e devolve o id. */
export async function garantirDiario(projetoId: string, dia: string): Promise<Resultado<string>> {
  if (!uuid.safeParse(projetoId).success || !data.safeParse(dia).success) return { ok: false, erro: 'Pedido inválido.' };
  const supabase = await criarClienteServidor();
  const { data: id, error } = await supabase.rpc('salvar_diario', { p_projeto_id: projetoId, p_data: dia });
  if (error) return { ok: false, erro: mensagemDoBanco(error) };
  return { ok: true, valor: id };
}

export async function salvarEfetivo(projetoId: string, dia: string, linhas: unknown): Promise<Resultado<number>> {
  if (!uuid.safeParse(projetoId).success || !data.safeParse(dia).success) return { ok: false, erro: 'Pedido inválido.' };
  const l = efetivoSchema.safeParse(linhas);
  if (!l.success) return { ok: false, erro: l.error.issues[0]?.message ?? 'Equipe inválida.' };

  const supabase = await criarClienteServidor();
  const garantido = await supabase.rpc('salvar_diario', { p_projeto_id: projetoId, p_data: dia });
  if (garantido.error) return { ok: false, erro: mensagemDoBanco(garantido.error) };
  const { data: total, error } = await supabase.rpc('definir_efetivo', { p_diario_id: garantido.data, p_linhas: l.data });
  if (error) return { ok: false, erro: mensagemDoBanco(error) };
  revalidar(projetoId);
  return { ok: true, valor: total, mensagem: `Equipe salva: ${total} ${total === 1 ? 'pessoa' : 'pessoas'}.` };
}

/** Registra a foto que o navegador já enviou ao Storage. */
export async function registrarFoto(
  projetoId: string,
  diarioId: string,
  foto: { id: string; caminho: string; legenda?: string | null; tarefaId?: string | null },
): Promise<Resultado> {
  const ok = z
    .object({
      projetoId: uuid,
      diarioId: uuid,
      id: uuid,
      caminho: z.string().max(300),
      legenda: z.string().max(300).nullish(),
      tarefaId: uuid.nullish(),
    })
    .safeParse({ projetoId, diarioId, ...foto });
  if (!ok.success) return { ok: false, erro: 'Foto inválida.' };

  const supabase = await criarClienteServidor();
  const { error } = await supabase.rpc('registrar_foto_diario', {
    p_id: foto.id,
    p_diario_id: diarioId,
    p_caminho: foto.caminho,
    p_legenda: foto.legenda ?? undefined,
    p_tarefa_id: foto.tarefaId ?? undefined,
  });
  if (error) return { ok: false, erro: mensagemDoBanco(error) };
  revalidar(projetoId);
  return { ok: true };
}

export async function excluirFoto(projetoId: string, fotoId: string): Promise<Resultado> {
  if (!uuid.safeParse(projetoId).success || !uuid.safeParse(fotoId).success) return { ok: false, erro: 'Pedido inválido.' };
  const supabase = await criarClienteServidor();
  const { data: caminho, error } = await supabase.rpc('excluir_foto_diario', { p_id: fotoId });
  if (error) return { ok: false, erro: mensagemDoBanco(error) };
  // O registro já saiu; se apagar o arquivo falhar, ele fica órfão no bucket (sem link no app).
  if (caminho) await supabase.storage.from('diario').remove([caminho]);
  revalidar(projetoId);
  return { ok: true, mensagem: 'Foto removida.' };
}

export async function assinarDiario(projetoId: string, diarioId: string): Promise<Resultado<string>> {
  if (!uuid.safeParse(projetoId).success || !uuid.safeParse(diarioId).success) return { ok: false, erro: 'Pedido inválido.' };
  const supabase = await criarClienteServidor();
  const { data: hash, error } = await supabase.rpc('assinar_diario', { p_diario_id: diarioId });
  if (error) return { ok: false, erro: mensagemDoBanco(error) };
  revalidar(projetoId);
  return { ok: true, valor: hash, mensagem: 'Diário assinado.' };
}

/** Localização da obra para o clima automático (só quem edita o projeto; o RLS barra os outros). */
export async function definirLocalizacao(projetoId: string, latitude: number, longitude: number): Promise<Resultado> {
  const ok = z
    .object({ projetoId: uuid, latitude: z.number().min(-90).max(90), longitude: z.number().min(-180).max(180) })
    .safeParse({ projetoId, latitude, longitude });
  if (!ok.success) return { ok: false, erro: 'Localização inválida.' };

  const supabase = await criarClienteServidor();
  const { data: linhas, error } = await supabase
    .from('projeto')
    .update({ latitude: Math.round(latitude * 1e6) / 1e6, longitude: Math.round(longitude * 1e6) / 1e6 })
    .eq('id', projetoId)
    .select('id');
  if (error) return { ok: false, erro: mensagemDoBanco(error) };
  if (!linhas || linhas.length === 0) return { ok: false, erro: 'Só o engenheiro da obra define a localização.' };
  revalidar(projetoId);
  return { ok: true, mensagem: 'Localização salva. O clima passa a vir sozinho.' };
}
