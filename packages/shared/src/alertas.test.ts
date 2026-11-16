import { describe, expect, it } from 'vitest';
import {
  alertasCampo,
  alertasChuva,
  alertasCronograma,
  alertasDefesaCivil,
  alertasEstoque,
  alertasMedicao,
  alertasTempo,
  descricaoTempo,
  lerPrevisaoTempo,
  ordenarAlertas,
  type PrevisaoTempoDia,
  type TarefaAlerta,
} from './alertas';

const hoje = '2027-03-10'; // quarta-feira
const t = (id: string, nome: string, inicio: string, fim: string, pct: number): TarefaAlerta => ({
  id, codigo: id, nome, inicio_previsto: inicio, fim_previsto: fim, percentual_fisico: pct,
});

describe('alertas do cronograma', () => {
  const tarefas = [
    t('1', 'Concretagem da laje', '2027-03-01', '2027-03-05', 60), // devia ter terminado
    t('2', 'Alvenaria', '2027-03-07', '2027-03-20', 0), // devia ter começado
    t('3', 'Reboco', '2027-03-01', '2027-03-20', 5), // abaixo do ritmo (esperado 50%)
    t('4', 'Pintura', '2027-03-01', '2027-03-20', 45), // no ritmo
    t('5', 'Fachada', '2027-03-20', '2027-03-30', 0), // não começou ainda
    t('6', 'Piso', '2027-03-01', '2027-03-05', 100), // pronto
  ];

  it('acha atrasos de fim, de início e de ritmo; ignora o que está em dia', () => {
    const a = alertasCronograma({ tarefas, justificativas: [], diarios: [], itensAbaixoDoMinimo: 0, hoje });
    expect(a.map((x) => [x.tarefaId, x.gravidade, x.diasAtraso])).toEqual([
      ['1', 'alta', 5],
      ['2', 'media', 3],
      ['3', 'alta', 9],
    ]);
    expect(a[0]!.detalhe).toBe('Devia ter terminado em 05/03/2027 (há 5 dias); está em 60%.');
  });

  it('tarefa de mesmo nome em pavimentos diferentes leva a etapa no título', () => {
    const a = alertasCronograma({
      tarefas: [
        { ...t('1.4.4', 'Alvenaria lado 2', '2027-03-01', '2027-03-05', 60), etapa: 'Torre A 4º Pavimento' },
        { ...t('2.3.4', 'Alvenaria lado 2', '2027-03-01', '2027-03-05', 60), etapa: 'Torre B 3º Pavimento' },
        t('9', 'Limpeza final', '2027-03-01', '2027-03-05', 60),
      ],
      justificativas: [],
      diarios: [],
      itensAbaixoDoMinimo: 0,
      hoje,
    });
    expect(a.map((x) => x.titulo)).toEqual([
      '1.4.4 Alvenaria lado 2 (Torre A 4º Pavimento)',
      '2.3.4 Alvenaria lado 2 (Torre B 3º Pavimento)',
      '9 Limpeza final',
    ]);
  });

  it('sugere chuva pelo diário e material pelo almoxarifado', () => {
    const diarios = [
      { id: 'd1', data: '2027-03-03', status: 'assinado' as const, clima_manha: 'chuva_forte' as const, clima_tarde: 'chuva' as const },
      { id: 'd2', data: '2027-03-04', status: 'assinado' as const, clima_manha: 'sol' as const, clima_tarde: 'chuva_forte' as const },
    ];
    const a = alertasCronograma({ tarefas: [tarefas[0]!], justificativas: [], diarios, itensAbaixoDoMinimo: 2, hoje });
    expect(a[0]!.sugestao).toEqual({ causa: 'chuva', motivo: '2 dias de chuva forte no período, pelo diário de obra' });
    const b = alertasCronograma({ tarefas: [tarefas[1]!], justificativas: [], diarios, itensAbaixoDoMinimo: 2, hoje });
    expect(b[0]!.sugestao?.causa).toBe('material');
  });

  it('justificada depois que o atraso começou vira aviso baixo', () => {
    const j = { id: 'j', tarefa_id: '1', causa: 'chuva' as const, dias_impacto: 2, descricao: 'Chuva forte', registrado_nome: null, criado_em: '2027-03-06T12:00:00Z' };
    const antiga = { ...j, id: 'j0', criado_em: '2027-03-01T12:00:00Z' };
    const a = alertasCronograma({ tarefas: [tarefas[0]!], justificativas: [antiga, j], diarios: [], itensAbaixoDoMinimo: 0, hoje });
    expect(a[0]!.gravidade).toBe('baixa');
    expect(a[0]!.detalhe).toContain('Justificado: chuva — Chuva forte');
    const so = alertasCronograma({ tarefas: [tarefas[0]!], justificativas: [antiga], diarios: [], itensAbaixoDoMinimo: 0, hoje });
    expect(so[0]!.gravidade).toBe('alta');
  });
});

describe('outros alertas', () => {
  it('chuva prevista em dia de tarefa sensível', () => {
    const tarefas = [t('1', 'Concretagem da laje', '2027-03-11', '2027-03-11', 0), t('2', 'Instalações elétricas', '2027-03-01', '2027-03-30', 10)];
    const a = alertasChuva({
      tarefas,
      hoje,
      previsao: [
        { data: '2027-03-11', chuva_mm: 18.4, probabilidade: 90 },
        { data: '2027-03-12', chuva_mm: 30, probabilidade: 90 }, // sem tarefa sensível
        { data: '2027-03-20', chuva_mm: 30, probabilidade: 90 }, // longe demais
      ],
    });
    expect(a).toHaveLength(1);
    expect(a[0]).toMatchObject({ gravidade: 'alta', titulo: 'Chuva prevista amanhã: 18,4 mm, 90% de chance' });
    expect(a[0]!.detalhe).toContain('1 Concretagem da laje');
  });

  it('material acabando pelo ritmo de saída e abaixo do mínimo', () => {
    const itens = [
      { id: 'c', codigo: 'MAT-1', nome: 'Cimento', unidade: 'sc', quantidade: 20, estoque_minimo: 10, tipo: 'material' as const },
      { id: 'a', codigo: 'MAT-2', nome: 'Areia', unidade: 'm³', quantidade: 2, estoque_minimo: 5, tipo: 'material' as const },
    ];
    const saidas = [{ item_id: 'c', data: '2027-03-05', quantidade: 105 }]; // 5 sc/dia → 4 dias
    const a = alertasEstoque({ itens, saidas, hoje });
    expect(a.map((x) => [x.chave, x.gravidade, x.titulo])).toEqual([
      ['estoque:c', 'media', 'Cimento acaba em cerca de 4 dias'],
      ['minimo:a', 'baixa', 'Areia abaixo do mínimo'],
    ]);
  });

  it('medição vencida e rascunho parado', () => {
    const a = alertasMedicao({
      contratos: [{ id: 'c', parte: 'cliente', nome: 'João' }],
      medicoes: [
        { id: 'm1', contrato_id: 'c', numero: 1, fim: '2027-02-28', status: 'aprovada', vencimento: '2027-03-08', valor_liquido: 9500 },
        { id: 'm2', contrato_id: 'c', numero: 2, fim: '2027-03-01', status: 'rascunho', vencimento: null, valor_liquido: 0 },
      ],
      hoje,
    });
    expect(a.map((x) => [x.gravidade, x.titulo])).toEqual([
      ['alta', 'Medição nº 1 do cliente (João) vencida'],
      ['media', 'Medição nº 2 do cliente (João) parada em rascunho'],
    ]);
  });

  it('câmera, ferramenta, diário faltando e sem assinatura', () => {
    const a = alertasCampo({
      cameras: [{ id: 'k', nome: 'Fachada', nivel: 'alerta', texto: 'Agente sem contato desde 08/03' }],
      emprestimos: [{ id: 'e', ferramenta: 'Furadeira', responsavel: 'José', devolver_ate: '2027-03-08', devolvida_em: null }],
      diarios: [
        { id: 'd', data: '2027-03-05', status: 'rascunho', clima_manha: null, clima_tarde: null },
        { id: 'd2', data: '2027-03-09', status: 'assinado', clima_manha: null, clima_tarde: null },
      ],
      inicioObra: '2027-03-01',
      hoje,
    });
    expect(a.map((x) => x.chave)).toEqual(['camera:k', 'ferramenta:e', 'diario:faltando', 'diario:sem-assinatura']);
    // Dias úteis de 03 a 09/03 sem diário: 03, 04, 08 (05 e 09 têm).
    expect(a[2]!.detalhe).toBe('03/03/2027, 04/03/2027, 08/03/2027.');
  });

  it('ordena por gravidade e atraso', () => {
    const o = ordenarAlertas([
      { chave: 'b', secao: 'diario', gravidade: 'baixa', titulo: 'b', detalhe: '' },
      { chave: 'm', secao: 'diario', gravidade: 'media', titulo: 'm', detalhe: '' },
      { chave: 'a1', secao: 'cronograma', gravidade: 'alta', titulo: 'x', detalhe: '', diasAtraso: 2 },
      { chave: 'a2', secao: 'cronograma', gravidade: 'alta', titulo: 'y', detalhe: '', diasAtraso: 9 },
    ]);
    expect(o.map((x) => x.chave)).toEqual(['a2', 'a1', 'm', 'b']);
  });
});

describe('previsão do tempo e Defesa Civil', () => {
  const dia = (data: string, extra: Partial<PrevisaoTempoDia> = {}): PrevisaoTempoDia => ({
    data, codigo: 1, tmax: 25, tmin: 15, chuva_mm: 0, probabilidade: 0, vento_kmh: 10, rajada_kmh: 20, ...extra,
  });

  it('lê a resposta do Open-Meteo e aguenta resposta de erro', () => {
    const r = lerPrevisaoTempo({
      daily: {
        time: ['2027-03-10', '2027-03-11'],
        weather_code: [95, 3],
        temperature_2m_max: [31.2, 24],
        temperature_2m_min: [20.1, 18],
        precipitation_sum: [12.4, null],
        precipitation_probability_max: [90, 10],
        wind_speed_10m_max: [30, 12],
        wind_gusts_10m_max: [72.5, 25],
      },
    });
    expect(r[0]).toEqual({ data: '2027-03-10', codigo: 95, tmax: 31.2, tmin: 20.1, chuva_mm: 12.4, probabilidade: 90, vento_kmh: 30, rajada_kmh: 72.5 });
    expect(r[1]!.chuva_mm).toBe(0);
    expect(lerPrevisaoTempo({ reason: 'Daily API request limit exceeded', error: true })).toEqual([]);
    expect(descricaoTempo(96)).toEqual({ texto: 'Trovoadas com granizo', icone: 'tempestade' });
    expect(descricaoTempo(null).texto).toBe('Sem informação');
  });

  it('avisa vendaval, trovoada, calor e frio só nos próximos 3 dias', () => {
    const a = alertasTempo({
      hoje,
      previsao: [
        dia('2027-03-09', { rajada_kmh: 90 }), // ontem: ignora
        dia('2027-03-10', { rajada_kmh: 72, codigo: 96 }),
        dia('2027-03-11', { rajada_kmh: 48, tmax: 36.4 }),
        dia('2027-03-12', { tmin: 2 }),
        dia('2027-03-13', { codigo: 95 }), // depois de 3 dias: ignora
      ],
    });
    expect(a.map((x) => [x.chave, x.gravidade, x.titulo])).toEqual([
      ['vento:2027-03-10', 'alta', 'Vendaval hoje: rajadas de até 72 km/h'],
      ['trovoada:2027-03-10', 'alta', 'Trovoadas com granizo hoje'],
      ['vento:2027-03-11', 'media', 'Vento forte amanhã: rajadas de até 48 km/h'],
      ['calor:2027-03-11', 'media', 'Calor forte amanhã: até 36 °C'],
      ['frio:2027-03-12', 'baixa', 'Frio 12/03/2027: mínima de 2 °C'],
    ]);
  });

  it('Defesa Civil: só vira alerta da obra o que cobre a obra; risco alto é urgente', () => {
    const base = { remetente: 'Defesa Civil Estadual do Rio Grande do Sul', urgencia: 'Expected', descricao: null, link: 'https://www.defesacivil.rs.gov.br', inicio: null };
    const a = alertasDefesaCivil([
      { ...base, id: 'RS-1', evento: 'CHUVAS INTENSAS', severidade: 'Severe', titulo: 'Defesa Civil: ALERTA RISCO ALTO: chuva forte.', instrucao: 'Evite áreas alagáveis.', area: 'Porto Alegre/RS', fim: '2027-03-11T18:00:00-03:00', na_obra: true },
      { ...base, id: 'RS-2', evento: 'VENDAVAL', severidade: 'Moderate', titulo: 'Vento', instrucao: null, area: 'Santa Maria/RS', fim: null, na_obra: false },
      { ...base, id: 'RS-3', evento: 'GRANIZO', severidade: 'Moderate', titulo: 'Granizo', instrucao: null, area: 'RS', fim: null, na_obra: null },
    ]);
    expect(a).toEqual([
      {
        chave: 'defesa-civil:RS-1',
        secao: 'defesa_civil',
        gravidade: 'alta',
        titulo: 'Chuvas intensas (risco alto) · Porto Alegre/RS',
        detalhe: 'ALERTA RISCO ALTO: chuva forte. Vale até 11/03 às 18h00. Evite áreas alagáveis.',
        link: 'https://www.defesacivil.rs.gov.br',
      },
    ]);
  });
});
