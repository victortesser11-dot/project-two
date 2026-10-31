import 'server-only';
import { cache } from 'react';
import { redirect } from 'next/navigation';
import type { ItemEap, MembroProjeto, PapelProjeto, Projeto } from '@obras/shared';
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

/**
 * Pode editar o projeto (EAP, pessoas)? Engenheiro do projeto ou admin da
 * empresa. Serve só para mostrar ou esconder botões: quem barra é o banco.
 */
export async function podeEditarProjeto(projeto: Projeto, papel: PapelProjeto | null): Promise<boolean> {
  if (papel === 'engenheiro') return true;
  const empresa = await empresaAtual();
  return empresa?.papel === 'admin' && empresa.id === projeto.empresa_id;
}

export const buscarEap = cache(async (projetoId: string): Promise<ItemEap[]> => {
  const { supabase } = await exigirUsuario();
  const { data, error } = await supabase.rpc('eap_do_projeto', { p_projeto_id: projetoId });
  if (error) throw new Error(`Não foi possível carregar a EAP: ${error.message}`);
  // A função devolve colunas que podem ser nulas; o gerador de tipos não sabe disso.
  return (data ?? []) as unknown as ItemEap[];
});

/** Quantos itens a EAP já tem (sem montar a árvore). */
export async function contarItensEap(projetoId: string): Promise<number> {
  const { supabase } = await exigirUsuario();
  const { count, error } = await supabase
    .from('eap_item')
    .select('id', { count: 'exact', head: true })
    .eq('projeto_id', projetoId);
  if (error) throw new Error(`Não foi possível contar os itens da EAP: ${error.message}`);
  return count ?? 0;
}

export const listarMembrosProjeto = cache(async (projetoId: string): Promise<MembroProjeto[]> => {
  const { supabase } = await exigirUsuario();
  const { data, error } = await supabase.rpc('membros_do_projeto', { p_projeto_id: projetoId });
  if (error) throw new Error(`Não foi possível carregar quem acessa o projeto: ${error.message}`);
  return (data ?? []) as unknown as MembroProjeto[];
});

/** Números da EAP para o painel e o cabeçalho do cronograma. */
export function resumirEap(itens: ItemEap[]) {
  const tarefas = itens.filter((i) => i.tipo === 'tarefa');
  const custos = tarefas.map((t) => t.custo_previsto).filter((c): c is number => c !== null);
  const inicios = tarefas.map((t) => t.inicio_previsto).filter((d): d is string => d !== null).sort();
  const fins = tarefas.map((t) => t.fim_previsto).filter((d): d is string => d !== null).sort();
  return {
    etapas: itens.length - tarefas.length,
    tarefas: tarefas.length,
    custoTotal: custos.length > 0 ? Math.round(custos.reduce((s, c) => s + Number(c), 0) * 100) / 100 : null,
    inicio: inicios[0] ?? null,
    fim: fins[fins.length - 1] ?? null,
    tarefasSemCusto: tarefas.length - custos.length,
    tarefasSemData: tarefas.filter((t) => !t.inicio_previsto || !t.fim_previsto).length,
  };
}
