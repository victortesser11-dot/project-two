'use server';

import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { empresaSchema, errosPorCampo, fichaObraSchema, projetoSchema } from '@obras/shared';
import { criarClienteServidor } from '@/lib/supabase/server';
import { empresaAtual } from '@/lib/dados';
import { gravarFichaObra } from '@/lib/fichaObra';

export type EstadoFormulario = {
  erros?: Record<string, string>;
  erroGeral?: string;
  valores?: Record<string, string>;
};

function valoresDoForm(form: FormData) {
  return Object.fromEntries([...form.entries()].map(([k, v]) => [k, String(v)]));
}

export async function criarEmpresa(_: EstadoFormulario, form: FormData): Promise<EstadoFormulario> {
  const valores = valoresDoForm(form);
  const dados = empresaSchema.safeParse(valores);
  if (!dados.success) return { erros: errosPorCampo(dados.error), valores };

  const supabase = await criarClienteServidor();
  const { error } = await supabase.rpc('criar_empresa', { p_nome: dados.data.nome });
  if (error) return { erroGeral: `Não foi possível criar a empresa: ${error.message}`, valores };

  revalidatePath('/', 'layout');
  redirect('/');
}

/** Obra de exemplo (só o admin): montada no banco pelas mesmas funções do app. */
export async function criarObraExemplo(): Promise<{ erro?: string }> {
  const empresa = await empresaAtual();
  if (!empresa || empresa.papel !== 'admin') return { erro: 'Só o admin da empresa cria a obra de exemplo.' };
  const supabase = await criarClienteServidor();
  const { data: id, error } = await supabase.rpc('criar_obra_exemplo', { p_empresa_id: empresa.id });
  if (error || !id) return { erro: `Não foi possível criar a obra de exemplo: ${error?.message ?? 'sem resposta'}` };
  revalidatePath('/', 'layout');
  redirect(`/projetos/${id}`);
}

export async function apagarObraExemplo(): Promise<{ erro?: string }> {
  const empresa = await empresaAtual();
  if (!empresa || empresa.papel !== 'admin') return { erro: 'Só o admin da empresa apaga a obra de exemplo.' };
  const supabase = await criarClienteServidor();
  const { error } = await supabase.rpc('excluir_obra_exemplo', { p_empresa_id: empresa.id });
  if (error) return { erro: `Não foi possível apagar a obra de exemplo: ${error.message}` };
  revalidatePath('/', 'layout');
  redirect('/');
}

export async function criarProjeto(_: EstadoFormulario, form: FormData): Promise<EstadoFormulario> {
  const valores = valoresDoForm(form);
  const dados = projetoSchema.safeParse(valores);
  if (!dados.success) return { erros: errosPorCampo(dados.error), valores };

  const empresa = await empresaAtual();
  if (!empresa) return { erroGeral: 'Cadastre sua empresa antes de criar um projeto.', valores };

  const p = dados.data;
  const supabase = await criarClienteServidor();
  const { data: id, error } = await supabase.rpc('criar_projeto', {
    p_empresa_id: empresa.id,
    p_nome: p.nome,
    p_endereco: p.endereco ?? undefined,
    p_data_inicio: p.data_inicio ?? undefined,
    p_data_fim_prevista: p.data_fim_prevista ?? undefined,
    p_orcamento_total: p.orcamento_total ?? undefined,
    p_status: p.status,
  });
  if (error || !id) return { erroGeral: `Não foi possível criar o projeto: ${error?.message ?? 'sem resposta'}`, valores };

  revalidatePath('/');
  redirect(`/projetos/${id}`);
}

/** Corrige os dados da obra (nome, endereço, datas, orçamento e situação). O RLS só deixa quem edita a obra. */
export async function editarProjeto(_: EstadoFormulario, form: FormData): Promise<EstadoFormulario> {
  const valores = valoresDoForm(form);
  const projetoId = String(form.get('projeto_id') ?? '');
  const dados = projetoSchema.safeParse(valores);
  const ficha = fichaObraSchema.safeParse(valores);
  if (!dados.success || !ficha.success) {
    return { erros: { ...(dados.success ? {} : errosPorCampo(dados.error)), ...(ficha.success ? {} : errosPorCampo(ficha.error)) }, valores };
  }

  const p = dados.data;
  const supabase = await criarClienteServidor();
  // Dados, ficha técnica e CEP numa gravação só (RLS de projeto; auditado). CEP novo vira localização para o clima.
  const cepMudou = ficha.data.cep !== null && ficha.data.cep !== String(form.get('cep_atual') ?? '');
  const { cep, ...resto } = ficha.data;
  const r = await gravarFichaObra(supabase, projetoId, {
    nome: p.nome,
    endereco: p.endereco,
    data_inicio: p.data_inicio,
    data_fim_prevista: p.data_fim_prevista,
    orcamento_total: p.orcamento_total,
    status: p.status,
    ...resto,
    ...(cepMudou || cep === null ? { cep } : {}),
  });
  if (!r.ok) return { erroGeral: r.erro, valores };
  revalidatePath('/');
  revalidatePath(`/projetos/${projetoId}`, 'layout');
  if (r.semLocalizacao) {
    return {
      erros: { cep: 'Os dados foram salvos, mas não achei a localização deste CEP. Confira o número ou defina pelo diário de obra, com o aparelho na obra.' },
      valores,
    };
  }
  redirect(`/projetos/${projetoId}`);
}

/**
 * Exclui a obra e tudo o que é dela (cronograma, diários, almoxarifado, medições, arquivos). Só o admin da empresa:
 * quem barra é o RLS (projeto_delete). Obra de exemplo sai pela função própria, que limpa também os cadastros fictícios.
 */
export async function excluirProjeto(projetoId: string): Promise<{ erro?: string }> {
  if (!/^[0-9a-f-]{36}$/i.test(projetoId)) return { erro: 'Obra inválida.' };
  const empresa = await empresaAtual();
  if (!empresa || empresa.papel !== 'admin') return { erro: 'Só o admin da empresa exclui obras.' };
  const supabase = await criarClienteServidor();
  const { data: projeto } = await supabase.from('projeto').select('id, exemplo').eq('id', projetoId).maybeSingle();
  if (!projeto) return { erro: 'Obra não encontrada.' };
  if (projeto.exemplo) return apagarObraExemplo();

  // Arquivos da obra no Storage: saem antes (depois da exclusão, as políticas não acham mais a obra).
  const { data: pastas } = await supabase.storage.from('arquivos').list(projetoId, { limit: 1000 });
  for (const pasta of pastas ?? []) {
    const { data: dentro } = await supabase.storage.from('arquivos').list(`${projetoId}/${pasta.name}`, { limit: 100 });
    const caminhos = (dentro ?? []).map((f) => `${projetoId}/${pasta.name}/${f.name}`);
    if (caminhos.length) await supabase.storage.from('arquivos').remove(caminhos);
  }

  const { data: linhas, error } = await supabase.from('projeto').delete().eq('id', projetoId).select('id');
  if (error) return { erro: `Não foi possível excluir a obra: ${error.message}` };
  if (!linhas || linhas.length === 0) return { erro: 'Só o admin da empresa exclui obras.' };
  revalidatePath('/', 'layout');
  redirect('/');
}
