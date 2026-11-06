'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { arquivoEditadoSchema, CATEGORIAS_ARQUIVO, LIMITE_ARQUIVO_BYTES, problemaDoArquivo } from '@obras/shared';
import { criarClienteServidor } from '@/lib/supabase/server';
import { mensagemDoBanco } from '@/lib/erros';

export type Resultado<T = undefined> = { ok: true; valor?: T } | { ok: false; erro: string };

const uuid = z.string().uuid();

const registroSchema = z.object({
  id: uuid,
  caminho: z.string().min(1).max(400),
  nome: z.string().trim().min(1).max(200),
  categoria: z.enum(CATEGORIAS_ARQUIVO),
  tamanho: z.number().int().positive().max(LIMITE_ARQUIVO_BYTES),
  tipoMime: z.string().max(120).nullable(),
  descricao: z.string().trim().max(500).nullable(),
  novaVersaoDe: uuid.nullable().optional(),
});

/** Registra o arquivo que o navegador acabou de enviar ao Storage (com novaVersaoDe, vira a próxima versão daquele). */
export async function registrarArquivo(projetoId: string, dados: z.input<typeof registroSchema>): Promise<Resultado> {
  const p = uuid.safeParse(projetoId);
  const d = registroSchema.safeParse(dados);
  if (!p.success || !d.success) return { ok: false, erro: 'Pedido inválido.' };
  const problema = problemaDoArquivo({ name: d.data.nome, size: d.data.tamanho });
  if (problema) return { ok: false, erro: problema };

  const supabase = await criarClienteServidor();
  const { error } = await supabase.rpc('registrar_arquivo_obra', {
    p_id: d.data.id,
    p_projeto_id: p.data,
    p_caminho: d.data.caminho,
    p_nome: d.data.nome,
    p_categoria: d.data.categoria,
    p_tamanho: d.data.tamanho,
    p_tipo_mime: d.data.tipoMime ?? undefined,
    p_descricao: d.data.descricao ?? undefined,
    p_nova_versao_de: d.data.novaVersaoDe ?? undefined,
  });
  if (error) {
    // Registro recusado: o arquivo enviado não pode ficar solto no Storage.
    await supabase.storage.from('arquivos').remove([d.data.caminho]);
    return { ok: false, erro: mensagemDoBanco(error) };
  }
  revalidatePath(`/projetos/${p.data}/arquivos`);
  return { ok: true };
}

export async function editarArquivo(
  projetoId: string,
  arquivoId: string,
  dados: { nome: string; categoria: string; descricao?: string },
): Promise<Resultado> {
  const ids = z.object({ p: uuid, a: uuid }).safeParse({ p: projetoId, a: arquivoId });
  const d = arquivoEditadoSchema.safeParse(dados);
  if (!ids.success) return { ok: false, erro: 'Pedido inválido.' };
  if (!d.success) return { ok: false, erro: d.error.issues[0]?.message ?? 'Confira os campos.' };

  const supabase = await criarClienteServidor();
  const { error } = await supabase.rpc('editar_arquivo_obra', {
    p_id: ids.data.a,
    p_nome: d.data.nome,
    p_categoria: d.data.categoria,
    p_descricao: d.data.descricao ?? undefined,
  });
  if (error) return { ok: false, erro: mensagemDoBanco(error) };
  revalidatePath(`/projetos/${ids.data.p}/arquivos`);
  return { ok: true };
}

export async function excluirArquivo(projetoId: string, arquivoId: string): Promise<Resultado> {
  const ids = z.object({ p: uuid, a: uuid }).safeParse({ p: projetoId, a: arquivoId });
  if (!ids.success) return { ok: false, erro: 'Pedido inválido.' };
  const supabase = await criarClienteServidor();
  const { data: caminho, error } = await supabase.rpc('excluir_arquivo_obra', { p_id: ids.data.a });
  if (error) return { ok: false, erro: mensagemDoBanco(error) };
  if (caminho) await supabase.storage.from('arquivos').remove([caminho]);
  revalidatePath(`/projetos/${ids.data.p}/arquivos`);
  return { ok: true };
}

/** Link de 5 minutos para abrir ou baixar (o RLS do Storage confere se a pessoa vê a obra). */
export async function linkDoArquivo(arquivoId: string, baixar: boolean): Promise<Resultado<string>> {
  const id = uuid.safeParse(arquivoId);
  if (!id.success) return { ok: false, erro: 'Pedido inválido.' };
  const supabase = await criarClienteServidor();
  const { data: arquivo } = await supabase.from('arquivo_obra').select('caminho, nome').eq('id', id.data).maybeSingle();
  if (!arquivo) return { ok: false, erro: 'Arquivo não encontrado.' };
  const { data, error } = await supabase.storage.from('arquivos').createSignedUrl(arquivo.caminho, 300, baixar ? { download: arquivo.nome } : undefined);
  if (error || !data) return { ok: false, erro: 'Não foi possível gerar o link. Tente de novo.' };
  return { ok: true, valor: data.signedUrl };
}
