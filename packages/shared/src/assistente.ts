// Assistente da obra: o que vai junto de cada pergunta. O modelo não acessa o banco; recebe um retrato da obra em
// texto, montado no servidor só com o que a pessoa pode ver (custos só para quem vê custos).
import type { Alerta, PrevisaoTempoDia } from './alertas';
import { descricaoTempo } from './alertas';
import { formatarData, formatarMoeda, somarDias } from './formato';

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
  obra: { nome: string; endereco: string | null; situacao: string; inicio: string | null; fim: string | null };
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

/** Instrução fixa do assistente. */
export function instrucaoAssistente(contexto: string): string {
  return `Você é o assistente de uma obra de construção civil no Brasil, dentro do app Controle de Obras. Quem pergunta é o engenheiro, o mestre de obras ou alguém da equipe.

Regras:
- Responda em português do Brasil, direto e curto, em linguagem de obra. Use listas curtas quando ajudar.
- Use só os dados da obra abaixo. Se a resposta não estiver neles, diga o que falta e onde lançar no app (Cronograma, Hoje, Diário de obra, Almoxarifado, Equipe, Orçamento, Arquivos, Alertas).
- Não invente números, datas nem nomes. Cite o código da tarefa (ex.: 1.4.4) quando falar de uma.
- Pode sugerir prioridades, ordem de serviços e cuidados de segurança, deixando claro que é sugestão.
- Para mudar dados (avanço, datas, materiais), explique onde fazer no app: você não altera nada.
- Se pedirem um texto para o cliente (resumo semanal, recado), escreva pronto para copiar.

Dados da obra:
${contexto}`;
}
