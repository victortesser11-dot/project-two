import { z } from 'zod';
import { CLIMAS, PAPEIS_PROJETO, STATUS_PROJETO, TIPOS_CUSTO_MAO_OBRA, TIPOS_DEPENDENCIA, TIPOS_ITEM_EAP } from './dominio';
import { cnpjValido, cpfValido, somenteDigitos } from './documentos';
import { lerNumero } from './importacao/valores';

const DATA_ISO = /^\d{4}-\d{2}-\d{2}$/;

// Campo de formulário vazio vira null.
const textoOpcional = (max: number) =>
  z
    .string()
    .trim()
    .max(max, `Use no máximo ${max} caracteres`)
    .transform((v) => (v === '' ? null : v))
    .nullable()
    .optional()
    .transform((v) => v ?? null);

const dataOpcional = z
  .string()
  .trim()
  .refine((v) => v === '' || (DATA_ISO.test(v) && !Number.isNaN(Date.parse(v))), 'Data inválida')
  .transform((v) => (v === '' ? null : v))
  .nullable()
  .optional()
  .transform((v) => v ?? null);

/**
 * Aceita "4500000", "4.500.000,00", "4500000.50" e "R$ 1.234,56".
 * Devolve null para vazio e NaN para algo que não é número.
 */
export function lerValorEmReais(entrada: string): number | null {
  const limpo = entrada.replace(/R\$|\s/g, '');
  if (limpo === '') return null;
  // Formato brasileiro: ponto como milhar, vírgula como decimal.
  const normalizado = limpo.includes(',') ? limpo.replace(/\./g, '').replace(',', '.') : limpo;
  if (!/^-?\d+(\.\d+)?$/.test(normalizado)) return Number.NaN;
  return Number(normalizado);
}

const valorOpcional = z
  .union([z.string(), z.number()])
  .nullable()
  .optional()
  .transform((v, ctx) => {
    if (v === null || v === undefined) return null;
    const n = typeof v === 'number' ? v : lerValorEmReais(v);
    if (n === null) return null;
    if (Number.isNaN(n)) {
      ctx.addIssue({ code: 'custom', message: 'Valor inválido' });
      return z.NEVER;
    }
    if (n <= 0) {
      ctx.addIssue({ code: 'custom', message: 'O orçamento precisa ser maior que zero' });
      return z.NEVER;
    }
    return Math.round(n * 100) / 100;
  });

export const empresaSchema = z.object({
  nome: z.string().trim().min(2, 'Informe o nome da empresa').max(120, 'Use no máximo 120 caracteres'),
});
export type EmpresaEntrada = z.input<typeof empresaSchema>;

export const projetoSchema = z
  .object({
    nome: z.string().trim().min(2, 'Informe o nome do projeto').max(160, 'Use no máximo 160 caracteres'),
    endereco: textoOpcional(300),
    data_inicio: dataOpcional,
    data_fim_prevista: dataOpcional,
    orcamento_total: valorOpcional,
    status: z.enum(STATUS_PROJETO).default('planejamento'),
  })
  .superRefine((p, ctx) => {
    if (p.data_inicio && p.data_fim_prevista && p.data_fim_prevista < p.data_inicio) {
      ctx.addIssue({
        code: 'custom',
        path: ['data_fim_prevista'],
        message: 'O fim previsto não pode ser antes do início',
      });
    }
  });
export type ProjetoEntrada = z.input<typeof projetoSchema>;
export type ProjetoValidado = z.output<typeof projetoSchema>;

// Campo numérico de formulário (digitado no padrão brasileiro): vazio vira null.
const numeroNaoNegativo = (casas: number) =>
  z
    .union([z.string(), z.number()])
    .nullable()
    .optional()
    .transform((v, ctx) => {
      if (v === null || v === undefined) return null;
      const n = lerNumero(v, ',');
      if (n === null) return null;
      if (Number.isNaN(n)) {
        ctx.addIssue({ code: 'custom', message: 'Número inválido' });
        return z.NEVER;
      }
      if (n < 0) {
        ctx.addIssue({ code: 'custom', message: 'Não pode ser negativo' });
        return z.NEVER;
      }
      const f = 10 ** casas;
      return Math.round(n * f) / f;
    });

/**
 * Etapa ou tarefa da EAP. Etapas não têm valores próprios (somam as tarefas),
 * então esses campos são descartados quando o tipo é etapa.
 */
export const itemEapSchema = z
  .object({
    tipo: z.enum(TIPOS_ITEM_EAP),
    nome: z.string().trim().min(1, 'Informe o nome').max(300, 'Use no máximo 300 caracteres'),
    unidade: textoOpcional(20),
    quantidade: numeroNaoNegativo(4),
    custo_previsto: numeroNaoNegativo(2),
    inicio_previsto: dataOpcional,
    fim_previsto: dataOpcional,
  })
  .superRefine((item, ctx) => {
    if (item.tipo === 'tarefa' && item.inicio_previsto && item.fim_previsto && item.fim_previsto < item.inicio_previsto) {
      ctx.addIssue({ code: 'custom', path: ['fim_previsto'], message: 'O término não pode ser antes do início' });
    }
  })
  .transform((item) =>
    item.tipo === 'etapa'
      ? { ...item, unidade: null, quantidade: null, custo_previsto: null, inicio_previsto: null, fim_previsto: null }
      : item,
  );
export type ItemEapEntrada = z.input<typeof itemEapSchema>;
export type ItemEapValidado = z.output<typeof itemEapSchema>;

export const membroProjetoSchema = z.object({
  email: z.string().trim().toLowerCase().email('Informe um e-mail válido'),
  papel: z.enum(PAPEIS_PROJETO),
});

/** Dependência entre duas tarefas (RF-201). Defasagem em dias corridos; negativa adianta. */
export const dependenciaSchema = z
  .object({
    predecessora_id: z.string().uuid('Escolha a tarefa anterior'),
    sucessora_id: z.string().uuid('Tarefa inválida'),
    tipo: z.enum(TIPOS_DEPENDENCIA, { error: 'Escolha o tipo de ligação' }),
    defasagem_dias: z
      .union([z.string(), z.number()])
      .optional()
      .transform((v, ctx) => {
        const texto = String(v ?? '').trim();
        if (texto === '') return 0;
        const n = Number(texto.replace(',', '.'));
        if (!Number.isInteger(n)) {
          ctx.addIssue({ code: 'custom', message: 'Use um número inteiro de dias' });
          return z.NEVER;
        }
        if (n < -365 || n > 365) {
          ctx.addIssue({ code: 'custom', message: 'Use entre -365 e 365 dias' });
          return z.NEVER;
        }
        return n;
      }),
  })
  .refine((d) => d.predecessora_id !== d.sucessora_id, {
    path: ['predecessora_id'],
    message: 'Uma tarefa não depende dela mesma',
  });
export type DependenciaValidada = z.output<typeof dependenciaSchema>;

/**
 * Apontamento de avanço feito no campo (RF-202). O id é gerado no aparelho
 * para que reenviar a fila offline não duplique. Informe % ou quantidade.
 */
export const apontamentoSchema = z
  .object({
    id: z.string().uuid(),
    tarefa_id: z.string().uuid(),
    data: z.string().regex(DATA_ISO, 'Data inválida'),
    percentual: z.number().min(0, 'Mínimo 0%').max(100, 'Máximo 100%').nullable().default(null),
    quantidade: z.number().min(0, 'Não pode ser negativa').nullable().default(null),
    observacao: z.string().trim().max(500, 'Use no máximo 500 caracteres').nullable().default(null),
  })
  .refine((a) => a.percentual !== null || a.quantidade !== null, {
    path: ['percentual'],
    message: 'Informe o avanço em % ou a quantidade feita',
  });
export type ApontamentoEntrada = z.input<typeof apontamentoSchema>;
export type Apontamento = z.output<typeof apontamentoSchema>;

// Número opcional digitado no padrão brasileiro, dentro de um intervalo.
const numeroEntre = (min: number, max: number, casas: number, mensagem: string) =>
  z
    .union([z.string(), z.number()])
    .nullable()
    .optional()
    .transform((v, ctx) => {
      if (v === null || v === undefined) return null;
      const n = lerNumero(v, ',');
      if (n === null) return null;
      if (Number.isNaN(n) || n < min || n > max) {
        ctx.addIssue({ code: 'custom', message: mensagem });
        return z.NEVER;
      }
      const f = 10 ** casas;
      return Math.round(n * f) / f;
    });

const climaOpcional = z
  .union([z.enum(CLIMAS), z.literal('')])
  .nullable()
  .optional()
  .transform((v) => (v ? v : null));

const simNao = z
  .union([z.boolean(), z.string()])
  .optional()
  .transform((v) => v === true || v === 'true' || v === 'on' || v === '1');

/** Formulário do diário do dia (RF-203). */
export const diarioSchema = z
  .object({
    clima_manha: climaOpcional,
    clima_tarde: climaOpcional,
    praticavel_manha: simNao,
    praticavel_tarde: simNao,
    temp_min: numeroEntre(-20, 55, 1, 'Use uma temperatura entre -20 e 55 °C'),
    temp_max: numeroEntre(-20, 55, 1, 'Use uma temperatura entre -20 e 55 °C'),
    chuva_mm: numeroEntre(0, 1000, 1, 'Use de 0 a 1.000 mm'),
    clima_automatico: simNao,
    ocorrencias: textoOpcional(4000),
    observacoes: textoOpcional(4000),
  })
  .superRefine((d, ctx) => {
    if (d.temp_min !== null && d.temp_max !== null && d.temp_max < d.temp_min) {
      ctx.addIssue({ code: 'custom', path: ['temp_max'], message: 'A máxima não pode ser menor que a mínima' });
    }
  });
export type DiarioValidado = z.output<typeof diarioSchema>;

/** Equipe do dia: função, empreiteira (opcional) e quantidade. */
export const efetivoSchema = z
  .array(
    z.object({
      funcao: z.string().trim().min(1, 'Informe a função').max(80, 'Use no máximo 80 caracteres'),
      empresa_terceira: textoOpcional(120),
      quantidade: z.coerce
        .number({ error: 'Informe a quantidade' })
        .int('Use um número inteiro')
        .min(1, 'Mínimo 1')
        .max(999, 'Máximo 999'),
    }),
  )
  .max(100, 'Use no máximo 100 linhas');

// ---------------------------------------------------------------- equipe (RF-301 a 303)

const telefoneOpcional = textoOpcional(30);

/** Pessoa da obra. CPF é opcional, mas, se vier, precisa ser válido. */
export const trabalhadorSchema = z.object({
  nome: z.string().trim().min(2, 'Informe o nome').max(160, 'Use no máximo 160 caracteres'),
  cpf: z
    .string()
    .optional()
    .transform((v, ctx) => {
      const c = somenteDigitos(v ?? '');
      if (c === '') return null;
      if (!cpfValido(c)) {
        ctx.addIssue({ code: 'custom', message: 'CPF inválido: confira os números' });
        return z.NEVER;
      }
      return c;
    }),
  funcao: z.string().trim().min(1, 'Informe a função').max(80, 'Use no máximo 80 caracteres'),
  empreiteira_id: z
    .union([z.string().uuid(), z.literal('')])
    .optional()
    .transform((v) => (v ? v : null)),
  telefone: telefoneOpcional,
});
export type TrabalhadorValidado = z.output<typeof trabalhadorSchema>;

export const empreiteiraSchema = z.object({
  nome: z.string().trim().min(2, 'Informe o nome da empreiteira').max(160, 'Use no máximo 160 caracteres'),
  cnpj: z
    .string()
    .optional()
    .transform((v, ctx) => {
      const c = somenteDigitos(v ?? '');
      if (c === '') return null;
      if (!cnpjValido(c)) {
        ctx.addIssue({ code: 'custom', message: 'CNPJ inválido: confira os números' });
        return z.NEVER;
      }
      return c;
    }),
  telefone: telefoneOpcional,
});
export type EmpreiteiraValidada = z.output<typeof empreiteiraSchema>;

/** Custo de mão de obra a partir de uma data. Produção exige a unidade. */
export const custoMaoObraSchema = z
  .object({
    tipo: z.enum(TIPOS_CUSTO_MAO_OBRA, { error: 'Escolha como a pessoa é paga' }),
    valor: z
      .union([z.string(), z.number()])
      .transform((v, ctx) => {
        const n = typeof v === 'number' ? v : lerValorEmReais(v);
        if (n === null || Number.isNaN(n) || n <= 0) {
          ctx.addIssue({ code: 'custom', message: 'Informe um valor maior que zero' });
          return z.NEVER;
        }
        return Math.round(n * 100) / 100;
      }),
    vigente_desde: z.string().regex(DATA_ISO, 'Informe a data'),
    unidade_producao: textoOpcional(20),
  })
  .superRefine((c, ctx) => {
    if (c.tipo === 'producao' && !c.unidade_producao) {
      ctx.addIssue({ code: 'custom', path: ['unidade_producao'], message: 'Informe a unidade (ex.: m², m³, un)' });
    }
  })
  .transform((c) => (c.tipo === 'producao' ? c : { ...c, unidade_producao: null }));
export type CustoMaoObraValidado = z.output<typeof custoMaoObraSchema>;

/** Chamada do dia: cada pessoa presente com uma ou mais tarefas; ausente sem tarefa. */
export const chamadaSchema = z
  .array(
    z.object({
      trabalhador_id: z.string().uuid(),
      presente: z.boolean(),
      alocacoes: z
        .array(
          z.object({
            tarefa_id: z.string().uuid('Escolha a tarefa'),
            horas: z.number().gt(0, 'Horas maiores que zero').max(24, 'No máximo 24 h'),
            quantidade: z.number().min(0).nullable().default(null),
          }),
        )
        .default([]),
    }),
  )
  .min(1, 'A chamada está vazia')
  .max(500)
  .superRefine((linhas, ctx) => {
    linhas.forEach((l, i) => {
      if (!l.presente) return;
      if (l.alocacoes.length === 0) ctx.addIssue({ code: 'custom', path: [i, 'alocacoes'], message: 'Escolha a tarefa de quem veio' });
      const horas = l.alocacoes.reduce((s, a) => s + a.horas, 0);
      if (horas > 24) ctx.addIssue({ code: 'custom', path: [i, 'alocacoes'], message: 'Mais de 24 h no dia' });
    });
  });
export type ChamadaValidada = z.output<typeof chamadaSchema>;

/** Erros por campo, no formato que os formulários exibem. */
export function errosPorCampo(erro: z.ZodError): Record<string, string> {
  const saida: Record<string, string> = {};
  for (const issue of erro.issues) {
    const campo = issue.path.join('.') || '_';
    saida[campo] ??= issue.message;
  }
  return saida;
}
