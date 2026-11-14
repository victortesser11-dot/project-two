import { describe, expect, it } from 'vitest';
import { recolhidasDeInicio } from './recolher';

type Linha = { id: string; tipo: 'etapa' | 'tarefa'; nivel: number };

/** `torres` etapas, cada uma com `pavimentos` etapas de `tarefas` tarefas. */
function obra(torres: number, pavimentos: number, tarefas: number): Linha[] {
  const itens: Linha[] = [];
  for (let t = 0; t < torres; t++) {
    itens.push({ id: `t${t}`, tipo: 'etapa', nivel: 1 });
    for (let p = 0; p < pavimentos; p++) {
      itens.push({ id: `t${t}p${p}`, tipo: 'etapa', nivel: 2 });
      for (let s = 0; s < tarefas; s++) itens.push({ id: `t${t}p${p}s${s}`, tipo: 'tarefa', nivel: 3 });
    }
  }
  return itens;
}

describe('recolhidasDeInicio', () => {
  it('cronograma pequeno abre inteiro', () => {
    expect(recolhidasDeInicio(obra(2, 2, 5), 80).size).toBe(0);
  });

  it('cronograma grande mostra torres e pavimentos e fecha os pavimentos', () => {
    const itens = obra(4, 10, 40); // 1.644 itens; níveis 1 e 2 somam 44
    const fechadas = recolhidasDeInicio(itens, 120);
    expect(fechadas.size).toBe(40);
    expect(fechadas.has('t0')).toBe(false);
    expect(fechadas.has('t0p0')).toBe(true);
  });

  it('quando nem o segundo nível cabe, fecha tudo e mostra só o primeiro', () => {
    const fechadas = recolhidasDeInicio(obra(4, 10, 40), 30);
    expect(fechadas.size).toBe(44);
  });

  it('primeiro nível maior que o limite ainda aparece (não some tudo)', () => {
    const itens: Linha[] = Array.from({ length: 300 }, (_, i) => ({ id: `e${i}`, tipo: 'etapa', nivel: 1 }));
    expect(recolhidasDeInicio(itens, 80).size).toBe(300);
  });
});
