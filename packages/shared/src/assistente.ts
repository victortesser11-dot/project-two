// Assistente da obra: o que vai junto de cada pergunta. O modelo não acessa o banco; recebe um retrato da obra em
// texto, montado no servidor só com o que a pessoa pode ver (custos só para quem vê custos).
import { z } from 'zod';
import type { Alerta, PrevisaoTempoDia } from './alertas';
import { descricaoTempo } from './alertas';
import { formatarData, formatarMoeda, somarDias } from './formato';
import { extrairJson } from './ia';

export interface TarefaContexto {
  codigo: string;
  nome: string;
  etapa: string | null;
  inicio: string | null;
  fim: string | null;
  percentual: number;
}

export interface ContextoObra {
  hoje: string;
  obra: {
    nome: string;
    endereco: string | null;
    situacao: string;
    inicio: string | null;
    fim: string | null;
    /** Ficha técnica preenchida (rótulo e valor), na ordem da tela. */
    ficha?: { rotulo: string; valor: string }[];
  };
  /** Avanço físico real e planejado para hoje (%), atraso pelo prazo agregado e término projetado. */
  prazo: { real: number; planejado: number; atrasoDias: number | null; fimProjetado: string | null; referencia: string } | null;
  etapas: { nome: string; real: number; planejado: number }[];
  tarefas: TarefaContexto[];
  alertas: Alerta[];
  previsao: PrevisaoTempoDia[];
  diarios: { data: string; status: string; efetivo: number; fotos: number }[];
  equipeHoje: number | null;
  materiais: { nome: string; quantidade: number; unidade: string; abaixoDoMinimo: boolean }[];
  arquivos: { nome: string; pasta: string }[];
  /** Resumo da última leitura dos projetos pela IA, se houver. */
  resumoProjeto: string | null;
  custos: { orcamento: number | null; previstoEap: number | null; realizado: number | null } | null;
}

export const LIMITE_MENSAGENS_ASSISTENTE = 20;
export const LIMITE_TEXTO_PERGUNTA = 2000;
const LIMITE_CONTEXTO = 40_000;

const pct = (n: number) => `${Math.round(n)}%`;
const data = (d: string | null) => (d ? formatarData(d) : 'sem data');

/** Tarefas que importam para a conversa: atrasadas, em andamento e as que começam nas próximas 3 semanas. */
export function tarefasRelevantes(tarefas: TarefaContexto[], hoje: string, max = 120): { titulo: string; lista: TarefaContexto[] }[] {
  const abertas = tarefas.filter((t) => t.percentual < 100);
  const atrasadas = abertas.filter((t) => t.fim && t.fim < hoje);
  const andamento = abertas.filter((t) => t.inicio && t.inicio <= hoje && (!t.fim || t.fim >= hoje));
  const proximas = abertas.filter((t) => t.inicio && t.inicio > hoje && t.inicio <= somarDias(hoje, 21));
  const porData = (a: TarefaContexto, b: TarefaContexto) => (a.inicio ?? '').localeCompare(b.inicio ?? '') || a.codigo.localeCompare(b.codigo, 'pt-BR', { numeric: true });
  return [
    { titulo: 'Atrasadas (deviam ter terminado)', lista: atrasadas.sort((a, b) => (a.fim ?? '').localeCompare(b.fim ?? '')).slice(0, max / 3) },
    { titulo: 'Em andamento hoje', lista: andamento.sort(porData).slice(0, max / 3) },
    { titulo: 'Começam nas próximas 3 semanas', lista: proximas.sort(porData).slice(0, max / 3) },
  ];
}

/** Retrato da obra em texto, para o modelo responder com os números certos. */
export function textoContextoObra(c: ContextoObra): string {
  const linhas: string[] = [];
  const o = c.obra;
  linhas.push(`# Obra ${o.nome}`, `Hoje: ${formatarData(c.hoje)}. Situação: ${o.situacao}.`);
  if (o.endereco) linhas.push(`Endereço: ${o.endereco}.`);
  linhas.push(`Prazo da obra: ${data(o.inicio)} a ${data(o.fim)}.`);
  if (o.ficha?.length) linhas.push(`Ficha técnica: ${o.ficha.map((f) => `${f.rotulo}: ${f.valor}`).join('; ')}.`);
  if (c.prazo) {
    const atraso =
      c.prazo.atrasoDias === null ? 'sem medida de atraso' : c.prazo.atrasoDias > 0 ? `${c.prazo.atrasoDias} dias de atraso` : c.prazo.atrasoDias < 0 ? `${-c.prazo.atrasoDias} dias adiantada` : 'no prazo';
    linhas.push(
      `Avanço físico: ${pct(c.prazo.real)} feito; o planejado para hoje era ${pct(c.prazo.planejado)} (${atraso}, comparado com ${c.prazo.referencia}).` +
        (c.prazo.fimProjetado ? ` Mantendo o ritmo, termina em ${formatarData(c.prazo.fimProjetado)}.` : ''),
    );
  }
  if (c.resumoProjeto) linhas.push('', '## O projeto (leitura das pranchas pela IA)', c.resumoProjeto);

  if (c.etapas.length) {
    linhas.push('', '## Etapas principais (real × planejado hoje)');
    for (const e of c.etapas) linhas.push(`- ${e.nome}: ${pct(e.real)} × ${pct(e.planejado)}`);
  }

  for (const grupo of tarefasRelevantes(c.tarefas, c.hoje)) {
    if (!grupo.lista.length) continue;
    linhas.push('', `## Tarefas: ${grupo.titulo}`);
    for (const t of grupo.lista) {
      linhas.push(`- ${t.codigo} ${t.nome}${t.etapa ? ` (${t.etapa})` : ''}: ${data(t.inicio)} a ${data(t.fim)}, ${pct(t.percentual)} feito`);
    }
  }

  if (c.alertas.length) {
    linhas.push('', '## Alertas agora');
    for (const a of c.alertas.slice(0, 30)) linhas.push(`- [${a.gravidade}] ${a.titulo}: ${a.detalhe}`);
  }

  if (c.previsao.length) {
    linhas.push('', '## Previsão do tempo na obra');
    for (const d of c.previsao) {
      linhas.push(
        `- ${formatarData(d.data)}: ${descricaoTempo(d.codigo).texto}, ${d.tmin ?? '?'}–${d.tmax ?? '?'} °C, chuva ${d.chuva_mm} mm` +
          `${d.probabilidade !== null ? ` (${Math.round(d.probabilidade)}%)` : ''}${d.rajada_kmh !== null ? `, rajadas ${Math.round(d.rajada_kmh)} km/h` : ''}`,
      );
    }
  }

  linhas.push('', '## Campo');
  linhas.push(`Pessoas na chamada de hoje: ${c.equipeHoje ?? 'sem chamada'}.`);
  if (c.diarios.length) {
    linhas.push('Diários dos últimos dias:');
    for (const d of c.diarios.slice(0, 7)) linhas.push(`- ${formatarData(d.data)}: ${d.status}, ${d.efetivo} pessoas no efetivo, ${d.fotos} fotos`);
  } else linhas.push('Nenhum diário de obra preenchido ainda.');

  if (c.materiais.length) {
    linhas.push('', '## Almoxarifado (saldo na obra)');
    for (const m of c.materiais.slice(0, 60)) linhas.push(`- ${m.nome}: ${m.quantidade} ${m.unidade}${m.abaixoDoMinimo ? ' (abaixo do mínimo)' : ''}`);
  }

  if (c.arquivos.length) {
    linhas.push('', '## Arquivos da obra');
    for (const a of c.arquivos.slice(0, 60)) linhas.push(`- ${a.nome} (${a.pasta})`);
  }

  if (c.custos) {
    linhas.push('', '## Custos');
    linhas.push(`Orçamento total: ${formatarMoeda(c.custos.orcamento)}. Custo previsto na EAP: ${formatarMoeda(c.custos.previstoEap)}.`);
    if (c.custos.realizado !== null) linhas.push(`Realizado até agora: ${formatarMoeda(c.custos.realizado)}.`);
  }

  const texto = linhas.join('\n');
  return texto.length > LIMITE_CONTEXTO ? `${texto.slice(0, LIMITE_CONTEXTO)}\n(... dados cortados por tamanho)` : texto;
}

// ---------------------------------------------------------------- resposta em cartões

/** Telas da obra que o assistente pode indicar (slug da rota e rótulo do menu). */
export const SECOES_ASSISTENTE = {
  hoje: 'Hoje',
  cronograma: 'Cronograma',
  alertas: 'Alertas',
  diario: 'Diário de obra',
  almoxarifado: 'Almoxarifado',
  equipe: 'Equipe',
  orcamento: 'Orçamento',
  medicao: 'Medição',
  arquivos: 'Arquivos',
  fiscal: 'Fiscal da obra',
  cameras: 'Câmeras',
} as const;
export type SecaoAssistente = keyof typeof SECOES_ASSISTENTE;

const ehSecao = (v: unknown): v is SecaoAssistente => typeof v === 'string' && v in SECOES_ASSISTENTE;
const textoLivre = (max: number) =>
  z
    .unknown()
    .optional()
    .transform((v) => (typeof v === 'string' ? v.trim().slice(0, max) : typeof v === 'number' ? String(v) : ''));
const secaoOuNula = z
  .unknown()
  .optional()
  .transform((v) => {
    const s = typeof v === 'string' ? v.trim().toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/[^a-z]/g, '') : '';
    return ehSecao(s) ? s : null;
  });
const listaDe = <T extends z.ZodType>(item: T, max: number) =>
  z
    .unknown()
    .optional()
    .transform((v) => (Array.isArray(v) ? v : []))
    .pipe(z.array(item))
    .transform((l) => l.slice(0, max));

/** Resposta do assistente em JSON, validada com folga: campo faltando ou tipo trocado não derruba a resposta. */
export const respostaAssistenteSchema = z.object({
  resumo: textoLivre(800),
  itens: listaDe(
    z
      .unknown()
      .transform((v) => (v && typeof v === 'object' ? v : {}))
      .pipe(
        z.object({
          titulo: textoLivre(200),
          detalhe: textoLivre(600),
          tarefa: textoLivre(20).transform((v) => (/^\d+(\.\d+)*$/.test(v) ? v : null)),
          secao: secaoOuNula,
          gravidade: z
            .unknown()
            .optional()
            .transform((v) => (v === 'alta' || v === 'media' || v === 'baixa' ? v : null)),
        }),
      ),
    8,
  ).transform((l) => l.filter((i) => i.titulo || i.detalhe)),
  texto_pronto: textoLivre(6000).transform((v) => v || null),
  fontes: listaDe(secaoOuNula, 8).transform((l) => [...new Set(l.filter((s): s is SecaoAssistente => s !== null))]),
  sugestoes: listaDe(textoLivre(140), 3).transform((l) => l.filter(Boolean)),
});
export type RespostaAssistente = z.output<typeof respostaAssistenteSchema>;
export type ItemRespostaAssistente = RespostaAssistente['itens'][number];

/** Lê a resposta do modelo. Sem JSON aproveitável devolve null (a tela mostra o texto como veio). */
export function lerRespostaAssistente(bruto: string): RespostaAssistente | null {
  const json = extrairJson(bruto);
  if (!json || typeof json !== 'object') return null;
  const r = respostaAssistenteSchema.safeParse(json);
  if (!r.success) return null;
  if (!r.data.resumo && r.data.itens.length === 0 && !r.data.texto_pronto) return null;
  return r.data;
}

/**
 * Liga cada item a uma tela: o que o modelo indicou; senão, a tarefa citada abre em "Hoje" se já devia ter começado e
 * não terminou, e no "Cronograma" se ainda vai começar. Tarefa que não existe na obra perde o código (o modelo errou).
 */
export function ligarItensAssistente(
  r: RespostaAssistente,
  tarefas: Pick<TarefaContexto, 'codigo' | 'inicio' | 'percentual'>[],
  hoje: string,
): RespostaAssistente {
  const porCodigo = new Map(tarefas.map((t) => [t.codigo, t]));
  return {
    ...r,
    itens: r.itens.map((i) => {
      const t = i.tarefa ? porCodigo.get(i.tarefa) : undefined;
      if (!t) return { ...i, tarefa: null };
      const secao = i.secao ?? (t.inicio && t.inicio <= hoje && t.percentual < 100 ? 'hoje' : 'cronograma');
      return { ...i, secao };
    }),
  };
}

/** Versão em texto da resposta: vai no histórico da conversa e no "Copiar". */
export function textoDaResposta(r: RespostaAssistente): string {
  const linhas: string[] = [];
  if (r.resumo) linhas.push(r.resumo);
  for (const i of r.itens) linhas.push(`- ${i.tarefa ? `${i.tarefa} ` : ''}${i.titulo}${i.titulo && i.detalhe ? ': ' : ''}${i.detalhe}`);
  if (r.texto_pronto) linhas.push('', r.texto_pronto);
  return linhas.join('\n').trim();
}

/** Instrução fixa do assistente. */
export function instrucaoAssistente(contexto: string): string {
  return `Você é o assistente de uma obra de construção civil no Brasil, dentro do app Controle de Obras. Quem pergunta é o engenheiro, o mestre de obras ou alguém da equipe.

Regras:
- Responda em português do Brasil, direto e curto, em linguagem de obra.
- Use só os dados da obra abaixo. Se a resposta não estiver neles, diga o que falta e em qual tela do app lançar.
- Não invente números, datas nem nomes. Quando falar de uma tarefa, ponha o código dela (ex.: 1.4.4) no campo "tarefa".
- Pode sugerir prioridades, ordem de serviços e cuidados de segurança, deixando claro que é sugestão.
- Para mudar dados (avanço, datas, materiais), indique a tela: você não altera nada.

Responda SEMPRE com um único objeto JSON, sem texto fora dele:
{
  "resumo": "a resposta em 1 ou 2 frases",
  "itens": [
    { "titulo": "curto, até 8 palavras", "detalhe": "uma frase com o número ou a data que importa", "tarefa": "1.4.4 ou null", "secao": "tela onde resolver ou null", "gravidade": "alta, media, baixa ou null" }
  ],
  "texto_pronto": "só quando pedirem um texto (resumo para o cliente, recado): o texto pronto para copiar; senão null",
  "fontes": ["telas de onde vieram os dados"],
  "sugestoes": ["até 3 próximas perguntas curtas que façam sentido depois desta resposta"]
}
- "itens": de 0 a 6, um por assunto, na ordem do que fazer primeiro. Pergunta simples pode ter só o resumo.
- "secao" e "fontes" só com estes nomes: ${Object.keys(SECOES_ASSISTENTE).join(', ')}.
- "gravidade": alta = urgente (atraso que trava outras frentes, risco de segurança), media = atenção, baixa = informação.

Dados da obra:
${contexto}`;
}
