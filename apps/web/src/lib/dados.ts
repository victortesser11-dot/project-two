import 'server-only';
import { cache } from 'react';
import { redirect } from 'next/navigation';
import type { Projeto } from '@obras/shared';
import { criarClienteServidor } from '@/lib/supabase/server';

/** Usuário logado; sem sessão, manda para o login. */
export const exigirUsuario = cache(async () => {
  const supabase = await criarClienteServidor();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) redirect('/login');
  return { supabase, usuario: user };
});

/**
 * Empresa em uso. Por enquanto, a primeira em que a pessoa entrou;
 * a troca entre empresas chega quando alguém tiver mais de uma.
 */
export const empresaAtual = cache(async () => {
  const { supabase, usuario } = await exigirUsuario();
  const { data, error } = await supabase
    .from('membro_empresa')
    .select('papel, empresa:empresa_id (id, nome)')
    .eq('usuario_id', usuario.id)
    .order('criado_em', { ascending: true })
    .limit(1)
    .maybeSingle();
  if (error) throw new Error(`Não foi possível carregar a empresa: ${error.message}`);
  if (!data?.empresa) return null;
  return { id: data.empresa.id, nome: data.empresa.nome, papel: data.papel };
});

export const listarProjetos = cache(async (): Promise<Projeto[]> => {
  const { supabase } = await exigirUsuario();
  const { data, error } = await supabase
    .from('projeto')
    .select('id, empresa_id, nome, endereco, data_inicio, data_fim_prevista, orcamento_total, status, responsavel_id, criado_em, atualizado_em')
    .order('criado_em', { ascending: false });
  if (error) throw new Error(`Não foi possível carregar os projetos: ${error.message}`);
  return data ?? [];
});

export const buscarProjeto = cache(async (id: string) => {
  const { supabase, usuario } = await exigirUsuario();
  const [projeto, papel] = await Promise.all([
    supabase
      .from('projeto')
      .select('id, empresa_id, nome, endereco, data_inicio, data_fim_prevista, orcamento_total, status, responsavel_id, criado_em, atualizado_em')
      .eq('id', id)
      .maybeSingle(),
    supabase.from('membro_projeto').select('papel').eq('projeto_id', id).eq('usuario_id', usuario.id).maybeSingle(),
  ]);
  if (projeto.error) throw new Error(`Não foi possível carregar o projeto: ${projeto.error.message}`);
  return projeto.data ? { projeto: projeto.data as Projeto, papel: papel.data?.papel ?? null } : null;
});
