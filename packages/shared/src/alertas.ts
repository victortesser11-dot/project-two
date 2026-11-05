// Alertas da obra, calculados na hora a partir dos dados (nada gravado além das justificativas).
// Cronograma (tarefa atrasada, com sugestão de causa), chuva prevista em tarefa sensível, material
// acabando, medição vencida ou parada, câmera, ferramenta e diário.
import { ROTULO_CAUSA_ATRASO, type CausaAtraso, type Clima, type JustificativaAtraso } from './dominio';
import { dataDoInstante, diasEntre, formatarData, formatarMoeda, somarDias } from './formato';

export type GravidadeAlerta = 'alta' | 'media' | 'baixa';
export type SecaoAlerta = 'cronograma' | 'clima' | 'almoxarifado' | 'financeiro' | 'cameras' | 'diario';

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
}

export const ROTULO_SECAO_ALERTA: Record<SecaoAlerta, string> = {
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
      titulo: `${t.codigo} ${t.nome}`,
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
      detalhe: `Programado para o dia: ${afetadas.map((t) => `${t.codigo} ${t.nome}`).slice(0, 4).join('; ')}${afetadas.length > 4 ? ` e mais ${afetadas.length - 4}` : ''}. Avalie remanejar a equipe ou proteger o serviço.`,
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

