// Alertas da obra, calculados na hora a partir dos dados (nada gravado além das justificativas).
// Cronograma (tarefa atrasada, com sugestão de causa), chuva prevista em tarefa sensível, material
// acabando, medição vencida ou parada, câmera, ferramenta e diário.
import { ROTULO_CAUSA_ATRASO, type CausaAtraso, type Clima, type JustificativaAtraso } from './dominio';
import { dataDoInstante, diasEntre, formatarData, formatarMoeda, somarDias } from './formato';

export type GravidadeAlerta = 'alta' | 'media' | 'baixa';
export type SecaoAlerta = 'defesa_civil' | 'cronograma' | 'clima' | 'almoxarifado' | 'financeiro' | 'cameras' | 'diario';

export interface Alerta {
  /** Estável entre cargas (para a lista e para não repetir). */
  chave: string;
  secao: SecaoAlerta;
  gravidade: GravidadeAlerta;
  titulo: string;
  detalhe: string;
  /** Caminho dentro da obra para resolver (ex.: "cronograma", "orcamento/medicoes/<id>"). */
  caminho?: string;
  tarefaId?: string;
  diasAtraso?: number;
  justificativa?: JustificativaAtraso;
  sugestao?: { causa: CausaAtraso; motivo: string };
  /** Endereço externo com as orientações (ex.: página da Defesa Civil). */
  link?: string;
}

export const ROTULO_SECAO_ALERTA: Record<SecaoAlerta, string> = {
  defesa_civil: 'Defesa Civil',
  cronograma: 'Cronograma',
  clima: 'Clima',
  almoxarifado: 'Almoxarifado',
  financeiro: 'Medições',
  cameras: 'Câmeras',
  diario: 'Diário de obra',
};

const PESO: Record<GravidadeAlerta, number> = { alta: 0, media: 1, baixa: 2 };
export function ordenarAlertas(alertas: Alerta[]): Alerta[] {
  return [...alertas].sort((a, b) => PESO[a.gravidade] - PESO[b.gravidade] || (b.diasAtraso ?? 0) - (a.diasAtraso ?? 0) || a.titulo.localeCompare(b.titulo, 'pt-BR'));
}

const plural = (n: number, um: string, varios: string) => `${n} ${n === 1 ? um : varios}`;

// ---------------------------------------------------------------- cronograma

export interface TarefaAlerta {
  id: string;
  codigo: string;
  nome: string;
  inicio_previsto: string | null;
  fim_previsto: string | null;
  percentual_fisico: number | null;
  /** Etapa logo acima (ex.: "Torre A 4º Pavimento"): distingue tarefas de mesmo nome em pavimentos diferentes. */
  etapa?: string | null;
}

/** "1.4.4 Alvenaria lado 2 (Torre A 4º Pavimento)". */
function tituloDaTarefa(t: Pick<TarefaAlerta, 'codigo' | 'nome' | 'etapa'>): string {
  return `${t.codigo} ${t.nome}${t.etapa ? ` (${t.etapa})` : ''}`;
}

export interface DiarioAlerta {
  id: string;
  data: string;
  status: 'rascunho' | 'assinado';
  clima_manha: Clima | null;
  clima_tarde: Clima | null;
}

/**
 * Tarefa que já devia ter terminado, que devia ter começado e não começou, ou que está muito abaixo do
 * ritmo (25 pontos abaixo do avanço linear). Justificada depois que o atraso começou: vira aviso baixo.
 * Sugere a causa pelo diário (dias de chuva forte na janela da tarefa) e pelo almoxarifado.
 */
export function alertasCronograma({
  tarefas,
  justificativas,
  diarios,
  itensAbaixoDoMinimo,
  hoje,
}: {
  tarefas: TarefaAlerta[];
  justificativas: JustificativaAtraso[];
  diarios: DiarioAlerta[];
  itensAbaixoDoMinimo: number;
  hoje: string;
}): Alerta[] {
  const ultimaJust = new Map<string, JustificativaAtraso>();
  for (const j of justificativas) {
    const atual = ultimaJust.get(j.tarefa_id);
    if (!atual || j.criado_em > atual.criado_em) ultimaJust.set(j.tarefa_id, j);
  }
  const saida: Alerta[] = [];
  for (const t of tarefas) {
    const pct = Number(t.percentual_fisico ?? 0);
    if (!t.inicio_previsto || !t.fim_previsto || pct >= 100 || t.inicio_previsto > hoje) continue;
    let tipo: 'fim' | 'inicio' | 'ritmo' | null = null;
    let atraso = 0;
    let desde = t.inicio_previsto;
    let detalhe = '';
    if (t.fim_previsto < hoje) {
      tipo = 'fim';
      atraso = diasEntre(t.fim_previsto, hoje);
      desde = t.fim_previsto;
      detalhe = `Devia ter terminado em ${formatarData(t.fim_previsto)} (há ${plural(atraso, 'dia', 'dias')}); está em ${Math.round(pct)}%.`;
    } else if (pct === 0 && diasEntre(t.inicio_previsto, hoje) >= 2) {
      tipo = 'inicio';
      atraso = diasEntre(t.inicio_previsto, hoje);
      detalhe = `Devia ter começado em ${formatarData(t.inicio_previsto)} (há ${plural(atraso, 'dia', 'dias')}) e não tem avanço apontado.`;
    } else {
      const dur = diasEntre(t.inicio_previsto, t.fim_previsto) + 1;
      const esperado = Math.min(100, ((diasEntre(t.inicio_previsto, hoje) + 1) / dur) * 100);
      if (dur >= 5 && pct < esperado - 25) {
        tipo = 'ritmo';
        atraso = Math.round(((esperado - pct) / 100) * dur);
        detalhe = `Abaixo do ritmo: ${Math.round(pct)}% feito, o esperado para hoje era ${Math.round(esperado)}% (cerca de ${plural(atraso, 'dia', 'dias')} de atraso).`;
      }
    }
    if (!tipo) continue;

    const j = ultimaJust.get(t.id);
    const justificada = j && dataDoInstante(j.criado_em) >= desde ? j : undefined;
    const fimJanela = t.fim_previsto < hoje ? t.fim_previsto : somarDias(hoje, -1);
    const chuvosos = diarios.filter(
      (d) => d.data >= t.inicio_previsto! && d.data <= fimJanela && (d.clima_manha === 'chuva_forte' || d.clima_tarde === 'chuva_forte'),
    ).length;
    const sugestao: Alerta['sugestao'] =
      chuvosos > 0
        ? { causa: 'chuva', motivo: `${plural(chuvosos, 'dia', 'dias')} de chuva forte no período, pelo diário de obra` }
        : itensAbaixoDoMinimo > 0
          ? { causa: 'material', motivo: `${plural(itensAbaixoDoMinimo, 'item', 'itens')} abaixo do mínimo no almoxarifado` }
          : undefined;

    saida.push({
      chave: `tarefa:${t.id}`,
      secao: 'cronograma',
      gravidade: justificada ? 'baixa' : atraso >= 7 || tipo === 'fim' ? 'alta' : 'media',
      titulo: tituloDaTarefa(t),
      detalhe: justificada
        ? `${detalhe} Justificado: ${ROTULO_CAUSA_ATRASO[justificada.causa].toLowerCase()} — ${justificada.descricao}`
        : detalhe,
      caminho: 'cronograma/gantt',
      tarefaId: t.id,
      diasAtraso: atraso,
      justificativa: justificada,
      sugestao,
    });
  }
  return saida;
}

// ---------------------------------------------------------------- clima

export interface PrevisaoDia {
  data: string;
  chuva_mm: number;
  probabilidade: number | null;
}

/** Previsão completa do dia (Open-Meteo). Campo que a API não mandou fica null. */
export interface PrevisaoTempoDia extends PrevisaoDia {
  /** Código WMO do tempo (0 céu limpo ... 95–99 trovoada). */
  codigo: number | null;
  tmax: number | null;
  tmin: number | null;
  vento_kmh: number | null;
  rajada_kmh: number | null;
}

export type IconeTempo = 'sol' | 'sol-nuvem' | 'nuvem' | 'nevoa' | 'garoa' | 'chuva' | 'neve' | 'tempestade';

/** Código WMO → texto curto em português e o desenho. */
export function descricaoTempo(codigo: number | null): { texto: string; icone: IconeTempo } {
  switch (codigo) {
    case 0: return { texto: 'Céu limpo', icone: 'sol' };
    case 1: return { texto: 'Predomínio de sol', icone: 'sol' };
    case 2: return { texto: 'Parcialmente nublado', icone: 'sol-nuvem' };
    case 3: return { texto: 'Nublado', icone: 'nuvem' };
    case 45: case 48: return { texto: 'Nevoeiro', icone: 'nevoa' };
    case 51: case 53: case 55: return { texto: 'Garoa', icone: 'garoa' };
    case 56: case 57: return { texto: 'Garoa congelante', icone: 'garoa' };
    case 61: return { texto: 'Chuva fraca', icone: 'chuva' };
    case 63: return { texto: 'Chuva moderada', icone: 'chuva' };
    case 65: return { texto: 'Chuva forte', icone: 'chuva' };
    case 66: case 67: return { texto: 'Chuva congelante', icone: 'chuva' };
    case 71: case 73: case 75: case 77: case 85: case 86: return { texto: 'Neve', icone: 'neve' };
    case 80: return { texto: 'Pancadas de chuva', icone: 'chuva' };
    case 81: return { texto: 'Pancadas moderadas', icone: 'chuva' };
    case 82: return { texto: 'Pancadas fortes', icone: 'chuva' };
    case 95: return { texto: 'Trovoadas', icone: 'tempestade' };
    case 96: case 99: return { texto: 'Trovoadas com granizo', icone: 'tempestade' };
    default: return { texto: 'Sem informação', icone: 'nuvem' };
  }
}

/** Pedido de 7 dias ao Open-Meteo (sem chave), em km/h e no fuso de Brasília. */
export function urlPrevisaoTempo(latitude: number, longitude: number): string {
  const q = new URLSearchParams({
    latitude: latitude.toFixed(4),
    longitude: longitude.toFixed(4),
    daily: 'weather_code,temperature_2m_max,temperature_2m_min,precipitation_sum,precipitation_probability_max,wind_speed_10m_max,wind_gusts_10m_max',
    timezone: 'America/Sao_Paulo',
    forecast_days: '7',
    wind_speed_unit: 'kmh',
  });
  return `https://api.open-meteo.com/v1/forecast?${q.toString()}`;
}

/** Lê a resposta do Open-Meteo; resposta estranha ou de erro vira lista vazia. */
export function lerPrevisaoTempo(json: unknown): PrevisaoTempoDia[] {
  const d = (json as { daily?: Record<string, unknown[]> } | null)?.daily;
  const dias = d?.time;
  if (!Array.isArray(dias)) return [];
  const num = (campo: string, i: number) => {
    const v = (d?.[campo] as unknown[] | undefined)?.[i];
    return typeof v === 'number' && Number.isFinite(v) ? v : null;
  };
  return dias.flatMap((data, i) =>
    typeof data === 'string'
      ? [{
          data,
          codigo: num('weather_code', i),
          tmax: num('temperature_2m_max', i),
          tmin: num('temperature_2m_min', i),
          chuva_mm: num('precipitation_sum', i) ?? 0,
          probabilidade: num('precipitation_probability_max', i),
          vento_kmh: num('wind_speed_10m_max', i),
          rajada_kmh: num('wind_gusts_10m_max', i),
        }]
      : [],
  );
}

/** Limites dos avisos de tempo para o canteiro. */
export const LIMITES_TEMPO = { rajadaForte: 45, vendaval: 60, calor: 35, frio: 3 } as const;

/**
 * Tempo que pede cuidado no canteiro nos próximos 3 dias: vendaval (içamento e trabalho em altura), trovoada,
 * calor forte e frio (concretagem). A chuva em tarefa sensível tem regra própria (alertasChuva).
 */
export function alertasTempo({ previsao, hoje }: { previsao: PrevisaoTempoDia[]; hoje: string }): Alerta[] {
  const saida: Alerta[] = [];
  for (const d of previsao) {
    if (d.data < hoje || d.data > somarDias(hoje, 2)) continue;
    const quando = d.data === hoje ? 'hoje' : d.data === somarDias(hoje, 1) ? 'amanhã' : formatarData(d.data);
    const rajada = d.rajada_kmh ?? 0;
    if (rajada >= LIMITES_TEMPO.rajadaForte) {
      const forte = rajada >= LIMITES_TEMPO.vendaval;
      saida.push({
        chave: `vento:${d.data}`,
        secao: 'clima',
        gravidade: forte ? 'alta' : 'media',
        titulo: `${forte ? 'Vendaval' : 'Vento forte'} ${quando}: rajadas de até ${Math.round(rajada)} km/h`,
        detalhe: forte
          ? 'Suspenda içamento com grua ou guincho e o trabalho em altura enquanto durar o vento; amarre tapumes, telhas e materiais soltos.'
          : 'Avalie o içamento de cargas e o trabalho em altura; prenda lonas, tapumes e materiais leves.',
      });
    }
    if (d.codigo !== null && d.codigo >= 95) {
      saida.push({
        chave: `trovoada:${d.data}`,
        secao: 'clima',
        gravidade: d.codigo >= 96 ? 'alta' : 'media',
        titulo: `${descricaoTempo(d.codigo).texto} ${quando}`,
        detalhe: 'Durante a trovoada, ninguém em cobertura, andaime, estrutura metálica ou máquina em campo aberto. Desligue equipamentos expostos.',
      });
    }
    if (d.tmax !== null && d.tmax >= LIMITES_TEMPO.calor) {
      saida.push({
        chave: `calor:${d.data}`,
        secao: 'clima',
        gravidade: 'media',
        titulo: `Calor forte ${quando}: até ${Math.round(d.tmax)} °C`,
        detalhe: 'Água e sombra para a equipe, pausas no pico do sol. Concreto e argamassa perdem água rápido: molhe a cura e evite concretar no meio do dia.',
      });
    }
    if (d.tmin !== null && d.tmin <= LIMITES_TEMPO.frio) {
      saida.push({
        chave: `frio:${d.data}`,
        secao: 'clima',
        gravidade: 'baixa',
        titulo: `Frio ${quando}: mínima de ${Math.round(d.tmin)} °C`,
        detalhe: 'Concreto lançado com frio ganha resistência mais devagar: proteja a peça e confira a desforma.',
      });
    }
  }
  return saida;
}

// ---------------------------------------------------------------- Defesa Civil

/** Alerta da Defesa Civil em vigor, como o banco devolve para a obra (alertas_defesa_civil_da_obra). */
export interface AlertaDefesaCivil {
  id: string;
  remetente: string | null;
  evento: string;
  severidade: string | null;
  urgencia: string | null;
  titulo: string | null;
  descricao: string | null;
  instrucao: string | null;
  link: string | null;
  area: string | null;
  inicio: string | null;
  fim: string | null;
  /** O ponto da obra está dentro da área do alerta (null: obra sem localização). */
  na_obra: boolean | null;
}

const ROTULO_SEVERIDADE: Record<string, string> = { Extreme: 'risco extremo', Severe: 'risco alto', Moderate: 'risco moderado', Minor: 'risco baixo' };

/** "CHUVAS INTENSAS" → "Chuvas intensas". */
function frase(texto: string): string {
  const t = texto.trim().toLocaleLowerCase('pt-BR');
  return t.charAt(0).toLocaleUpperCase('pt-BR') + t.slice(1);
}

function quandoAcaba(fim: string | null): string {
  if (!fim) return '';
  const d = new Date(fim);
  if (Number.isNaN(d.getTime())) return '';
  const partes = new Intl.DateTimeFormat('pt-BR', { timeZone: 'America/Sao_Paulo', day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }).formatToParts(d);
  const p = (t: string) => partes.find((x) => x.type === t)?.value ?? '';
  return ` Vale até ${p('day')}/${p('month')} às ${p('hour')}h${p('minute')}.`;
}

/** Só os alertas cuja área inclui a obra viram alerta da obra. Risco extremo e alto: urgente. */
export function alertasDefesaCivil(lista: AlertaDefesaCivil[]): Alerta[] {
  return lista
    .filter((a) => a.na_obra === true)
    .map((a) => {
      const sev = a.severidade ?? '';
      const risco = ROTULO_SEVERIDADE[sev];
      return {
        chave: `defesa-civil:${a.id}`,
        secao: 'defesa_civil' as const,
        gravidade: sev === 'Extreme' || sev === 'Severe' ? 'alta' : sev === 'Moderate' ? 'media' : 'baixa',
        titulo: `${frase(a.evento)}${risco ? ` (${risco})` : ''}${a.area ? ` · ${a.area}` : ''}`,
        detalhe: [a.titulo?.replace(/^Defesa Civil:\s*/i, ''), quandoAcaba(a.fim).trim(), a.instrucao].filter(Boolean).join(' '),
        link: a.link ?? undefined,
      } satisfies Alerta;
    });
}


/** Serviços que a chuva para ou estraga. */
export const TAREFA_SENSIVEL_A_CHUVA =
  /concret|imperme|telha|cobertura|fachada|textura|pintura (extern|da fachada)|reboco extern|chapisco.*extern|escava|aterro|terraplen|asfalt|manta|laje|funda[cç]/i;

/** Chuva prevista (≥ 5 mm, ou chance ≥ 70% com ≥ 1 mm) nos próximos 3 dias em dia de tarefa sensível. */
export function alertasChuva({ tarefas, previsao, hoje }: { tarefas: TarefaAlerta[]; previsao: PrevisaoDia[]; hoje: string }): Alerta[] {
  const saida: Alerta[] = [];
  for (const d of previsao) {
    if (d.data < hoje || d.data > somarDias(hoje, 3)) continue;
    const chove = d.chuva_mm >= 5 || ((d.probabilidade ?? 0) >= 70 && d.chuva_mm >= 1);
    if (!chove) continue;
    const afetadas = tarefas.filter(
      (t) =>
        t.inicio_previsto && t.fim_previsto && t.inicio_previsto <= d.data && t.fim_previsto >= d.data &&
        Number(t.percentual_fisico ?? 0) < 100 && TAREFA_SENSIVEL_A_CHUVA.test(t.nome),
    );
    if (afetadas.length === 0) continue;
    const quando = d.data === hoje ? 'hoje' : d.data === somarDias(hoje, 1) ? 'amanhã' : formatarData(d.data);
    const chance = d.probabilidade !== null ? `, ${Math.round(d.probabilidade)}% de chance` : '';
    saida.push({
      chave: `chuva:${d.data}`,
      secao: 'clima',
      gravidade: d.chuva_mm >= 15 ? 'alta' : 'media',
      titulo: `Chuva prevista ${quando}: ${d.chuva_mm.toLocaleString('pt-BR', { maximumFractionDigits: 1 })} mm${chance}`,
      detalhe: `Programado para o dia: ${afetadas.map((t) => tituloDaTarefa(t)).slice(0, 4).join('; ')}${afetadas.length > 4 ? ` e mais ${afetadas.length - 4}` : ''}. Avalie remanejar a equipe ou proteger o serviço.`,
      caminho: 'cronograma/gantt',
    });
  }
  return saida;
}

// ---------------------------------------------------------------- almoxarifado

export interface ItemAlerta {
  id: string;
  codigo: string;
  nome: string;
  unidade: string;
  quantidade: number;
  estoque_minimo: number;
  tipo: 'material' | 'ferramenta';
}

/**
 * Material que acaba em menos de 7 dias no ritmo das saídas dos últimos 21 dias, e o que já está
 * abaixo do mínimo.
 */
export function alertasEstoque({
  itens,
  saidas,
  hoje,
}: {
  itens: ItemAlerta[];
  saidas: { item_id: string; data: string; quantidade: number }[];
  hoje: string;
}): Alerta[] {
  const desde = somarDias(hoje, -21);
  const consumo = new Map<string, number>();
  for (const s of saidas) if (s.data > desde && s.data <= hoje) consumo.set(s.item_id, (consumo.get(s.item_id) ?? 0) + Number(s.quantidade));
  const saida: Alerta[] = [];
  for (const i of itens) {
    if (i.tipo !== 'material') continue;
    const porDia = (consumo.get(i.id) ?? 0) / 21;
    const dias = porDia > 0 ? i.quantidade / porDia : Infinity;
    const qtd = `${i.quantidade.toLocaleString('pt-BR', { maximumFractionDigits: 2 })} ${i.unidade}`;
    if (dias < 7) {
      saida.push({
        chave: `estoque:${i.id}`,
        secao: 'almoxarifado',
        gravidade: dias < 3 ? 'alta' : 'media',
        titulo: `${i.nome} acaba em ${dias < 1 ? 'menos de 1 dia' : `cerca de ${plural(Math.floor(dias), 'dia', 'dias')}`}`,
        detalhe: `Saldo ${qtd}; saem ${porDia.toLocaleString('pt-BR', { maximumFractionDigits: 1 })} ${i.unidade} por dia (últimos 21 dias). Peça a compra.`,
        caminho: 'almoxarifado',
      });
    } else if (i.estoque_minimo > 0 && i.quantidade < i.estoque_minimo) {
      saida.push({
        chave: `minimo:${i.id}`,
        secao: 'almoxarifado',
        gravidade: 'baixa',
        titulo: `${i.nome} abaixo do mínimo`,
        detalhe: `Saldo ${qtd}; mínimo ${i.estoque_minimo.toLocaleString('pt-BR')} ${i.unidade}.`,
        caminho: 'almoxarifado',
      });
    }
  }
  return saida;
}

// ---------------------------------------------------------------- medições

export function alertasMedicao({
  medicoes,
  contratos,
  hoje,
}: {
  medicoes: { id: string; contrato_id: string; numero: number; fim: string; status: string; vencimento: string | null; valor_liquido: number }[];
  contratos: { id: string; parte: 'cliente' | 'empreiteiro'; nome: string }[];
  hoje: string;
}): Alerta[] {
  const porId = new Map(contratos.map((c) => [c.id, c]));
  const saida: Alerta[] = [];
  for (const m of medicoes) {
    const c = porId.get(m.contrato_id);
    if (!c) continue;
    const quem = c.parte === 'cliente' ? `do cliente (${c.nome})` : `de ${c.nome}`;
    if (m.status === 'aprovada' && m.vencimento && m.vencimento < hoje) {
      saida.push({
        chave: `medicao-vencida:${m.id}`,
        secao: 'financeiro',
        gravidade: 'alta',
        titulo: `Medição nº ${m.numero} ${quem} vencida`,
        detalhe: `Venceu em ${formatarData(m.vencimento)} (há ${plural(diasEntre(m.vencimento, hoje), 'dia', 'dias')}): ${formatarMoeda(m.valor_liquido)} ${c.parte === 'cliente' ? 'a receber' : 'a pagar'}.`,
        caminho: `orcamento/medicoes/${m.id}`,
        diasAtraso: diasEntre(m.vencimento, hoje),
      });
    } else if (m.status === 'rascunho' && diasEntre(m.fim, hoje) > 5) {
      saida.push({
        chave: `medicao-rascunho:${m.id}`,
        secao: 'financeiro',
        gravidade: 'media',
        titulo: `Medição nº ${m.numero} ${quem} parada em rascunho`,
        detalhe: `Período até ${formatarData(m.fim)}; aprove para liberar o ${c.parte === 'cliente' ? 'recebimento' : 'pagamento'}.`,
        caminho: `orcamento/medicoes/${m.id}`,
      });
    }
  }
  return saida;
}

// ---------------------------------------------------------------- campo: câmeras, ferramentas, diário

export function alertasCampo({
  cameras,
  emprestimos,
  diarios,
  inicioObra,
  hoje,
}: {
  cameras: { id: string; nome: string; nivel: string; texto: string }[];
  emprestimos: { id: string; ferramenta: string; responsavel: string; devolver_ate: string | null; devolvida_em: string | null }[];
  diarios: DiarioAlerta[];
  inicioObra: string | null;
  hoje: string;
}): Alerta[] {
  const saida: Alerta[] = [];
  for (const c of cameras) {
    if (c.nivel !== 'alerta') continue;
    saida.push({ chave: `camera:${c.id}`, secao: 'cameras', gravidade: 'media', titulo: `Câmera ${c.nome} sem foto`, detalhe: `${c.texto}.`, caminho: 'cameras' });
  }
  for (const e of emprestimos) {
    if (e.devolvida_em || !e.devolver_ate || e.devolver_ate >= hoje) continue;
    saida.push({
      chave: `ferramenta:${e.id}`,
      secao: 'almoxarifado',
      gravidade: 'media',
      titulo: `${e.ferramenta} não devolvida`,
      detalhe: `Com ${e.responsavel}; devia voltar em ${formatarData(e.devolver_ate)} (há ${plural(diasEntre(e.devolver_ate, hoje), 'dia', 'dias')}).`,
      caminho: 'almoxarifado/ferramentas',
      diasAtraso: diasEntre(e.devolver_ate, hoje),
    });
  }
  // Dias úteis (seg–sex) dos últimos 7 dias, desde o início da obra, sem diário.
  const comDiario = new Set(diarios.map((d) => d.data));
  const faltando: string[] = [];
  for (let k = 7; k >= 1; k--) {
    const d = somarDias(hoje, -k);
    const dow = new Date(`${d}T12:00:00Z`).getUTCDay();
    if (dow === 0 || dow === 6 || (inicioObra && d < inicioObra) || comDiario.has(d)) continue;
    faltando.push(d);
  }
  if (faltando.length > 0) {
    saida.push({
      chave: 'diario:faltando',
      secao: 'diario',
      gravidade: faltando.length >= 3 ? 'media' : 'baixa',
      titulo: `${plural(faltando.length, 'dia útil', 'dias úteis')} sem diário de obra`,
      detalhe: faltando.map(formatarData).join(', ') + '.',
      caminho: 'diario',
    });
  }
  const semAssinatura = diarios.filter((d) => d.status === 'rascunho' && diasEntre(d.data, hoje) > 2);
  if (semAssinatura.length > 0) {
    saida.push({
      chave: 'diario:sem-assinatura',
      secao: 'diario',
      gravidade: 'media',
      titulo: `${plural(semAssinatura.length, 'diário', 'diários')} sem assinatura do engenheiro`,
      detalhe: `${semAssinatura
        .map((d) => formatarData(d.data))
        .slice(0, 6)
        .join(', ')}${semAssinatura.length > 6 ? '…' : ''}. Diário só vale como registro depois de assinado.`,
      caminho: 'diario',
    });
  }
  return saida;
}

