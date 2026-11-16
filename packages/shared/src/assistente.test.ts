import { describe, expect, it } from 'vitest';
import { instrucaoAssistente, tarefasRelevantes, textoContextoObra, type ContextoObra } from './assistente';

const hoje = '2026-11-16';
const t = (codigo: string, nome: string, inicio: string, fim: string, percentual: number) => ({ codigo, nome, etapa: 'Torre A 4º Pavimento', inicio, fim, percentual });

const base: ContextoObra = {
  hoje,
  obra: { nome: 'Napoles', endereco: 'Av. Santos Ferreira, 4200 - Canoas/RS', situacao: 'Em andamento', inicio: '2026-01-05', fim: '2028-07-20' },
  prazo: { real: 13.4, planejado: 14.1, atrasoDias: 9, fimProjetado: '2028-08-18', referencia: 'a linha de base' },
  etapas: [{ nome: 'Torre A', real: 16.1, planejado: 18 }],
  tarefas: [
    t('1.4.4', 'Alv - Alvenaria lado 2', '2026-11-01', '2026-11-09', 60),
    t('1.4.6', 'Est - Laje lado 2', '2026-11-12', '2026-11-20', 10),
    t('1.5.1', 'Alv - Alvenaria lado 1', '2026-11-25', '2026-12-05', 0),
    t('1.9.1', 'Cobertura', '2027-06-01', '2027-07-01', 0),
    t('1.1.1', 'Terraplanagem', '2026-01-05', '2026-01-20', 100),
  ],
  alertas: [{ chave: 'a', secao: 'clima', gravidade: 'alta', titulo: 'Vendaval amanhã: rajadas de até 72 km/h', detalhe: 'Suspenda içamento.' }],
  previsao: [{ data: '2026-11-17', codigo: 95, tmax: 29, tmin: 20, chuva_mm: 18.6, probabilidade: 90, vento_kmh: 30, rajada_kmh: 72 }],
  diarios: [{ data: '2026-11-14', status: 'assinado', efetivo: 22, fotos: 5 }],
  equipeHoje: 18,
  materiais: [{ nome: 'Cimento CP-II', quantidade: 40, unidade: 'sc', abaixoDoMinimo: true }],
  arquivos: [{ nome: 'Napoles - ARQ 01-24.pdf', pasta: 'Projeto arquitetônico' }],
  resumoProjeto: 'Condomínio com 3 torres de 7 pavimentos.',
  custos: null,
};

describe('assistente da obra', () => {
  it('separa atrasadas, em andamento e próximas 3 semanas; concluída e distante ficam de fora', () => {
    const g = tarefasRelevantes(base.tarefas, hoje);
    expect(g.map((x) => [x.titulo, x.lista.map((y) => y.codigo)])).toEqual([
      ['Atrasadas (deviam ter terminado)', ['1.4.4']],
      ['Em andamento hoje', ['1.4.6']],
      ['Começam nas próximas 3 semanas', ['1.5.1']],
    ]);
  });

  it('o retrato da obra traz prazo, tarefas, alertas, tempo, campo, material e arquivos; custos só quando vêm', () => {
    const texto = textoContextoObra(base);
    expect(texto).toContain('Avanço físico: 13% feito; o planejado para hoje era 14% (9 dias de atraso, comparado com a linha de base). Mantendo o ritmo, termina em 18/08/2028.');
    expect(texto).toContain('- 1.4.4 Alv - Alvenaria lado 2 (Torre A 4º Pavimento): 01/11/2026 a 09/11/2026, 60% feito');
    expect(texto).toContain('- [alta] Vendaval amanhã: rajadas de até 72 km/h: Suspenda içamento.');
    expect(texto).toContain('- 17/11/2026: Trovoadas, 20–29 °C, chuva 18.6 mm (90%), rajadas 72 km/h');
    expect(texto).toContain('Pessoas na chamada de hoje: 18.');
    expect(texto).toContain('- Cimento CP-II: 40 sc (abaixo do mínimo)');
    expect(texto).toContain('Condomínio com 3 torres');
    expect(texto).not.toContain('## Custos');
    expect(texto).not.toContain('1.9.1');
    expect(textoContextoObra({ ...base, custos: { orcamento: 1000, previstoEap: null, realizado: 250 } })).toContain('## Custos');
  });

  it('a instrução manda usar só os dados da obra e não alterar nada', () => {
    const i = instrucaoAssistente('DADOS');
    expect(i).toContain('Use só os dados da obra abaixo');
    expect(i).toContain('você não altera nada');
    expect(i.endsWith('DADOS')).toBe(true);
  });
});
