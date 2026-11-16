import 'server-only';
import type { FichaObraValidada } from '@obras/shared';
import { consultarCep } from '@/lib/brasilapi';
import type { Database } from '@/lib/database.types';
import type { criarClienteServidor } from '@/lib/supabase/server';

type Cliente = Awaited<ReturnType<typeof criarClienteServidor>>;
type DadosGerais = Pick<Database['public']['Tables']['projeto']['Update'], 'nome' | 'endereco' | 'data_inicio' | 'data_fim_prevista' | 'orcamento_total' | 'status'>;
/** Ficha técnica, CEP e (no formulário completo) os dados gerais da obra. */
export type DadosFicha = Partial<FichaObraValidada> & DadosGerais;

/**
 * Grava a ficha técnica (e o endereço) da obra pelo UPDATE direto em `projeto`: quem barra é o RLS (engenheiro da obra
 * e admin) e o trigger de auditoria guarda o antes e o depois. Só os campos presentes mudam. CEP novo vira localização
 * (clima, previsão e Defesa Civil); se a BrasilAPI não achar o CEP, o resto fica gravado e `semLocalizacao` avisa.
 */
export async function gravarFichaObra(
  supabase: Cliente,
  projetoId: string,
  dados: DadosFicha,
): Promise<{ ok: true; semLocalizacao: boolean } | { ok: false; erro: string }> {
  const campos = Object.fromEntries(Object.entries(dados).filter(([, v]) => v !== undefined)) as DadosFicha;
  if (Object.keys(campos).length === 0) return { ok: true, semLocalizacao: false };

  let semLocalizacao = false;
  let local: { latitude: number; longitude: number } | null = null;
  if (campos.cep) {
    const r = await consultarCep(campos.cep);
    if (r && r.latitude !== null && r.longitude !== null) {
      local = { latitude: Math.round(r.latitude * 1e6) / 1e6, longitude: Math.round(r.longitude * 1e6) / 1e6 };
    } else semLocalizacao = true;
  }

  const { data, error } = await supabase
    .from('projeto')
    .update({ ...campos, ...(local ?? {}) })
    .eq('id', projetoId)
    .select('id');
  if (error) return { ok: false, erro: `Não foi possível gravar os dados da obra: ${error.message}` };
  if (!data || data.length === 0) return { ok: false, erro: 'Só o engenheiro da obra ou o admin da empresa corrige estes dados.' };
  return { ok: true, semLocalizacao };
}
