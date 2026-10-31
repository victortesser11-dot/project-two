// BrasilAPI (https://brasilapi.com.br, gratuita e sem chave): CNPJ, feriados e CEP.
// Só a parte pura: URLs e leitura das respostas. A busca HTTP fica no servidor do app,
// com tempo limite e preenchimento manual como alternativa.
import { somenteDigitos } from '../documentos';

const BASE = 'https://brasilapi.com.br/api';

export const urlCnpj = (cnpj: string) => `${BASE}/cnpj/v1/${somenteDigitos(cnpj)}`;
export const urlFeriados = (ano: number) => `${BASE}/feriados/v1/${ano}`;
export const urlCep = (cep: string) => `${BASE}/cep/v2/${somenteDigitos(cep)}`;

export interface DadosCnpj {
  razao_social: string;
  nome_fantasia: string | null;
  /** Situação cadastral na Receita, ex.: ATIVA, BAIXADA, INAPTA, SUSPENSA. */
  situacao: string | null;
  ativa: boolean;
  municipio: string | null;
  uf: string | null;
  telefone: string | null;
  atividade: string | null;
}

const texto = (v: unknown) => (typeof v === 'string' && v.trim() !== '' ? v.trim() : null);

export function lerCnpj(json: unknown): DadosCnpj | null {
  if (!json || typeof json !== 'object') return null;
  const j = json as Record<string, unknown>;
  const razao = texto(j.razao_social);
  if (!razao) return null;
  const situacao = texto(j.descricao_situacao_cadastral);
  const ddd = texto(j.ddd_telefone_1);
  return {
    razao_social: razao,
    nome_fantasia: texto(j.nome_fantasia),
    situacao: situacao ? situacao.toUpperCase() : null,
    ativa: situacao?.toUpperCase() === 'ATIVA',
    municipio: texto(j.municipio),
    uf: texto(j.uf),
    telefone: ddd ? somenteDigitos(ddd) || null : null,
    atividade: texto(j.cnae_fiscal_descricao),
  };
}

export interface Feriado {
  data: string;
  nome: string;
}

export function lerFeriados(json: unknown): Feriado[] {
  if (!Array.isArray(json)) return [];
  return json
    .map((f) => (f && typeof f === 'object' ? (f as Record<string, unknown>) : {}))
    .filter((f) => typeof f.date === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(f.date as string) && texto(f.name))
    .map((f) => ({ data: f.date as string, nome: texto(f.name)! }));
}

export interface DadosCep {
  cep: string;
  logradouro: string | null;
  bairro: string | null;
  cidade: string | null;
  uf: string | null;
  latitude: number | null;
  longitude: number | null;
}

export function lerCep(json: unknown): DadosCep | null {
  if (!json || typeof json !== 'object') return null;
  const j = json as Record<string, unknown>;
  const cep = texto(j.cep);
  if (!cep) return null;
  const loc = (j.location as { coordinates?: { latitude?: unknown; longitude?: unknown } } | undefined)?.coordinates;
  const lat = loc?.latitude !== undefined ? Number(loc.latitude) : NaN;
  const lon = loc?.longitude !== undefined ? Number(loc.longitude) : NaN;
  const coordenadasOk = Number.isFinite(lat) && Number.isFinite(lon) && Math.abs(lat) <= 90 && Math.abs(lon) <= 180 && !(lat === 0 && lon === 0);
  return {
    cep: somenteDigitos(cep),
    logradouro: texto(j.street),
    bairro: texto(j.neighborhood),
    cidade: texto(j.city),
    uf: texto(j.state),
    latitude: coordenadasOk ? lat : null,
    longitude: coordenadasOk ? lon : null,
  };
}

/** "Rua X, Bairro, Cidade/UF" a partir do CEP. */
export function enderecoDoCep(c: DadosCep): string {
  const partes = [c.logradouro, c.bairro, c.cidade && c.uf ? `${c.cidade}/${c.uf}` : c.cidade].filter(Boolean);
  return partes.join(', ');
}
