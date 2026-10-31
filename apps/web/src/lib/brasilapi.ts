import 'server-only';
import { lerCep, lerCnpj, lerFeriados, urlCep, urlCnpj, urlFeriados, type DadosCep, type DadosCnpj, type Feriado } from '@obras/shared';

async function buscar(url: string, revalidar: number): Promise<unknown | null> {
  try {
    const resp = await fetch(url, { signal: AbortSignal.timeout(5000), next: { revalidate: revalidar } });
    if (!resp.ok) return null;
    return await resp.json();
  } catch {
    return null;
  }
}

/** Dados da Receita para o CNPJ (razão social e situação). null se a consulta falhar. */
export async function consultarCnpj(cnpj: string): Promise<DadosCnpj | null> {
  return lerCnpj(await buscar(urlCnpj(cnpj), 86_400));
}

/** Feriados nacionais do ano (cache de 1 dia). Lista vazia se a consulta falhar. */
export async function feriadosDoAno(ano: number): Promise<Feriado[]> {
  return lerFeriados(await buscar(urlFeriados(ano), 86_400));
}

export async function feriadoNoDia(data: string): Promise<Feriado | null> {
  const feriados = await feriadosDoAno(Number(data.slice(0, 4)));
  return feriados.find((f) => f.data === data) ?? null;
}

export async function consultarCep(cep: string): Promise<DadosCep | null> {
  return lerCep(await buscar(urlCep(cep), 86_400));
}
