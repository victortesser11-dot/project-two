import { z } from 'zod';
import { extensaoDoArquivo } from './arquivosObra';
import { CAMPOS_FICHA, type CampoFicha, type FichaObra } from './dominio';
import { formatarData } from './formato';
import { normalizarNorma, textoChecklistNormas, TITULO_NORMA, type NormaObra } from './normas';

// Leituras da IA: o que mandar ao modelo (texto do pedido) e como ler o que volta (JSON validado aqui, com folga:
// o modelo às vezes troca um tipo ou esquece um campo, e isso não pode derrubar a leitura inteira).
// A chamada em si fica no servidor do app (apps/web/src/lib/ia.ts); aqui não há rede nem chave.

/** Quantos arquivos e quantos bytes vão numa leitura (a cota grátis é por pedido; arquivo grande demora). */
export const LIMITE_ARQUIVOS_IA = 6;
export const LIMITE_FOTOS_IA = 6;
export const LIMITE_BYTES_IA = 18 * 1024 * 1024;

const MIME_IA: Record<string, string> = {
  pdf: 'application/pdf',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
  heic: 'image/heic',
};

/** Tipo que o modelo lê (PDF e imagem). DWG, IFC, planilha e ZIP não: peça o PDF da prancha. */
export function mimeParaIa(nome: string): string | null {
  const ext = extensaoDoArquivo(nome);
  return (ext && MIME_IA[ext]) || null;
}

/** Minúsculas, sem acento, sem pontuação: base para comparar nomes de tarefa e de etapa. */
export function chaveDeNome(texto: string): string {
  return texto
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[º°ª]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();
}

/** O modelo às vezes embrulha o JSON em ```json ... ``` ou escreve uma frase antes. */
export function extrairJson(texto: string): unknown {
  const limpo = texto.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
  try {
    return JSON.parse(limpo);
  } catch {
    const ini = limpo.indexOf('{');
    const fim = limpo.lastIndexOf('}');
    if (ini >= 0 && fim > ini) {
      try {
        return JSON.parse(limpo.slice(ini, fim + 1));
      } catch {
        /* cai no null */
      }
    }
    return null;
  }
}

// ---------------------------------------------------------------- campos com folga

const texto = (max: number) =>
  z
    .unknown()
    .optional()
    .transform((v) => (typeof v === 'string' ? v.trim().slice(0, max) : typeof v === 'number' ? String(v) : ''));
const textoOuNulo = (max: number) => texto(max).transform((v) => v || null);
const numeroOuNulo = z.unknown().optional().transform((v) => {
  const n = typeof v === 'number' ? v : typeof v === 'string' ? Number(v.replace(/\./g, '').replace(',', '.')) : NaN;
  return Number.isFinite(n) && n >= 0 ? n : null;
});
const listaDeTextos = (maxItens: number, maxTexto: number) =>
  z
    .unknown()
    .optional()
    .transform((v) => (Array.isArray(v) ? v : []))
    .transform((v) => v.map((x) => (typeof x === 'string' ? x.trim().slice(0, maxTexto) : '')).filter(Boolean).slice(0, maxItens));
const listaDe = <T extends z.ZodTypeAny>(item: T, max: number) =>
  z
    .unknown()
    .optional()
    .transform((v) => (Array.isArray(v) ? v : []))
    .transform((v) => v.map((x) => item.safeParse(x)).flatMap((r) => (r.success ? [r.data as z.output<T>] : [])).slice(0, max));

// ---------------------------------------------------------------- leitura dos arquivos do projeto

export const IMPORTANCIAS = ['alta', 'media', 'baixa'] as const;
export type Importancia = (typeof IMPORTANCIAS)[number];
export const TIPOS_FALTANDO = ['documento', 'tarefa', 'informacao'] as const;
export type TipoFaltando = (typeof TIPOS_FALTANDO)[number];

export const ROTULO_TIPO_FALTANDO: Record<TipoFaltando, string> = {
  documento: 'Documento ou projeto',
  tarefa: 'Parte da obra sem tarefa',
  informacao: 'Informação',
};

const tarefaSugeridaSchema = z
  .object({
    etapa: texto(120),
    nome: texto(200),
    unidade: textoOuNulo(20),
    quantidade: numeroOuNulo,
    motivo: texto(300),
    arquivo: textoOuNulo(200),
  })
  .refine((t) => t.nome.length >= 2, 'Tarefa sem nome');

const faltandoSchema = z
  .object({
    tipo: z.unknown().optional().transform((v) => (TIPOS_FALTANDO as readonly unknown[]).includes(v) ? (v as TipoFaltando) : 'informacao'),
    descricao: texto(400),
    importancia: z.unknown().optional().transform((v) => (IMPORTANCIAS as readonly unknown[]).includes(v) ? (v as Importancia) : 'media'),
  })
  .refine((f) => f.descricao.length >= 3, 'Item sem descrição');

export const leituraArquivosSchema = z.object({
  resumo: texto(1500),
  dados_obra: z
    .unknown()
    .optional()
    .transform((v) => (v && typeof v === 'object' ? v : {}))
    .pipe(
      z.object({
        tipo: textoOuNulo(160),
        endereco: textoOuNulo(300),
        cep: textoOuNulo(12),
        area_construida_m2: numeroOuNulo,
        area_terreno_m2: numeroOuNulo,
        pavimentos: textoOuNulo(160),
        unidades: textoOuNulo(300),
        proprietario: textoOuNulo(200),
        responsavel_tecnico: textoOuNulo(200),
        art_rrt: textoOuNulo(100),
        alvara: textoOuNulo(100),
        matricula: textoOuNulo(100),
      }),
    ),
  tarefas: listaDe(tarefaSugeridaSchema, 60),
  faltando: listaDe(faltandoSchema, 30),
  sugestoes: listaDeTextos(15, 400),
});
export type LeituraArquivos = z.output<typeof leituraArquivosSchema>;
export type TarefaSugerida = LeituraArquivos['tarefas'][number];

/** Nomes do cronograma que vão no pedido: etapas e tarefas sem repetir (as torres repetem os mesmos serviços). */
export function resumoDaEap(itens: Pick<{ tipo: 'etapa' | 'tarefa'; nome: string; nivel: number }, 'tipo' | 'nome' | 'nivel'>[], max = 250) {
  const etapas: string[] = [];
  const tarefas: string[] = [];
  const vistos = new Set<string>();
  for (const i of itens) {
    const k = `${i.tipo}:${chaveDeNome(i.nome)}`;
    if (vistos.has(k)) continue;
    vistos.add(k);
    (i.tipo === 'etapa' ? etapas : tarefas).push(i.nome);
  }
  return { etapas: etapas.slice(0, max), tarefas: tarefas.slice(0, max), cortadas: Math.max(0, tarefas.length - max) };
}

export function pedidoLeituraArquivos(dados: {
  obra: { nome: string; endereco: string | null };
  arquivos: { nome: string; pasta: string }[];
  /** Todos os documentos da obra (o que já existe), para dizer o que falta. */
  documentos: { nome: string; pasta: string }[];
  eap: { etapas: string[]; tarefas: string[]; cortadas: number };
}): string {
  const lista = (xs: string[]) => (xs.length ? xs.map((x) => `- ${x}`).join('\n') : '(nenhum)');
  return `Você é engenheiro civil e planeja obras no Brasil. Leia os arquivos anexados do projeto da obra "${dados.obra.nome}"${
    dados.obra.endereco ? ` (${dados.obra.endereco})` : ''
  } e compare com o cronograma que a obra já tem.

Arquivos anexados, na ordem:
${dados.arquivos.map((a, i) => `${i + 1}. ${a.nome} (${a.pasta})`).join('\n')}

Todos os documentos que a obra já guarda:
${lista(dados.documentos.map((d) => `${d.nome} (${d.pasta})`))}

Etapas do cronograma atual:
${lista(dados.eap.etapas)}

Tarefas do cronograma atual (cada nome uma vez, mesmo que se repita em vários pavimentos)${
    dados.eap.cortadas ? `; mais ${dados.eap.cortadas} não listadas` : ''
  }:
${lista(dados.eap.tarefas)}

Responda só com um JSON neste formato:
{
  "resumo": "o que é a obra, em até 4 frases",
  "dados_obra": { "tipo": "", "endereco": "", "cep": "", "area_construida_m2": 0, "area_terreno_m2": 0, "pavimentos": "", "unidades": "", "proprietario": "", "responsavel_tecnico": "", "art_rrt": "", "alvara": "", "matricula": "" },
  "tarefas": [ { "etapa": "", "nome": "", "unidade": "", "quantidade": 0, "motivo": "", "arquivo": "" } ],
  "faltando": [ { "tipo": "documento | tarefa | informacao", "descricao": "", "importancia": "alta | media | baixa" } ],
  "sugestoes": [ "" ]
}

Regras:
- "tarefas": só serviços que o projeto mostra e que NÃO aparecem no cronograma atual (nem com outro nome). Nome curto, no estilo das tarefas existentes. Em "etapa", use o nome exato de uma etapa existente quando couber; se não, uma etapa nova de poucas palavras. No máximo 20, as mais importantes; "motivo" em poucas palavras.
- "dados_obra": copie do carimbo, do quadro de áreas, do memorial ou da ART só o que estiver escrito; o que não aparecer fica null (não deduza CEP, área nem número de documento). "endereco" completo (rua, número, bairro, cidade/UF); "responsavel_tecnico" com nome e registro (CREA/CAU); "art_rrt", "alvara" (ou número do processo na prefeitura) e "matricula" só os números com a sigla. Nunca copie CPF, RG nem telefone.
- "quantidade" e "unidade" só quando o desenho mostrar com clareza (área, comprimento, número de unidades); senão null.
- "arquivo": o nome do arquivo de onde tirou a informação.
- "faltando": use "documento" para projetos e documentos que uma obra assim costuma precisar e que não estão entre os documentos da obra (ex.: estrutural, elétrico, hidrossanitário, PPCI, ART/RRT, alvará, memorial descritivo); "tarefa" para partes da obra que o projeto mostra sem nenhuma tarefa no cronograma; "informacao" para dados que o projeto não deixa claro.
- "faltando": no máximo 12 itens, os mais importantes primeiro.
- "sugestoes": no máximo 6 conselhos práticos para o engenheiro (ordem de serviços, pontos de atenção, o que conferir antes de começar), uma frase cada.
- Seja direto: a resposta inteira cabe em uma página.
- Não invente. O que não der para ver nos arquivos fica de fora ou vira "informacao" em "faltando".
- Escreva em português do Brasil.`;
}

// ---------------------------------------------------------------- dados da obra lidos → ficha da obra

export type DadosObraLidos = LeituraArquivos['dados_obra'];
export type CampoPropostaFicha = 'endereco' | 'cep' | CampoFicha;
export interface LinhaPropostaFicha {
  campo: CampoPropostaFicha;
  rotulo: string;
  /** Como está hoje na obra ('' = vazio). */
  atual: string;
  /** O que a IA leu nos projetos, já no jeito do campo do formulário. */
  sugerido: string;
  /** Vem marcado só o que preenche campo vazio; trocar um valor que já existe fica para o engenheiro decidir. */
  marcar: boolean;
}

const areaPtBr = (n: number | null | undefined) =>
  n === null || n === undefined || !Number.isFinite(Number(n)) ? '' : Number(n).toLocaleString('pt-BR', { minimumFractionDigits: 0, maximumFractionDigits: 2 });
const cepComTraco = (d: string) => (d.length === 8 ? `${d.slice(0, 5)}-${d.slice(5)}` : d);

/**
 * O que a leitura dos projetos propõe para a ficha da obra, comparado com o que a obra já tem. Campo que a IA não leu
 * ou que já está igual fica de fora. Nada é gravado aqui: o engenheiro marca, corrige e confirma.
 */
export function propostaFicha(
  atual: { endereco: string | null; cep?: string | null } & Partial<FichaObra>,
  lidos: DadosObraLidos,
): LinhaPropostaFicha[] {
  const linhas: LinhaPropostaFicha[] = [];
  const igual = (a: string, b: string) => chaveDeNome(a) === chaveDeNome(b);
  const juntar = (campo: CampoPropostaFicha, rotulo: string, hoje: string, lido: string, max: number) => {
    const sugerido = lido.trim().slice(0, max);
    if (!sugerido || igual(hoje, sugerido)) return;
    linhas.push({ campo, rotulo, atual: hoje, sugerido, marcar: hoje.trim() === '' });
  };
  juntar('endereco', 'Endereço', atual.endereco ?? '', lidos.endereco ?? '', 300);
  const cep = (lidos.cep ?? '').replace(/\D/g, '');
  if (cep.length === 8) juntar('cep', 'CEP', cepComTraco(atual.cep ?? ''), cepComTraco(cep), 9);
  const deIa: Record<CampoFicha, string> = {
    tipo_obra: lidos.tipo ?? '',
    area_construida_m2: lidos.area_construida_m2 ? areaPtBr(lidos.area_construida_m2) : '',
    area_terreno_m2: lidos.area_terreno_m2 ? areaPtBr(lidos.area_terreno_m2) : '',
    pavimentos: lidos.pavimentos ?? '',
    unidades: lidos.unidades ?? '',
    proprietario: lidos.proprietario ?? '',
    responsavel_tecnico: lidos.responsavel_tecnico ?? '',
    art_rrt: lidos.art_rrt ?? '',
    alvara: lidos.alvara ?? '',
    matricula: lidos.matricula ?? '',
  };
  for (const c of CAMPOS_FICHA) {
    const hoje = c.area ? areaPtBr(atual[c.campo] as number | null | undefined) : ((atual[c.campo] as string | null | undefined) ?? '');
    juntar(c.campo, c.rotulo, hoje, deIa[c.campo], c.max);
  }
  return linhas;
}

// ---------------------------------------------------------------- leitura das fotos do diário

export const SITUACOES_FOTO = ['concluida', 'avancou', 'sem_evidencia', 'nao_visivel'] as const;
export type SituacaoFoto = (typeof SITUACOES_FOTO)[number];

export const ROTULO_SITUACAO_FOTO: Record<SituacaoFoto, string> = {
  concluida: 'Parece concluída',
  avancou: 'Avançou',
  sem_evidencia: 'Sem sinal de avanço',
  nao_visivel: 'Não aparece nas fotos',
};

const tarefaNaFotoSchema = z.object({
  ref: texto(10),
  situacao: z.unknown().optional().transform((v) => (SITUACOES_FOTO as readonly unknown[]).includes(v) ? (v as SituacaoFoto) : 'nao_visivel'),
  percentual_sugerido: numeroOuNulo.transform((n) => (n === null ? null : Math.min(100, Math.round(n)))),
  evidencia: texto(300),
});

export const leituraFotosSchema = z.object({
  resumo: texto(1200),
  tarefas: listaDe(tarefaNaFotoSchema, 60),
  pessoas: numeroOuNulo.transform((n) => (n === null ? null : Math.round(n))),
  maquinas: listaDeTextos(15, 120),
  riscos: listaDeTextos(10, 300),
  observacoes: listaDeTextos(10, 300),
});
export type LeituraFotos = z.output<typeof leituraFotosSchema>;

export interface TarefaParaFoto {
  id: string;
  codigo: string;
  nome: string;
  etapa: string | null;
  percentual: number;
}

/** Tarefas viram T1, T2... no pedido: o modelo erra id comprido; a volta usa `tarefasDaLeitura`. */
export function pedidoLeituraFotos(dados: {
  obra: string;
  data: string;
  tarefas: TarefaParaFoto[];
  fotos: { legenda: string | null; tarefaId: string | null }[];
}): string {
  const ref = new Map(dados.tarefas.map((t, i) => [t.id, `T${i + 1}`]));
  const tarefas = dados.tarefas
    .map((t, i) => `T${i + 1} — ${t.codigo} ${t.nome}${t.etapa ? ` (${t.etapa})` : ''} — ${Math.round(t.percentual)}% feito`)
    .join('\n');
  const fotos = dados.fotos
    .map((f, i) => {
      const partes = [f.legenda ? `legenda "${f.legenda}"` : null, f.tarefaId && ref.has(f.tarefaId) ? `marcada na tarefa ${ref.get(f.tarefaId)}` : null].filter(Boolean);
      return `Foto ${i + 1}${partes.length ? `: ${partes.join(', ')}` : ''}`;
    })
    .join('\n');
  return `Você é engenheiro civil acompanhando uma obra no Brasil. As fotos anexadas são do diário de obra de ${formatarData(dados.data)}, da obra "${dados.obra}".

Fotos, na ordem em que estão anexadas:
${fotos}

Tarefas previstas para esse dia, com o quanto já estava feito:
${tarefas || '(nenhuma tarefa prevista)'}

Responda só com um JSON neste formato:
{
  "resumo": "o que as fotos mostram do andamento, em até 4 frases",
  "tarefas": [ { "ref": "T1", "situacao": "concluida | avancou | sem_evidencia | nao_visivel", "percentual_sugerido": 0, "evidencia": "Foto 2: ..." } ],
  "pessoas": 0,
  "maquinas": [ "" ],
  "riscos": [ "" ],
  "observacoes": [ "" ]
}

Regras:
- Uma linha em "tarefas" para cada tarefa prevista, pela referência (T1, T2...).
- "concluida" ou "avancou" só com sinal visível nas fotos; diga em "evidencia" qual foto e o que aparece. Sem sinal claro, use "sem_evidencia" (a área aparece, mas parada) ou "nao_visivel" (a área não aparece).
- "percentual_sugerido": quanto da tarefa parece feito, de 0 a 100, nunca menos do que já estava; null quando não der para avaliar.
- "pessoas": quantas pessoas trabalhando aparecem, somando as fotos sem contar a mesma duas vezes; null se não der para contar.
- "riscos": segurança (falta de capacete, cinto, guarda-corpo), material exposto, risco de chuva sobre serviço sensível.
- Seja conservador: é uma sugestão que o engenheiro vai conferir. Escreva em português do Brasil.`;
}

/** Junta a resposta às tarefas pedidas (descarta referência que o modelo inventou) e completa as que faltaram. */
export function tarefasDaLeitura(leitura: LeituraFotos, tarefas: TarefaParaFoto[]) {
  const porRef = new Map(leitura.tarefas.map((t) => [t.ref.toUpperCase(), t]));
  return tarefas.map((t, i) => {
    const r = porRef.get(`T${i + 1}`);
    const sugerido = r?.percentual_sugerido ?? null;
    return {
      tarefa: t,
      situacao: r?.situacao ?? ('nao_visivel' as SituacaoFoto),
      // Avanço nunca volta: sugestão menor que o já apontado vale o já apontado.
      percentual_sugerido: sugerido === null ? null : Math.max(sugerido, Math.round(t.percentual)),
      evidencia: r?.evidencia ?? '',
    };
  });
}

// ---------------------------------------------------------------- tarefas sugeridas × cronograma

export interface EtapaExistente {
  id: string;
  nome: string;
  nivel: number;
}

/** Marca o que já está no cronograma (mesmo nome) e acha a etapa existente de mesmo nome. */
export function conferirSugestoes(
  sugeridas: TarefaSugerida[],
  eap: { id: string; tipo: 'etapa' | 'tarefa'; nome: string; nivel: number }[],
) {
  const tarefasExistentes = new Set(eap.filter((i) => i.tipo === 'tarefa').map((i) => chaveDeNome(i.nome)));
  // Etapa de nível mais alto ganha quando há nomes iguais (ex.: "Infraestrutura externa" no topo).
  const etapas = new Map<string, EtapaExistente>();
  for (const i of [...eap].filter((x) => x.tipo === 'etapa').sort((a, b) => a.nivel - b.nivel)) {
    const k = chaveDeNome(i.nome);
    if (!etapas.has(k)) etapas.set(k, { id: i.id, nome: i.nome, nivel: i.nivel });
  }
  const vistas = new Set<string>();
  return sugeridas.map((t) => {
    const k = chaveDeNome(t.nome);
    const repetida = vistas.has(`${chaveDeNome(t.etapa)}|${k}`);
    vistas.add(`${chaveDeNome(t.etapa)}|${k}`);
    return {
      ...t,
      etapa: t.etapa || 'Sugeridas pela IA',
      jaExiste: tarefasExistentes.has(k) || repetida,
      etapaExistente: etapas.get(chaveDeNome(t.etapa || 'Sugeridas pela IA')) ?? null,
    };
  });
}
export type SugestaoConferida = ReturnType<typeof conferirSugestoes>[number];

/** Uma leitura guardada (o resultado é validado de novo ao abrir, pelo schema do tipo). */
export interface AnaliseIa {
  id: string;
  tipo: 'arquivos' | 'fotos_diario' | 'fiscal';
  arquivos: string[];
  diario_id: string | null;
  modelo: string;
  resultado: unknown;
  criado_em: string;
}

// ---------------------------------------------------------------- fiscal da obra (RF-105)
// A IA olha as fotos do dia (cada câmera hoje e ontem, mais o diário), compara com as tarefas previstas e com o avanço
// apontado, e aponta achados. O engenheiro ou o mestre confere cada um (resolver_achado_fiscal).

export const TIPOS_ACHADO = ['divergencia', 'seguranca', 'avanco', 'sem_evidencia'] as const;
export type TipoAchado = (typeof TIPOS_ACHADO)[number];
export const ROTULO_TIPO_ACHADO: Record<TipoAchado, string> = {
  divergencia: 'Divergência com o apontado',
  seguranca: 'Segurança (NR)',
  avanco: 'Avanço visto sem apontamento',
  sem_evidencia: 'Previstas sem sinal de avanço',
};
export const SITUACOES_ACHADO = ['pendente', 'confirmado', 'corrigido', 'descartado'] as const;
export type SituacaoAchado = (typeof SITUACOES_ACHADO)[number];
export const ROTULO_SITUACAO_ACHADO: Record<SituacaoAchado, string> = {
  pendente: 'A conferir',
  confirmado: 'IA acertou',
  corrigido: 'Corrigido',
  descartado: 'IA errou',
};

/** Achado gravado (achado_fiscal). */
export interface AchadoFiscal {
  id: string;
  analise_id: string;
  data: string;
  tipo: TipoAchado;
  tarefa_id: string | null;
  norma: string | null;
  gravidade: Importancia;
  titulo: string;
  detalhe: string | null;
  evidencia: string | null;
  percentual_visto: number | null;
  percentual_apontado: number | null;
  situacao: SituacaoAchado;
  percentual_final: number | null;
  resposta: string | null;
  resolvido_em: string | null;
}

/** O que vai para registrar_fiscal_ia. */
export type AchadoNovo = Pick<
  AchadoFiscal,
  'tipo' | 'tarefa_id' | 'norma' | 'gravidade' | 'titulo' | 'detalhe' | 'evidencia' | 'percentual_visto' | 'percentual_apontado'
>;

const segurancaSchema = z
  .object({
    norma: z.unknown().optional().transform(normalizarNorma),
    tema: texto(80),
    descricao: texto(300),
    evidencia: texto(300),
    gravidade: z.unknown().optional().transform((v) => (IMPORTANCIAS as readonly unknown[]).includes(v) ? (v as Importancia) : 'media'),
  })
  .refine((x) => x.descricao.length >= 3, 'Item sem descrição');

export const leituraFiscalSchema = z.object({
  resumo: texto(1200),
  mudancas: listaDeTextos(10, 300),
  tarefas: listaDe(tarefaNaFotoSchema, 60),
  pessoas: numeroOuNulo.transform((n) => (n === null ? null : Math.round(n))),
  maquinas: listaDeTextos(15, 120),
  seguranca: listaDe(segurancaSchema, 15),
  observacoes: listaDeTextos(10, 300),
});
export type LeituraFiscal = z.output<typeof leituraFiscalSchema>;

/** Imagens por leitura do fiscal: até 3 câmeras (dia e dia anterior) mais fotos do diário. */
export const MAX_IMAGENS_PEDIDO_FISCAL = 8;

/** Diferença (pontos) entre o apontado no dia e o que a IA vê, a partir da qual vira divergência. */
export const DIVERGENCIA_PONTOS = 20;

export function pedidoFiscalDia(dados: {
  obra: string;
  data: string;
  tarefas: TarefaParaFoto[];
  /** Rótulo de cada imagem anexada, na ordem (ex.: "Câmera Torre A, hoje 12:03"). */
  imagens: string[];
  /** Avanço apontado no próprio dia, por tarefa. */
  apontadosNoDia: Map<string, number>;
}): string {
  const tarefas = dados.tarefas
    .map((t, i) => {
      const hoje = dados.apontadosNoDia.get(t.id);
      return `T${i + 1} — ${t.codigo} ${t.nome}${t.etapa ? ` (${t.etapa})` : ''} — ${Math.round(t.percentual)}% feito${hoje !== undefined ? `; apontado no dia: ${Math.round(hoje)}%` : ''}`;
    })
    .join('\n');
  return `Você é fiscal de obra (engenheiro civil e técnico de segurança do trabalho) acompanhando uma obra no Brasil. As imagens anexadas são de ${formatarData(dados.data)}, da obra "${dados.obra}". Quando a mesma câmera aparece "hoje" e "ontem", compare as duas para ver o que mudou.

Imagens, na ordem em que estão anexadas (PDF e foto grande podem vir em mais de uma imagem):
${dados.imagens.map((r, i) => `${i + 1}. ${r}`).join('\n')}

Tarefas previstas para o dia, com o quanto estava feito e o que foi apontado no dia:
${tarefas || '(nenhuma tarefa prevista)'}

Itens de segurança que dá para conferir na imagem (normas regulamentadoras):
${textoChecklistNormas()}

Responda só com um JSON neste formato:
{
  "resumo": "o que as imagens mostram do andamento, em até 4 frases",
  "mudancas": [ "o que mudou de ontem para hoje, por câmera" ],
  "tarefas": [ { "ref": "T1", "situacao": "concluida | avancou | sem_evidencia | nao_visivel", "percentual_sugerido": 0, "evidencia": "imagem 2: ..." } ],
  "pessoas": 0,
  "maquinas": [ "" ],
  "seguranca": [ { "norma": "NR-35", "tema": "Trabalho em altura", "descricao": "", "evidencia": "imagem 1: ...", "gravidade": "alta | media | baixa" } ],
  "observacoes": [ "" ]
}

Regras:
- Uma linha em "tarefas" para cada tarefa prevista, pela referência (T1, T2...).
- "concluida" ou "avancou" só com sinal visível; diga em "evidencia" qual imagem e o que aparece. Área visível e parada: "sem_evidencia". Área que não aparece: "nao_visivel".
- "percentual_sugerido": quanto da tarefa parece feito, de 0 a 100, pelo que se vê (pode ser menos do que foi apontado); null quando não der para avaliar.
- "seguranca": só não conformidades que aparecem nas imagens, uma por item, com a norma da lista acima (só "NR-" e o número, sem subitem) e a imagem onde aparece. "alta" quando há risco de queda, soterramento, choque ou atropelamento agora. Nada de suposição: se não dá para ver, não aponte.
- "pessoas": quantas pessoas trabalhando aparecem hoje, sem contar a mesma duas vezes; null se não der para contar.
- Seja conservador: é uma sugestão que o engenheiro vai conferir. Escreva em português do Brasil, frases curtas.`;
}

/**
 * Achados da leitura: divergência quando o apontado do dia não aparece nas imagens (ou passa do que se vê em
 * DIVERGENCIA_PONTOS ou mais), avanço visto sem apontamento, tarefa prevista sem sinal, e as não conformidades de
 * segurança. "Não aparece" (fora do quadro) nunca vira achado: a IA não tem como avaliar.
 */
export function achadosDaLeitura(leitura: LeituraFiscal, tarefas: TarefaParaFoto[], apontadosNoDia: Map<string, number>): AchadoNovo[] {
  const porRef = new Map(leitura.tarefas.map((t) => [t.ref.toUpperCase(), t]));
  const achados: AchadoNovo[] = [];
  const pct = (n: number) => `${Math.round(n)}%`;
  tarefas.forEach((t, i) => {
    const r = porRef.get(`T${i + 1}`);
    if (!r || r.situacao === 'nao_visivel') return;
    const nome = `${t.codigo} ${t.nome}`;
    const visto = r.percentual_sugerido;
    const evidencia = r.evidencia || null;
    const hoje = apontadosNoDia.get(t.id);
    if (hoje !== undefined) {
      if (r.situacao === 'sem_evidencia') {
        achados.push({
          tipo: 'divergencia', tarefa_id: t.id, norma: null, gravidade: 'alta', evidencia,
          titulo: `Avanço apontado sem sinal nas imagens: ${nome}`.slice(0, 200),
          detalhe: `Apontado no dia: ${pct(hoje)}. A IA não viu avanço na área.`,
          percentual_visto: visto, percentual_apontado: hoje,
        });
      } else if (visto !== null && hoje - visto >= DIVERGENCIA_PONTOS) {
        achados.push({
          tipo: 'divergencia', tarefa_id: t.id, norma: null, gravidade: hoje - visto >= 2 * DIVERGENCIA_PONTOS ? 'alta' : 'media', evidencia,
          titulo: `Apontado acima do que aparece: ${nome}`.slice(0, 200),
          detalhe: `Apontado no dia: ${pct(hoje)}. A IA vê cerca de ${pct(visto)}.`,
          percentual_visto: visto, percentual_apontado: hoje,
        });
      }
      return;
    }
    if ((r.situacao === 'avancou' || r.situacao === 'concluida') && visto !== null && visto > t.percentual + 2) {
      achados.push({
        tipo: 'avanco', tarefa_id: t.id, norma: null, gravidade: 'media', evidencia,
        titulo: `Avanço visto sem apontamento: ${nome}`.slice(0, 200),
        detalhe: `Apontado até agora: ${pct(t.percentual)}. A IA vê cerca de ${pct(visto)}.`,
        percentual_visto: visto, percentual_apontado: t.percentual,
      });
    } else if (r.situacao === 'sem_evidencia') {
      achados.push({
        tipo: 'sem_evidencia', tarefa_id: t.id, norma: null, gravidade: 'baixa', evidencia,
        titulo: `Prevista para o dia, sem sinal de avanço: ${nome}`.slice(0, 200),
        detalhe: `Está em ${pct(t.percentual)}. A área aparece, mas parada.`,
        percentual_visto: visto, percentual_apontado: t.percentual,
      });
    }
  });
  for (const s of leitura.seguranca) {
    // Toda obra está na NR-18: norma fora da lista vira a geral da construção.
    const norma: NormaObra = s.norma ?? 'NR-18';
    achados.push({
      tipo: 'seguranca', tarefa_id: null, norma, gravidade: s.gravidade,
      titulo: `${norma} · ${s.tema || TITULO_NORMA[norma]}: ${s.descricao}`.slice(0, 200),
      detalhe: s.descricao.length > 120 ? s.descricao : null,
      evidencia: s.evidencia || null, percentual_visto: null, percentual_apontado: null,
    });
  }
  return achados.slice(0, 80);
}

/** Quanto a IA acertou: confirmados sobre os conferidos (meta do PRD: 70% ou mais). */
export function taxaDeAcerto(achados: { situacao: SituacaoAchado }[]) {
  const conta = (s: SituacaoAchado) => achados.filter((a) => a.situacao === s).length;
  const confirmados = conta('confirmado');
  const corrigidos = conta('corrigido');
  const descartados = conta('descartado');
  const conferidos = confirmados + corrigidos + descartados;
  return { conferidos, confirmados, corrigidos, descartados, pendentes: conta('pendente'), taxa: conferidos ? confirmados / conferidos : null };
}
