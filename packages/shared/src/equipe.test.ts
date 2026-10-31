import { describe, expect, it } from 'vitest';
import { cnpjValido, cpfValido, formatarCnpj } from './documentos';
import { chamadaSchema, custoMaoObraSchema, empreiteiraSchema, errosPorCampo, trabalhadorSchema } from './esquemas';
import { enderecoDoCep, lerCep, lerCnpj, lerFeriados, urlCnpj } from './integracoes/brasilapi';
import { custoPorDia, custoPorTarefa, efetivoDaChamada, totalMaoObra } from './maoDeObra';
import type { LinhaCustoMaoObra } from './dominio';

const U = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;

describe('documentos', () => {
  it('CPF pelos dígitos verificadores (o mesmo critério do banco)', () => {
    expect(cpfValido('529.982.247-25')).toBe(true);
    expect(cpfValido('123.456.789-09')).toBe(true);
    expect(cpfValido('123.456.789-00')).toBe(false);
    expect(cpfValido('111.111.111-11')).toBe(false);
    expect(cpfValido('5299822472')).toBe(false);
  });

  it('CNPJ pelos dígitos verificadores', () => {
    expect(cnpjValido('11.222.333/0001-81')).toBe(true);
    expect(cnpjValido('00.000.000/0001-91')).toBe(true);
    expect(cnpjValido('11.222.333/0001-80')).toBe(false);
    expect(cnpjValido('11111111111111')).toBe(false);
    expect(formatarCnpj('11222333000181')).toBe('11.222.333/0001-81');
  });
});

describe('esquemas da equipe', () => {
  it('pessoa: CPF vira só dígitos; vazio vira null', () => {
    expect(trabalhadorSchema.parse({ nome: ' João ', cpf: '529.982.247-25', funcao: 'Pedreiro' })).toMatchObject({ nome: 'João', cpf: '52998224725', empreiteira_id: null });
    expect(trabalhadorSchema.parse({ nome: 'Zé', cpf: '', funcao: 'Servente' }).cpf).toBeNull();
    const r = trabalhadorSchema.safeParse({ nome: 'Zé', cpf: '123.456.789-00', funcao: 'Servente' });
    expect(r.success).toBe(false);
    if (!r.success) expect(errosPorCampo(r.error).cpf).toBe('CPF inválido: confira os números');
  });

  it('empreiteira com CNPJ opcional e validado', () => {
    expect(empreiteiraSchema.parse({ nome: 'Silva', cnpj: '11.222.333/0001-81' }).cnpj).toBe('11222333000181');
    expect(empreiteiraSchema.safeParse({ nome: 'Silva', cnpj: '11.222.333/0001-80' }).success).toBe(false);
  });

  it('custo: valor no padrão brasileiro; produção exige unidade', () => {
    expect(custoMaoObraSchema.parse({ tipo: 'diaria', valor: 'R$ 180,00', vigente_desde: '2026-11-01', unidade_producao: 'm²' })).toEqual({
      tipo: 'diaria', valor: 180, vigente_desde: '2026-11-01', unidade_producao: null,
    });
    expect(custoMaoObraSchema.safeParse({ tipo: 'producao', valor: '30', vigente_desde: '2026-11-01' }).success).toBe(false);
    expect(custoMaoObraSchema.safeParse({ tipo: 'hora', valor: '0', vigente_desde: '2026-11-01' }).success).toBe(false);
  });

  it('chamada: presente precisa de tarefa e de no máximo 24 h', () => {
    expect(chamadaSchema.safeParse([{ trabalhador_id: U(1), presente: false }]).success).toBe(true);
    expect(chamadaSchema.safeParse([{ trabalhador_id: U(1), presente: true, alocacoes: [] }]).success).toBe(false);
    expect(
      chamadaSchema.safeParse([{ trabalhador_id: U(1), presente: true, alocacoes: [{ tarefa_id: U(2), horas: 20 }, { tarefa_id: U(3), horas: 6 }] }]).success,
    ).toBe(false);
  });
});

describe('BrasilAPI', () => {
  it('lê o CNPJ e diz se está ativo', () => {
    const d = lerCnpj({
      cnpj: '11222333000181', razao_social: 'SILVA CONSTRUCOES LTDA', nome_fantasia: '', descricao_situacao_cadastral: 'ATIVA',
      municipio: 'CAMPINAS', uf: 'SP', ddd_telefone_1: '1933334444', cnae_fiscal_descricao: 'Construção de edifícios',
    })!;
    expect(d).toMatchObject({ razao_social: 'SILVA CONSTRUCOES LTDA', nome_fantasia: null, situacao: 'ATIVA', ativa: true, telefone: '1933334444' });
    expect(lerCnpj({ razao_social: 'X LTDA', descricao_situacao_cadastral: 'Baixada' })?.ativa).toBe(false);
    expect(lerCnpj({ message: 'CNPJ não encontrado' })).toBeNull();
    expect(urlCnpj('11.222.333/0001-81')).toBe('https://brasilapi.com.br/api/cnpj/v1/11222333000181');
  });

  it('lê feriados e ignora itens quebrados', () => {
    expect(lerFeriados([{ date: '2026-11-02', name: 'Finados', type: 'national' }, { date: 'x', name: 'y' }, null])).toEqual([
      { data: '2026-11-02', nome: 'Finados' },
    ]);
    expect(lerFeriados({ erro: true })).toEqual([]);
  });

  it('lê o CEP com e sem coordenadas', () => {
    const c = lerCep({
      cep: '13010-100', state: 'SP', city: 'Campinas', neighborhood: 'Centro', street: 'Rua Barão de Jaguara',
      location: { type: 'Point', coordinates: { longitude: '-47.0608', latitude: '-22.9056' } },
    })!;
    expect(c).toMatchObject({ cep: '13010100', cidade: 'Campinas', latitude: -22.9056, longitude: -47.0608 });
    expect(enderecoDoCep(c)).toBe('Rua Barão de Jaguara, Centro, Campinas/SP');
    expect(lerCep({ cep: '01001000', state: 'SP', city: 'São Paulo', location: { type: 'Point', coordinates: {} } })?.latitude).toBeNull();
  });
});

describe('somas de mão de obra', () => {
  const linhas: LinhaCustoMaoObra[] = [
    { data: '2026-11-02', trabalhador_id: 'a', tarefa_id: 'T1', horas: 8, quantidade: null, tipo: 'hora', valor_unitario: 31, custo: 248 },
    { data: '2026-11-02', trabalhador_id: 'b', tarefa_id: 'T1', horas: 6, quantidade: null, tipo: 'diaria', valor_unitario: 180, custo: 135 },
    { data: '2026-11-02', trabalhador_id: 'b', tarefa_id: 'T2', horas: 2, quantidade: null, tipo: 'diaria', valor_unitario: 180, custo: 45 },
    { data: '2026-11-03', trabalhador_id: 'c', tarefa_id: 'T2', horas: 8, quantidade: null, tipo: null, valor_unitario: null, custo: null },
  ];
  it('por tarefa, por dia e total, contando quem está sem custo', () => {
    expect(custoPorTarefa(linhas).map((s) => [s.chave, s.custo, s.semCusto])).toEqual([['T1', 383, 0], ['T2', 45, 1]]);
    expect(custoPorDia(linhas)[0]).toMatchObject({ chave: '2026-11-03', custo: 0, semCusto: 1 });
    expect(totalMaoObra(linhas)).toEqual({ custo: 428, horas: 24, semCusto: 1 });
  });

  it('equipe do diário vem da chamada', () => {
    expect(efetivoDaChamada([
      { funcao: 'Servente', empreiteira: 'Silva' }, { funcao: 'Pedreiro', empreiteira: null }, { funcao: 'Servente', empreiteira: 'Silva' },
    ])).toEqual([
      { funcao: 'Servente', empresa_terceira: 'Silva', quantidade: 2 },
      { funcao: 'Pedreiro', empresa_terceira: null, quantidade: 1 },
    ]);
  });
});
