import { describe, expect, it } from 'vitest';
import { diasEntre } from '../formato';
import { MODELO_RESIDENCIA, montarModeloCronograma } from './index';

const base = { inicio: '2027-01-04', prazoMeses: 10, incluirProjetos: true };

describe('modelo de residência unifamiliar', () => {
  it('monta as 10 etapas do documento com as tarefas e as dependências', () => {
    const r = montarModeloCronograma(MODELO_RESIDENCIA, base);
    expect(r.resumo.etapas).toBe(10);
    expect(r.resumo.tarefas).toBe(48);
    expect(r.itens[0]).toMatchObject({ tipo: 'etapa', nome: 'Serviços preliminares e projeto' });
    expect(r.dependencias.length).toBeGreaterThan(45);
    expect(r.problemas).toEqual([]);
  });

  it('projetos e aprovação vêm antes do canteiro; a execução cabe no prazo pedido', () => {
    const r = montarModeloCronograma(MODELO_RESIDENCIA, base);
    const t = (nome: string) => r.itens.find((i) => i.nome.startsWith(nome))!;
    expect(t('Aprovação dos projetos').inicio_previsto).toBe('2027-01-04');
    expect(t('Limpeza do terreno').inicio_previsto).toBe('2027-03-05'); // 60 dias depois
    const dias = diasEntre(t('Limpeza do terreno').inicio_previsto!, r.resumo.fim!) + 1;
    expect(dias).toBe(Math.round((10 * 365) / 12));
  });

  it('sem projetos, começa na limpeza do terreno', () => {
    const r = montarModeloCronograma(MODELO_RESIDENCIA, { ...base, incluirProjetos: false });
    expect(r.resumo.tarefas).toBe(45);
    expect(r.itens.some((i) => i.nome.startsWith('Sondagem'))).toBe(false);
    expect(r.resumo.inicio).toBe('2027-01-04');
    expect(r.dependencias.every((d) => !['1.1', '1.2', '1.3'].includes(d.predecessora))).toBe(true);
  });

  it.each([3, 6, 10, 18, 36])('com %i meses as datas fecham e as dependências não empurram nada', (prazoMeses) => {
    const r = montarModeloCronograma(MODELO_RESIDENCIA, { ...base, prazoMeses });
    const datas = new Map(r.itens.filter((i) => i.tipo === 'tarefa').map((i) => [i.chave, i]));
    for (const i of datas.values()) expect(i.fim_previsto! >= i.inicio_previsto!).toBe(true);
    for (const d of r.dependencias) {
      const p = datas.get(d.predecessora)!;
      const s = datas.get(d.sucessora)!;
      expect(d.defasagem).toBeGreaterThanOrEqual(0);
      const minimo = d.tipo === 'ti' ? diasEntre(p.fim_previsto!, s.inicio_previsto!) - 1 : diasEntre(p.inicio_previsto!, s.inicio_previsto!);
      expect(minimo).toBe(d.defasagem);
    }
  });

  it('nomes e códigos externos únicos (ligam as dependências aos itens gravados)', () => {
    const r = montarModeloCronograma(MODELO_RESIDENCIA, base);
    const tarefas = r.itens.filter((i) => i.tipo === 'tarefa');
    expect(new Set(tarefas.map((t) => t.nome)).size).toBe(tarefas.length);
    expect(new Set(tarefas.map((t) => t.codigo_externo)).size).toBe(tarefas.length);
    expect(tarefas.every((t) => t.codigo_externo!.startsWith('residencia-unifamiliar:'))).toBe(true);
  });
});
