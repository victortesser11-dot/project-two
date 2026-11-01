import { z } from 'zod';
import {
  CLIMAS,
  PAPEIS_PROJETO,
  STATUS_PROJETO,
  TIPOS_CUSTO_MAO_OBRA,
  TIPOS_DEPENDENCIA,
  TIPOS_ITEM_EAP,
  TIPOS_ITEM_ESTOQUE,
  ORIGENS_CAMERA,
  CATEGORIAS_DESPESA,
  TIPOS_COMPROMISSO,
} from './dominio';
import { chaveNfeValida, cnpjValido, cpfValido, somenteDigitos } from './documentos';
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

// ---------------------------------------------------------------- almoxarifado (RF-401 a 404)

/** Quantidade digitada no padrão brasileiro ("2,5"), com até 4 casas, como no banco. */
const quantidade = (mensagem: string, { zeroPode = false } = {}) =>
  z.union([z.string(), z.number()]).transform((v, ctx) => {
    const n = lerNumero(v, ',');
    if (n === null || Number.isNaN(n) || n < 0 || (!zeroPode && n === 0)) {
      ctx.addIssue({ code: 'custom', message: mensagem });
      return z.NEVER;
    }
    return Math.round(n * 10000) / 10000;
  });

const uuidOpcional = z
  .union([z.string().uuid(), z.literal('')])
  .nullable()
  .optional()
  .transform((v) => (v ? v : null));

/** Item do catálogo da empresa. Ferramenta é sempre 1 unidade, sem estoque mínimo. */
export const itemEstoqueSchema = z
  .object({
    codigo: textoOpcional(30),
    nome: z.string().trim().min(2, 'Informe o nome do item').max(200, 'Use no máximo 200 caracteres'),
    tipo: z.enum(TIPOS_ITEM_ESTOQUE, { error: 'Escolha material ou ferramenta' }),
    unidade: z.string().trim().max(20, 'Use no máximo 20 caracteres').default('un'),
    categoria: textoOpcional(80),
    estoque_minimo: numeroNaoNegativo(4),
    patrimonio: textoOpcional(40),
    ncm: z
      .string()
      .optional()
      .transform((v, ctx) => {
        const c = somenteDigitos(v ?? '');
        if (c === '') return null;
        if (c.length !== 8) {
          ctx.addIssue({ code: 'custom', message: 'O NCM tem 8 dígitos' });
          return z.NEVER;
        }
        return c;
      }),
  })
  .superRefine((i, ctx) => {
    if (i.tipo === 'material' && i.unidade === '') {
      ctx.addIssue({ code: 'custom', path: ['unidade'], message: 'Informe a unidade (ex.: sc, kg, m³)' });
    }
  })
  .transform((i) =>
    i.tipo === 'ferramenta'
      ? { ...i, unidade: 'un', estoque_minimo: 0 }
      : { ...i, estoque_minimo: i.estoque_minimo ?? 0, patrimonio: null },
  );
export type ItemEstoqueValidado = z.output<typeof itemEstoqueSchema>;

/** Uma linha de entrada (digitada ou vinda da NF-e). */
export const linhaEntradaSchema = z.object({
  item_id: z.string().uuid('Escolha o item do catálogo'),
  quantidade: quantidade('Quantidade maior que zero'),
  valor_unitario: quantidade('Valor não pode ser negativo', { zeroPode: true }),
  codigo_fornecedor: textoOpcional(60),
});

/** Entrada no almoxarifado: uma nota (ou uma compra avulsa) com uma ou mais linhas. */
export const entradaSchema = z.object({
  data: z.string().regex(DATA_ISO, 'Informe a data da entrada'),
  fornecedor: textoOpcional(160),
  cnpj_fornecedor: z
    .string()
    .nullable()
    .optional()
    .transform((v, ctx) => {
      const c = somenteDigitos(v ?? '');
      if (c === '') return null;
      if (!cnpjValido(c)) {
        ctx.addIssue({ code: 'custom', message: 'CNPJ do fornecedor inválido' });
        return z.NEVER;
      }
      return c;
    }),
  nota_fiscal: textoOpcional(40),
  chave_nfe: z
    .string()
    .nullable()
    .optional()
    .transform((v, ctx) => {
      const c = somenteDigitos(v ?? '');
      if (c === '') return null;
      if (!chaveNfeValida(c)) {
        ctx.addIssue({ code: 'custom', message: 'Chave da NF-e inválida: confira os 44 dígitos' });
        return z.NEVER;
      }
      return c;
    }),
  itens: z.array(linhaEntradaSchema).min(1, 'Inclua pelo menos um item').max(500, 'No máximo 500 linhas por entrada'),
});
export type EntradaValidada = z.output<typeof entradaSchema>;

/** Saída de material: sempre para uma tarefa da obra. */
export const saidaSchema = z.object({
  item_id: z.string().uuid('Escolha o material'),
  data: z.string().regex(DATA_ISO, 'Informe a data'),
  quantidade: quantidade('Quantidade maior que zero'),
  tarefa_id: z.string({ error: 'Escolha a tarefa que vai usar o material' }).uuid('Escolha a tarefa que vai usar o material'),
  trabalhador_id: uuidOpcional,
  responsavel: textoOpcional(160),
  observacao: textoOpcional(500),
});
export type SaidaValidada = z.output<typeof saidaSchema>;

/** Inventário: a quantidade contada substitui o saldo, com motivo. */
export const ajusteSchema = z.object({
  item_id: z.string().uuid('Escolha o material'),
  data: z.string().regex(DATA_ISO, 'Informe a data'),
  quantidade_contada: quantidade('Informe a quantidade contada (zero ou mais)', { zeroPode: true }),
  motivo: z.string().trim().min(3, 'Informe o motivo (ex.: inventário, perda, quebra)').max(500, 'Use no máximo 500 caracteres'),
});
export type AjusteValidado = z.output<typeof ajusteSchema>;

/** Empréstimo de ferramenta: para uma pessoa da equipe ou um nome livre. */
export const emprestimoSchema = z
  .object({
    item_id: z.string().uuid('Escolha a ferramenta'),
    trabalhador_id: uuidOpcional,
    responsavel: textoOpcional(160),
    devolver_ate: dataOpcional,
    observacao: textoOpcional(500),
  })
  .superRefine((e, ctx) => {
    if (!e.trabalhador_id && !e.responsavel) {
      ctx.addIssue({ code: 'custom', path: ['responsavel'], message: 'Escolha a pessoa ou escreva com quem a ferramenta vai ficar' });
    }
  });
export type EmprestimoValidado = z.output<typeof emprestimoSchema>;

// ---------------------------------------------------------------- câmeras (RF-101 a 102)

const HORA = /^([01]\d|2[0-3]):[0-5]\d$/;

/** Cadastro da câmera. Senha vazia mantém a guardada; "remover_senha" apaga. */
export const cameraSchema = z
  .object({
    nome: z.string().trim().min(2, 'Informe o nome da câmera (ex.: Fachada, Pátio)').max(80, 'Use no máximo 80 caracteres'),
    origem: z.enum(ORIGENS_CAMERA, { error: 'Escolha como a foto chega' }),
    agente_id: uuidOpcional,
    endereco: textoOpcional(500),
    usuario: textoOpcional(80),
    senha: z.string().max(128, 'Senha longa demais (até 128 caracteres)').optional().transform((v) => v ?? ''),
    remover_senha: simNao,
    horarios: z
      .array(z.string().trim())
      .transform((l) => [...new Set(l.filter((h) => h !== ''))].sort())
      .refine((l) => l.every((h) => HORA.test(h)), 'Horário inválido: use HH:MM')
      .refine((l) => l.length >= 1 && l.length <= 4, 'Escolha de 1 a 4 horários por dia'),
    ativa: simNao,
  })
  .superRefine((c, ctx) => {
    if (c.origem !== 'agente') return;
    if (!c.agente_id) ctx.addIssue({ code: 'custom', path: ['agente_id'], message: 'Escolha o agente da obra' });
    if (!c.endereco) ctx.addIssue({ code: 'custom', path: ['endereco'], message: 'Informe o endereço da foto' });
    else if (!/^(https?|rtsp):\/\/\S+$/i.test(c.endereco))
      ctx.addIssue({ code: 'custom', path: ['endereco'], message: 'O endereço começa com http://, https:// ou rtsp://' });
  });
export type CameraValidada = z.output<typeof cameraSchema>;

// ---------------------------------------------------------------- orçamento (RF-501 a 504, 602)

/** Valor em reais digitado ("1.234,56", "R$ 500"): vazio = null; com `positivo`, exige > 0. */
const reais = ({ positivo = false, obrigatorio = false } = {}) =>
  z
    .union([z.string(), z.number()])
    .nullable()
    .optional()
    .transform((v, ctx) => {
      const n = v === null || v === undefined ? null : typeof v === 'number' ? v : lerValorEmReais(v);
      if (n === null) {
        if (obrigatorio) {
          ctx.addIssue({ code: 'custom', message: 'Informe o valor' });
          return z.NEVER;
        }
        return null;
      }
      if (Number.isNaN(n)) {
        ctx.addIssue({ code: 'custom', message: 'Valor inválido' });
        return z.NEVER;
      }
      if (positivo ? n <= 0 : n < 0) {
        ctx.addIssue({ code: 'custom', message: positivo ? 'O valor precisa ser maior que zero' : 'Não pode ser negativo' });
        return z.NEVER;
      }
      return Math.round(n * 100) / 100;
    });

/** Composição do custo da tarefa. Tudo vazio = tirar a composição. */
export const composicaoSchema = z.object({
  material: reais(),
  mao_obra: reais(),
  equipamento: reais(),
  outros: reais(),
});
export type ComposicaoValidada = z.output<typeof composicaoSchema>;

export const versaoOrcamentoSchema = z.object({
  nome: z.string().trim().min(2, 'Dê um nome à versão (ex.: Orçamento aprovado, Revisão 1)').max(80, 'Use no máximo 80 caracteres'),
});

export const despesaSchema = z.object({
  tarefa_id: z.string({ error: 'Escolha a tarefa da despesa' }).uuid('Escolha a tarefa da despesa'),
  data: z.string().regex(DATA_ISO, 'Informe a data'),
  categoria: z.enum(CATEGORIAS_DESPESA, { error: 'Escolha o tipo da despesa' }),
  descricao: z.string().trim().min(2, 'Descreva a despesa').max(200, 'Use no máximo 200 caracteres'),
  valor: reais({ positivo: true, obrigatorio: true }),
  fornecedor: textoOpcional(160),
  documento: textoOpcional(60),
  compromisso_id: uuidOpcional,
});
export type DespesaValidada = z.output<typeof despesaSchema>;

export const compromissoSchema = z.object({
  tarefa_id: z.string({ error: 'Escolha a tarefa' }).uuid('Escolha a tarefa'),
  tipo: z.enum(TIPOS_COMPROMISSO, { error: 'Escolha contrato ou pedido' }),
  descricao: z.string().trim().min(2, 'Descreva o contrato ou pedido').max(200, 'Use no máximo 200 caracteres'),
  fornecedor: textoOpcional(160),
  cnpj: z
    .string()
    .nullable()
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
  empreiteira_id: uuidOpcional,
  valor: reais({ positivo: true, obrigatorio: true }),
  data: z.string().regex(DATA_ISO, 'Informe a data'),
});
export type CompromissoValidado = z.output<typeof compromissoSchema>;

const inteiroNaoNegativo = (mensagem: string) =>
  z.union([z.string(), z.number()]).transform((v, ctx) => {
    const n = typeof v === 'number' ? v : Number(String(v).trim());
    if (!Number.isInteger(n) || n < 0) {
      ctx.addIssue({ code: 'custom', message: mensagem });
      return z.NEVER;
    }
    return n;
  });

export const regraSemaforoSchema = z
  .object({
    atraso_amarelo_dias: inteiroNaoNegativo('Dias inteiros, zero ou mais'),
    atraso_vermelho_dias: inteiroNaoNegativo('Dias inteiros, zero ou mais'),
    custo_amarelo_pct: numeroEntre(0, 1000, 2, 'Percentual de 0 a 1000').refine((v) => v !== null, 'Informe o percentual'),
    custo_vermelho_pct: numeroEntre(0, 1000, 2, 'Percentual de 0 a 1000').refine((v) => v !== null, 'Informe o percentual'),
  })
  .superRefine((r, ctx) => {
    if (r.atraso_vermelho_dias < r.atraso_amarelo_dias)
      ctx.addIssue({ code: 'custom', path: ['atraso_vermelho_dias'], message: 'O vermelho precisa de mais dias que o amarelo' });
    if ((r.custo_vermelho_pct ?? 0) < (r.custo_amarelo_pct ?? 0))
      ctx.addIssue({ code: 'custom', path: ['custo_vermelho_pct'], message: 'O vermelho precisa de um percentual maior que o amarelo' });
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
