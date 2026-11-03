// Modelos de cronograma: a estrutura padrão de um tipo de obra vira EAP + dependências, com
// durações sugeridas proporcionais ao prazo. Entra pela mesma prévia do importador (importar_eap).
import { somarDias } from '../formato';
import type { ItemImportado, ResultadoImportacao } from '../importacao/tipos';
import type { TipoDependencia } from '../dominio';

interface TarefaModelo {
  chave: string;
  nome: string;
  /** Dias desde o início do bloco (projetos ou execução), no prazo-base do modelo. */
  ini: number;
  fim: number;
  /** Projetos e aprovação: vêm antes do canteiro, são opcionais e não escalam com o prazo. */
  projeto?: boolean;
}

interface EtapaModelo {
  chave: string;
  nome: string;
  tarefas: TarefaModelo[];
}

export interface ModeloCronograma {
  id: string;
  nome: string;
  descricao: string;
  origem: string;
  /** Prazo-base da execução (do canteiro à entrega), em dias. */
  diasExecucao: number;
  /** Duração da fase de projetos e aprovação, em dias (não escala com o prazo). */
  diasProjetos: number;
  etapas: EtapaModelo[];
  /** Sequência entre tarefas (predecessora → sucessora). O tipo sai das datas. */
  sequencia: [string, string][];
}

// Cronograma de obra residencial (casa unifamiliar), estruturado com a engenharia em 02/11/2026:
// 10 fases sequenciais. Datas da execução contadas a partir da limpeza do terreno (dia 0).
export const MODELO_RESIDENCIA: ModeloCronograma = {
  id: 'residencia-unifamiliar',
  nome: 'Residência unifamiliar',
  descricao: '10 etapas, da aprovação dos projetos à entrega das chaves, com as tarefas ligadas em sequência.',
  origem: 'Cronograma de Obra Residencial da equipe de engenharia',
  diasExecucao: 305,
  diasProjetos: 60,
  etapas: [
    {
      chave: '1',
      nome: 'Serviços preliminares e projeto',
      tarefas: [
        { chave: '1.1', nome: 'Sondagem do solo', ini: 0, fim: 9, projeto: true },
        { chave: '1.2', nome: 'Projetos complementares (estrutural, hidrossanitário, elétrico, ar-condicionado e automação)', ini: 10, fim: 49, projeto: true },
        { chave: '1.3', nome: 'Aprovação dos projetos legais (prefeitura, condomínio e órgãos ambientais)', ini: 0, fim: 59, projeto: true },
        { chave: '1.4', nome: 'Limpeza do terreno', ini: 0, fim: 4 },
        { chave: '1.5', nome: 'Instalação do canteiro de obras', ini: 3, fim: 12 },
        { chave: '1.6', nome: 'Locação da obra (gabarito)', ini: 13, fim: 16 },
      ],
    },
    {
      chave: '2',
      nome: 'Infraestrutura e fundação',
      tarefas: [
        { chave: '2.1', nome: 'Escavação das fundações', ini: 17, fim: 23 },
        { chave: '2.2', nome: 'Lastro de concreto magro', ini: 24, fim: 25 },
        { chave: '2.3', nome: 'Formas e armação das fundações', ini: 26, fim: 37 },
        { chave: '2.4', nome: 'Concretagem das fundações (sapatas, tubulões e vigas baldrame)', ini: 38, fim: 40 },
        { chave: '2.5', nome: 'Impermeabilização das vigas baldrame', ini: 41, fim: 44 },
        { chave: '2.6', nome: 'Reaterro interno e compactação', ini: 45, fim: 49 },
      ],
    },
    {
      chave: '3',
      nome: 'Superestrutura',
      tarefas: [
        { chave: '3.1', nome: 'Pilares', ini: 50, fim: 61 },
        { chave: '3.2', nome: 'Escoramento, formas e armação de vigas e lajes', ini: 62, fim: 81 },
        { chave: '3.3', nome: 'Concretagem de vigas e lajes', ini: 82, fim: 83 },
        { chave: '3.4', nome: 'Escadas', ini: 84, fim: 93 },
        { chave: '3.5', nome: 'Reservatório e platibandas', ini: 94, fim: 105 },
        { chave: '3.6', nome: 'Desforma e retirada do escoramento', ini: 104, fim: 107 },
      ],
    },
    {
      chave: '4',
      nome: 'Alvenaria e vedações',
      tarefas: [
        { chave: '4.1', nome: 'Elevação da alvenaria com vergas e contravergas', ini: 84, fim: 118 },
        { chave: '4.2', nome: 'Marcação de caixilhos e shafts para instalações', ini: 105, fim: 118 },
      ],
    },
    {
      chave: '5',
      nome: 'Cobertura e impermeabilização',
      tarefas: [
        { chave: '5.1', nome: 'Estrutura de sustentação do telhado', ini: 108, fim: 120 },
        { chave: '5.2', nome: 'Telhamento ou laje impermeabilizada', ini: 121, fim: 132 },
        { chave: '5.3', nome: 'Calhas e rufos', ini: 133, fim: 138 },
        { chave: '5.4', nome: 'Impermeabilização das áreas molhadas', ini: 139, fim: 146 },
      ],
    },
    {
      chave: '6',
      nome: 'Instalações prediais (embutidas)',
      tarefas: [
        { chave: '6.1', nome: 'Instalações hidrossanitárias', ini: 100, fim: 135 },
        { chave: '6.2', nome: 'Instalações elétricas', ini: 100, fim: 135 },
        { chave: '6.3', nome: 'Dados e lógica', ini: 115, fim: 135 },
        { chave: '6.4', nome: 'Infraestrutura de ar-condicionado', ini: 115, fim: 135 },
        { chave: '6.5', nome: 'Testes de pressão e estanqueidade', ini: 136, fim: 140 },
      ],
    },
    {
      chave: '7',
      nome: 'Revestimentos e acabamentos',
      tarefas: [
        { chave: '7.1', nome: 'Chapisco, emboço e reboco interno', ini: 141, fim: 175 },
        { chave: '7.2', nome: 'Reboco externo', ini: 147, fim: 180 },
        { chave: '7.3', nome: 'Contrapiso e regularização', ini: 170, fim: 185 },
        { chave: '7.4', nome: 'Instalação de esquadrias', ini: 176, fim: 190 },
        { chave: '7.5', nome: 'Gesso e forros', ini: 180, fim: 200 },
        { chave: '7.6', nome: 'Revestimentos de paredes', ini: 186, fim: 210 },
        { chave: '7.7', nome: 'Pisos', ini: 190, fim: 215 },
      ],
    },
    {
      chave: '8',
      nome: 'Pintura e esquadrias finais',
      tarefas: [
        { chave: '8.1', nome: 'Massa, lixamento e selador', ini: 216, fim: 235 },
        { chave: '8.2', nome: 'Tinta de acabamento', ini: 236, fim: 255 },
        { chave: '8.3', nome: 'Pintura de portas, rodapés e elementos metálicos', ini: 245, fim: 260 },
      ],
    },
    {
      chave: '9',
      nome: 'Instalação de componentes e louças',
      tarefas: [
        { chave: '9.1', nome: 'Bancadas de granito e box', ini: 216, fim: 230 },
        { chave: '9.2', nome: 'Tomadas, interruptores, quadros e luminárias', ini: 256, fim: 270 },
        { chave: '9.3', nome: 'Louças e metais', ini: 256, fim: 268 },
        { chave: '9.4', nome: 'Evaporadoras e condensadoras de ar-condicionado', ini: 260, fim: 272 },
      ],
    },
    {
      chave: '10',
      nome: 'Limpeza final e entrega',
      tarefas: [
        { chave: '10.1', nome: 'Limpeza pós-obra pesada', ini: 273, fim: 280 },
        { chave: '10.2', nome: 'Paisagismo', ini: 273, fim: 290 },
        { chave: '10.3', nome: 'Revisão geral das instalações', ini: 281, fim: 287 },
        { chave: '10.4', nome: 'Vistoria final com o cliente', ini: 291, fim: 293 },
        { chave: '10.5', nome: 'Manual do Proprietário e ARTs de conclusão', ini: 291, fim: 304 },
      ],
    },
  ],
  sequencia: [
    ['1.1', '1.2'], ['1.3', '1.4'], ['1.2', '1.4'],
    ['1.4', '1.5'], ['1.5', '1.6'], ['1.6', '2.1'],
    ['2.1', '2.2'], ['2.2', '2.3'], ['2.3', '2.4'], ['2.4', '2.5'], ['2.5', '2.6'], ['2.6', '3.1'],
    ['3.1', '3.2'], ['3.2', '3.3'], ['3.3', '3.4'], ['3.4', '3.5'], ['3.5', '3.6'],
    ['3.3', '4.1'], ['4.1', '4.2'], ['3.6', '5.1'], ['5.1', '5.2'], ['5.2', '5.3'], ['5.3', '5.4'],
    ['4.1', '6.1'], ['4.1', '6.2'], ['6.2', '6.3'], ['6.2', '6.4'], ['6.1', '6.5'], ['6.2', '6.5'],
    ['6.5', '7.1'], ['5.4', '7.2'], ['7.1', '7.3'], ['7.1', '7.4'], ['7.3', '7.5'], ['7.4', '7.6'], ['7.3', '7.7'],
    ['7.6', '8.1'], ['7.7', '8.1'], ['8.1', '8.2'], ['8.2', '8.3'],
    ['7.6', '9.1'], ['8.2', '9.2'], ['8.2', '9.3'], ['9.2', '9.4'],
    ['9.4', '10.1'], ['9.3', '10.1'], ['10.1', '10.3'], ['10.1', '10.2'], ['10.3', '10.4'], ['10.2', '10.4'], ['10.4', '10.5'],
  ],
};

export const MODELOS_CRONOGRAMA: ModeloCronograma[] = [MODELO_RESIDENCIA];

export interface OpcoesModelo {
  /** Primeiro dia (AAAA-MM-DD): início dos projetos, se incluídos, ou da limpeza do terreno. */
  inicio: string;
  /** Prazo da execução (canteiro à entrega), em meses. */
  prazoMeses: number;
  /** Incluir projetos e aprovação antes do canteiro. */
  incluirProjetos: boolean;
}

export interface DependenciaModelo {
  predecessora: string;
  sucessora: string;
  tipo: TipoDependencia;
  defasagem: number;
}

export interface ResultadoModelo extends ResultadoImportacao {
  dependencias: DependenciaModelo[];
}

export const PRAZO_MODELO_MIN = 3;
export const PRAZO_MODELO_MAX = 36;

/** Prefixo do código externo das tarefas do modelo: liga as dependências aos itens gravados. */
export function codigoExternoModelo(modelo: ModeloCronograma, chave: string) {
  return `${modelo.id}:${chave}`;
}

/**
 * Monta a EAP do modelo para a prévia: etapas, tarefas com datas proporcionais ao prazo pedido e as
 * dependências (TI quando a sucessora começa depois do fim da predecessora; II com a defasagem quando
 * as duas correm juntas). Os números do modelo são sugestões: o engenheiro ajusta depois no Gantt.
 */
export function montarModeloCronograma(modelo: ModeloCronograma, opcoes: OpcoesModelo): ResultadoModelo {
  const prazo = Math.min(PRAZO_MODELO_MAX, Math.max(PRAZO_MODELO_MIN, opcoes.prazoMeses));
  const diasExecucao = Math.round((prazo * 365) / 12);
  const fator = diasExecucao / modelo.diasExecucao;
  const desloc = opcoes.incluirProjetos ? modelo.diasProjetos : 0;

  const itens: ItemImportado[] = [];
  const datas = new Map<string, { ini: number; fim: number }>();
  let linha = 0;
  for (const etapa of modelo.etapas) {
    const tarefasEtapa = etapa.tarefas.filter((t) => opcoes.incluirProjetos || !t.projeto);
    if (tarefasEtapa.length === 0) continue;
    linha += 1;
    itens.push({
      chave: `E${etapa.chave}`, pai: null, tipo: 'etapa', nome: etapa.nome, unidade: null, quantidade: null,
      custo_previsto: null, inicio_previsto: null, fim_previsto: null, codigo_externo: null, nivel: 1, linha,
    });
    for (const t of tarefasEtapa) {
      // Projetos não escalam (dependem da prefeitura, não do tamanho da obra); a execução escala.
      const ini = t.projeto ? t.ini : desloc + Math.round(t.ini * fator);
      const fim = t.projeto ? t.fim : Math.max(ini, desloc + Math.round((t.fim + 1) * fator) - 1);
      datas.set(t.chave, { ini, fim });
      linha += 1;
      itens.push({
        chave: t.chave, pai: `E${etapa.chave}`, tipo: 'tarefa', nome: t.nome, unidade: null, quantidade: null,
        custo_previsto: null, inicio_previsto: somarDias(opcoes.inicio, ini), fim_previsto: somarDias(opcoes.inicio, fim),
        codigo_externo: codigoExternoModelo(modelo, t.chave), nivel: 2, linha,
      });
    }
  }

  const dependencias: DependenciaModelo[] = [];
  for (const [p, s] of modelo.sequencia) {
    const a = datas.get(p);
    const b = datas.get(s);
    if (!a || !b || b.ini < a.ini) continue;
    dependencias.push(
      b.ini > a.fim
        ? { predecessora: p, sucessora: s, tipo: 'ti', defasagem: b.ini - a.fim - 1 }
        : { predecessora: p, sucessora: s, tipo: 'ii', defasagem: b.ini - a.ini },
    );
  }

  const tarefas = itens.filter((i) => i.tipo === 'tarefa');
  return {
    itens,
    dependencias,
    problemas: [],
    criterio: 'codigo',
    resumo: {
      etapas: itens.length - tarefas.length,
      tarefas: tarefas.length,
      niveis: 2,
      custoTotal: null,
      inicio: tarefas.map((t) => t.inicio_previsto!).sort()[0] ?? null,
      fim: tarefas.map((t) => t.fim_previsto!).sort().at(-1) ?? null,
    },
  };
}
