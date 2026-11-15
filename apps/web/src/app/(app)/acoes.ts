'use server';

import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { empresaSchema, errosPorCampo, projetoSchema } from '@obras/shared';
import { criarClienteServidor } from '@/lib/supabase/server';
import { empresaAtual } from '@/lib/dados';
import { consultarCep } from '@/lib/brasilapi';

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
  if (!dados.success) return { erros: errosPorCampo(dados.error), valores };

  const p = dados.data;
  const supabase = await criarClienteServidor();
  const { data: linhas, error } = await supabase
    .from('projeto')
    .update({
      nome: p.nome,
      endereco: p.endereco,
      data_inicio: p.data_inicio,
      data_fim_prevista: p.data_fim_prevista,
      orcamento_total: p.orcamento_total,
      status: p.status,
    })
    .eq('id', projetoId)
    .select('id');
  if (error) return { erroGeral: `Não foi possível salvar a obra: ${error.message}`, valores };
  if (!linhas || linhas.length === 0) return { erroGeral: 'Só o engenheiro da obra ou o admin da empresa corrige estes dados.', valores };

  // CEP (opcional): localização para o clima do diário e o alerta de chuva. Os outros dados já foram salvos.
  const cep = String(form.get('cep') ?? '').replace(/\D/g, '');
  if (cep) {
    const local = cep.length === 8 ? await consultarCep(cep) : null;
    if (!local || local.latitude === null || local.longitude === null) {
      revalidatePath(`/projetos/${projetoId}`, 'layout');
      return {
        erros: { cep: 'Os dados foram salvos, mas não achei a localização deste CEP. Confira o número ou defina pelo diário de obra, com o aparelho na obra.' },
        valores,
      };
    }
    await supabase
      .from('projeto')
      .update({ latitude: Math.round(local.latitude * 1e6) / 1e6, longitude: Math.round(local.longitude * 1e6) / 1e6 })
      .eq('id', projetoId);
  }

  revalidatePath('/');
  revalidatePath(`/projetos/${projetoId}`, 'layout');
  redirect(`/projetos/${projetoId}`);
}
