import type { Diario, FotoDiario, LinhaEfetivo, Projeto } from '@obras/shared';
import type { AvancoDoDia } from '@/lib/dados';
import type { ConteudoDiario } from './DocumentoDiario';

/**
 * Conteúdo para exibir/imprimir: o retrato congelado quando o diário está
 * assinado; senão, o estado atual (rascunho).
 */
export function conteudoParaExibir(
  projeto: Pick<Projeto, 'nome' | 'endereco'>,
  data: string,
  diario: Diario | null,
  efetivo: LinhaEfetivo[],
  fotos: FotoDiario[],
  avancos: AvancoDoDia[],
): ConteudoDiario {
  if (diario?.status === 'assinado' && diario.conteudo_assinado) {
    return diario.conteudo_assinado as ConteudoDiario;
  }
  return {
    projeto: { nome: projeto.nome, endereco: projeto.endereco },
    data,
    clima: {
      manha: diario?.clima_manha ?? null,
      tarde: diario?.clima_tarde ?? null,
      praticavel_manha: diario?.praticavel_manha ?? true,
      praticavel_tarde: diario?.praticavel_tarde ?? true,
      temp_min: diario?.temp_min ?? null,
      temp_max: diario?.temp_max ?? null,
      chuva_mm: diario?.chuva_mm ?? null,
      automatico: diario?.clima_automatico ?? false,
    },
    ocorrencias: diario?.ocorrencias ?? null,
    observacoes: diario?.observacoes ?? null,
    efetivo: efetivo.map((e) => ({ funcao: e.funcao, empresa: e.empresa_terceira, quantidade: e.quantidade })),
    fotos: fotos.map((f) => ({ caminho: f.caminho, legenda: f.legenda })),
    avancos: avancos.map((a) => ({ ...a })),
  };
}

export function urlsDasFotos(fotos: FotoDiario[]): Record<string, string> {
  return Object.fromEntries(fotos.filter((f) => f.url).map((f) => [f.caminho, f.url!]));
}
