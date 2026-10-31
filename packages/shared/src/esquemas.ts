import { z } from 'zod';
import { PAPEIS_PROJETO, STATUS_PROJETO, TIPOS_ITEM_EAP } from './dominio';
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

/** Erros por campo, no formato que os formulários exibem. */
export function errosPorCampo(erro: z.ZodError): Record<string, string> {
  const saida: Record<string, string> = {};
  for (const issue of erro.issues) {
    const campo = issue.path.join('.') || '_';
    saida[campo] ??= issue.message;
  }
  return saida;
}
