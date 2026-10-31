'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { cameraSchema, errosPorCampo } from '@obras/shared';
import { criarClienteServidor } from '@/lib/supabase/server';
import { mensagemDoBanco } from '@/lib/erros';

export type EstadoForm = { ok?: boolean; mensagem?: string; erros?: Record<string, string>; erroGeral?: string; valores?: Record<string, string> };
export type Resultado<T = undefined> = { ok: true; mensagem?: string; valor?: T } | { ok: false; erro: string };

const uuid = z.string().uuid();

function revalidar(projetoId: string) {
  revalidatePath(`/projetos/${projetoId}`, 'layout');
}

/** Cadastra (sem camera_id) ou altera uma câmera. A senha vai para o Vault pelo banco. */
export async function salvarCamera(_: EstadoForm, form: FormData): Promise<EstadoForm> {
  const valores = Object.fromEntries([...form.entries()].filter(([k]) => k !== 'senha' && k !== 'horario').map(([k, v]) => [k, String(v)]));
  const projetoId = uuid.safeParse(valores.projeto_id);
  if (!projetoId.success) return { erroGeral: 'Obra inválida.', valores };
  const c = cameraSchema.safeParse({ ...valores, senha: String(form.get('senha') ?? ''), horarios: form.getAll('horario').map(String) });
  if (!c.success) return { erros: errosPorCampo(c.error), valores };

  const cameraId = valores.camera_id ? uuid.safeParse(valores.camera_id) : null;
  if (cameraId && !cameraId.success) return { erroGeral: 'Câmera inválida.', valores };

  const supabase = await criarClienteServidor();
  const { error } = await supabase.rpc('salvar_camera', {
    p_id: cameraId ? cameraId.data : (null as unknown as string),
    p_projeto_id: projetoId.data,
    p_campos: {
      nome: c.data.nome,
      origem: c.data.origem,
      agente_id: c.data.agente_id ?? '',
      endereco: c.data.endereco ?? '',
      usuario: c.data.usuario ?? '',
      horarios: c.data.horarios,
      ativa: c.data.ativa,
    },
    // vazio = manter a senha guardada; remover = apagar
    p_senha: c.data.remover_senha ? '' : c.data.senha !== '' ? c.data.senha : undefined,
  });
  if (error) return { erroGeral: mensagemDoBanco(error), valores };
  revalidar(projetoId.data);
  return { ok: true, mensagem: cameraId ? 'Câmera salva.' : `${c.data.nome} cadastrada.` };
}

/** Cria o agente e devolve o token (mostrado uma vez só). */
export async function criarAgente(projetoId: string, nome: string): Promise<Resultado<{ token: string }>> {
  if (!uuid.safeParse(projetoId).success) return { ok: false, erro: 'Obra inválida.' };
  const n = nome.trim();
  if (n.length < 2 || n.length > 80) return { ok: false, erro: 'Dê um nome ao agente (ex.: PC do escritório).' };
  const supabase = await criarClienteServidor();
  const { data, error } = await supabase.rpc('criar_agente_camera', { p_projeto_id: projetoId, p_nome: n });
  if (error) return { ok: false, erro: mensagemDoBanco(error) };
  revalidar(projetoId);
  return { ok: true, valor: { token: String((data as { token?: string } | null)?.token ?? '') } };
}

export async function revogarAgente(projetoId: string, agenteId: string): Promise<Resultado> {
  if (!uuid.safeParse(projetoId).success || !uuid.safeParse(agenteId).success) return { ok: false, erro: 'Pedido inválido.' };
  const supabase = await criarClienteServidor();
  const { error } = await supabase.rpc('revogar_agente_camera', { p_id: agenteId });
  if (error) return { ok: false, erro: mensagemDoBanco(error) };
  revalidar(projetoId);
  return { ok: true, mensagem: 'Agente desligado. O token dele não funciona mais.' };
}

export async function pedirTeste(projetoId: string, cameraId: string): Promise<Resultado> {
  if (!uuid.safeParse(projetoId).success || !uuid.safeParse(cameraId).success) return { ok: false, erro: 'Pedido inválido.' };
  const supabase = await criarClienteServidor();
  const { error } = await supabase.rpc('pedir_teste_camera', { p_id: cameraId });
  if (error) return { ok: false, erro: mensagemDoBanco(error) };
  revalidar(projetoId);
  return { ok: true, mensagem: 'Pedido enviado ao agente. A foto chega em até 1 minuto.' };
}

/** Situação do teste (a tela pergunta de tempos em tempos enquanto espera). */
export async function situacaoTeste(cameraId: string): Promise<{ respondido: boolean; url: string | null; erro: string | null }> {
  if (!uuid.safeParse(cameraId).success) return { respondido: false, url: null, erro: 'Câmera inválida.' };
  const supabase = await criarClienteServidor();
  const { data } = await supabase
    .from('camera')
    .select('teste_respondido_em, teste_caminho, teste_erro')
    .eq('id', cameraId)
    .maybeSingle();
  if (!data?.teste_respondido_em) return { respondido: false, url: null, erro: null };
  let url: string | null = null;
  if (data.teste_caminho) {
    const s = await supabase.storage.from('cameras').createSignedUrl(data.teste_caminho, 600);
    url = s.data?.signedUrl ? `${s.data.signedUrl}&v=${encodeURIComponent(data.teste_respondido_em)}` : null;
  }
  return { respondido: true, url, erro: data.teste_erro };
}

/** Foto que o celular acabou de subir no Storage. */
export async function registrarFotoManual(
  projetoId: string,
  foto: { id: string; cameraId: string; caminho: string; capturadaEm: string; tamanho: number },
): Promise<Resultado> {
  if (!uuid.safeParse(projetoId).success || !uuid.safeParse(foto.id).success || !uuid.safeParse(foto.cameraId).success) {
    return { ok: false, erro: 'Pedido inválido.' };
  }
  const supabase = await criarClienteServidor();
  const { error } = await supabase.rpc('registrar_foto_camera', {
    p_id: foto.id,
    p_camera_id: foto.cameraId,
    p_caminho: foto.caminho,
    p_capturada_em: foto.capturadaEm,
    p_tamanho: foto.tamanho,
  });
  if (error) {
    await supabase.storage.from('cameras').remove([foto.caminho]);
    return { ok: false, erro: mensagemDoBanco(error) };
  }
  revalidar(projetoId);
  return { ok: true, mensagem: 'Foto enviada.' };
}

/** Tira a foto da galeria e apaga o arquivo. */
export async function excluirFoto(projetoId: string, fotoId: string): Promise<Resultado> {
  if (!uuid.safeParse(projetoId).success || !uuid.safeParse(fotoId).success) return { ok: false, erro: 'Pedido inválido.' };
  const supabase = await criarClienteServidor();
  const { data: caminho, error } = await supabase.rpc('excluir_foto_camera', { p_id: fotoId });
  if (error) return { ok: false, erro: mensagemDoBanco(error) };
  if (caminho) await supabase.storage.from('cameras').remove([caminho]);
  revalidar(projetoId);
  return { ok: true, mensagem: 'Foto tirada da galeria.' };
}
