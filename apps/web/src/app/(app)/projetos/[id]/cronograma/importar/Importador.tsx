'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useMemo, useState } from 'react';
import {
  CAMPOS,
  converterLinhas,
  decodificarTexto,
  detectarColunas,
  ehXmlMsProject,
  formatarData,
  formatarMoeda,
  lerCsv,
  lerMsProjectXml,
  letraColuna,
  montarEap,
  paraBanco,
  planilhaModeloCsv,
  textoCelula,
  type ItemImportado,
  type Mapeamento,
  type ResultadoImportacao,
  type SeparadorDecimal,
} from '@obras/shared';
import { criarClienteNavegador } from '@/lib/supabase/client';
import { mensagemDoBanco } from '@/lib/erros';
import type { Json } from '@/lib/database.types';
import { AvisoErro, Botao, classeBotao, classeEntrada } from '@/components/ui';

type Aba = { nome: string; linhas: unknown[][] };
type Passo = 'arquivo' | 'colunas' | 'previa';
type Resultado = ResultadoImportacao & { origem: string };

const PASSOS: { id: Passo; nome: string }[] = [
  { id: 'arquivo', nome: 'Arquivo' },
  { id: 'colunas', nome: 'Colunas' },
  { id: 'previa', nome: 'Prévia' },
];

const LIMITE_PREVIA = 400;
const LIMITE_PROBLEMAS = 40;

/** Código 1.2.3 de cada item na ordem da prévia (relativo ao arquivo). */
function codigosDaPrevia(itens: ItemImportado[]): string[] {
  let contadores: number[] = [];
  return itens.map((item) => {
    contadores = contadores.slice(0, item.nivel);
    contadores[item.nivel - 1] = (contadores[item.nivel - 1] ?? 0) + 1;
    for (let i = 0; i < item.nivel; i++) contadores[i] ??= 1;
    return contadores.join('.');
  });
}

function baixarModelo() {
  const blob = new Blob([planilhaModeloCsv()], { type: 'text/csv;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'modelo-eap.csv';
  a.click();
  URL.revokeObjectURL(url);
}

export function Importador({
  projetoId,
  itensAtuais,
  orcamentoProjeto,
}: {
  projetoId: string;
  itensAtuais: number;
  orcamentoProjeto: number | null;
}) {
  const router = useRouter();
  const [passo, setPasso] = useState<Passo>('arquivo');
  const [nomeArquivo, setNomeArquivo] = useState('');
  const [lendo, setLendo] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [abas, setAbas] = useState<Aba[]>([]);
  const [abaAtual, setAbaAtual] = useState(0);
  const [decimal, setDecimal] = useState<SeparadorDecimal>('auto');
  const [linhaCabecalho, setLinhaCabecalho] = useState<number | null>(null);
  const [mapeamento, setMapeamento] = useState<Mapeamento>({});
  const [resultado, setResultado] = useState<Resultado | null>(null);
  const [modo, setModo] = useState<'acrescentar' | 'substituir' | null>(itensAtuais === 0 ? 'acrescentar' : null);
  const [enviando, setEnviando] = useState(false);
  const [todosProblemas, setTodosProblemas] = useState(false);

  const linhas = abas[abaAtual]?.linhas ?? [];

  function escolherAba(lista: Aba[], indice: number) {
    setAbaAtual(indice);
    const det = detectarColunas(lista[indice]?.linhas ?? []);
    setLinhaCabecalho(det.linhaCabecalho);
    setMapeamento(det.mapeamento);
  }

  async function lerArquivo(arquivo: File) {
    setErro(null);
    setResultado(null);
    setNomeArquivo(arquivo.name);
    const nome = arquivo.name.toLowerCase();

    if (arquivo.size > 15 * 1024 * 1024) return setErro('O arquivo passa de 15 MB. Divida a planilha ou remova abas que não são da EAP.');
    if (nome.endsWith('.mpp')) {
      return setErro('Arquivos .mpp não são lidos direto. No MS Project, use Arquivo → Salvar como → XML (*.xml) e envie o XML.');
    }
    if (nome.endsWith('.xls')) return setErro('Formato .xls antigo. Abra no Excel e salve como .xlsx ou CSV.');

    setLendo(true);
    try {
      if (nome.endsWith('.xlsx') || nome.endsWith('.xlsm')) {
        const { default: lerXlsx } = await import('read-excel-file/browser');
        const planilhas = await lerXlsx(arquivo);
        const lidas: Aba[] = planilhas
          .map((p) => ({ nome: p.sheet, linhas: p.data as unknown as unknown[][] }))
          .filter((p) => p.linhas.length > 0);
        if (lidas.length === 0) throw new Error('a planilha está vazia');
        const indice = Math.max(0, lidas.findIndex((a) => detectarColunas(a.linhas).linhaCabecalho !== null));
        setAbas(lidas);
        setDecimal('auto');
        escolherAba(lidas, indice);
        setPasso('colunas');
        return;
      }

      const texto = decodificarTexto(await arquivo.arrayBuffer());
      if (nome.endsWith('.xml') || ehXmlMsProject(texto)) {
        const r = lerMsProjectXml(texto);
        setAbas([]);
        setResultado({ ...r, origem: r.nomeProjeto ? `MS Project: ${r.nomeProjeto}` : 'MS Project' });
        setPasso('previa');
        return;
      }

      const csv = lerCsv(texto);
      if (csv.linhas.length === 0) throw new Error('o arquivo está vazio');
      const lidas: Aba[] = [{ nome: arquivo.name, linhas: csv.linhas }];
      setAbas(lidas);
      setDecimal(csv.decimal);
      escolherAba(lidas, 0);
      setPasso('colunas');
    } catch (e) {
      setErro(`Não foi possível ler o arquivo: ${e instanceof Error ? e.message : String(e)}.`);
    } finally {
      setLendo(false);
    }
  }

  function gerarPrevia() {
    const { linhas: origem, problemas } = converterLinhas(linhas, linhaCabecalho, mapeamento, decimal);
    const r = montarEap(origem, problemas);
    setResultado({ ...r, origem: abas.length > 1 ? `${nomeArquivo}, aba "${abas[abaAtual]?.nome}"` : nomeArquivo });
    setTodosProblemas(false);
    setPasso('previa');
  }

  async function importar() {
    if (!resultado) return;
    setEnviando(true);
    setErro(null);
    const supabase = criarClienteNavegador();
    const { data, error } = await supabase.rpc('importar_eap', {
      p_projeto_id: projetoId,
      p_itens: paraBanco(resultado.itens) as unknown as Json,
      p_substituir: modo === 'substituir',
    });
    if (error) {
      setErro(mensagemDoBanco(error));
      setEnviando(false);
      return;
    }
    router.push(`/projetos/${projetoId}/cronograma?importados=${data ?? resultado.itens.length}`);
    router.refresh();
  }

  return (
    <div className="flex flex-col gap-6">
      <ol className="flex gap-2 text-sm" aria-label="Passos da importação">
        {PASSOS.map((p, i) => {
          const atual = p.id === passo;
          const feito = PASSOS.findIndex((x) => x.id === passo) > i;
          return (
            <li key={p.id} aria-current={atual ? 'step' : undefined} className="flex items-center gap-2">
              <span
                className={`numeros flex size-7 items-center justify-center rounded-full border-2 font-bold ${
                  atual ? 'border-cianotipia bg-cianotipia text-white' : feito ? 'border-cianotipia text-cianotipia' : 'border-linha text-regua'
                }`}
              >
                {i + 1}
              </span>
              <span className={atual ? 'font-semibold' : 'text-regua'}>{p.nome}</span>
              {i < PASSOS.length - 1 && <span aria-hidden className="mx-1 h-px w-5 bg-linha sm:w-10" />}
            </li>
          );
        })}
      </ol>

      {erro && <AvisoErro>{erro}</AvisoErro>}

      {passo === 'arquivo' && (
        <section className="flex flex-col gap-5">
          <label
            className={`flex cursor-pointer flex-col items-center justify-center gap-2 rounded-medio border-2 border-dashed border-cianotipia/40 bg-papel px-6 py-12 text-center hover:border-cianotipia focus-within:border-cianotipia focus-within:ring-2 focus-within:ring-cianotipia/40 ${
              lendo ? 'pointer-events-none opacity-60' : ''
            }`}
          >
            <svg aria-hidden viewBox="0 0 24 24" className="size-8 text-cianotipia" fill="none" stroke="currentColor" strokeWidth="1.8">
              <path d="M12 16V4m0 0-4 4m4-4 4 4M4 15v3a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-3" />
            </svg>
            <span className="text-lg font-semibold">{lendo ? 'Lendo o arquivo…' : 'Escolher arquivo'}</span>
            <span className="text-sm text-regua">Planilha .xlsx ou .csv, ou XML do MS Project</span>
            <input
              type="file"
              accept=".xlsx,.xlsm,.csv,.txt,.xml,.mpp,.xls"
              className="sr-only"
              disabled={lendo}
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) void lerArquivo(f);
                e.target.value = '';
              }}
            />
          </label>

          <div className="grid gap-4 text-sm sm:grid-cols-2">
            <div className="rounded-medio border border-linha bg-papel p-4">
              <h3 className="font-semibold">Orçamento ou cronograma em planilha</h3>
              <p className="mt-1 text-regua">
                Uma linha por item, com descrição e, de preferência, o código (1, 1.1, 1.1.1) que diz o que fica dentro de cada etapa.
                Unidade, quantidade, preço, total e datas entram se existirem.
              </p>
              <button type="button" onClick={baixarModelo} className="mt-3 font-semibold text-cianotipia hover:underline underline-offset-4">
                Baixar planilha-modelo
              </button>
            </div>
            <div className="rounded-medio border border-linha bg-papel p-4">
              <h3 className="font-semibold">MS Project ou ProjectLibre</h3>
              <p className="mt-1 text-regua">
                Salve como XML (Arquivo → Salvar como → XML). Vêm tarefas-resumo como etapas, tarefas, datas e custos. Dependências
                entram no sprint 2, com o Gantt.
              </p>
            </div>
          </div>
        </section>
      )}

      {passo === 'colunas' && (
        <MapeamentoColunas
          abas={abas}
          abaAtual={abaAtual}
          onAba={(i) => escolherAba(abas, i)}
          linhas={linhas}
          linhaCabecalho={linhaCabecalho}
          onCabecalho={setLinhaCabecalho}
          mapeamento={mapeamento}
          onMapeamento={setMapeamento}
          decimal={decimal}
          onDecimal={setDecimal}
          onVoltar={() => setPasso('arquivo')}
          onContinuar={gerarPrevia}
        />
      )}

      {passo === 'previa' && resultado && (
        <Previa
          resultado={resultado}
          orcamentoProjeto={orcamentoProjeto}
          itensAtuais={itensAtuais}
          modo={modo}
          onModo={setModo}
          todosProblemas={todosProblemas}
          onTodosProblemas={() => setTodosProblemas(true)}
          enviando={enviando}
          onVoltar={() => setPasso(abas.length > 0 ? 'colunas' : 'arquivo')}
          onImportar={() => void importar()}
          projetoId={projetoId}
        />
      )}
    </div>
  );
}

function MapeamentoColunas({
  abas,
  abaAtual,
  onAba,
  linhas,
  linhaCabecalho,
  onCabecalho,
  mapeamento,
  onMapeamento,
  decimal,
  onDecimal,
  onVoltar,
  onContinuar,
}: {
  abas: Aba[];
  abaAtual: number;
  onAba: (i: number) => void;
  linhas: unknown[][];
  linhaCabecalho: number | null;
  onCabecalho: (n: number | null) => void;
  mapeamento: Mapeamento;
  onMapeamento: (m: Mapeamento) => void;
  decimal: SeparadorDecimal;
  onDecimal: (d: SeparadorDecimal) => void;
  onVoltar: () => void;
  onContinuar: () => void;
}) {
  const totalColunas = useMemo(() => linhas.slice(0, 60).reduce((m, l) => Math.max(m, l.length), 0), [linhas]);
  const cabecalho = linhaCabecalho === null ? [] : (linhas[linhaCabecalho] ?? []);
  const inicioDados = linhaCabecalho === null ? 0 : linhaCabecalho + 1;
  const amostra = linhas.slice(inicioDados, inicioDados + 6);
  const colunasUsadas = new Set(Object.values(mapeamento));
  const resumoLinha = (l: unknown[]) =>
    l.map((c) => textoCelula(c)).filter(Boolean).slice(0, 3).join(' | ').slice(0, 60) || '(vazia)';

  return (
    <section className="flex flex-col gap-6">
      <p className="text-regua">
        Confira de qual coluna vem cada informação. Já sugerimos pelo cabeçalho; ajuste se algo estiver errado. Só a descrição é
        obrigatória.
      </p>

      <div className="grid gap-4 sm:grid-cols-2">
        {abas.length > 1 && (
          <label className="flex flex-col gap-1.5 text-sm font-semibold">
            Aba da planilha
            <select className={classeEntrada} value={abaAtual} onChange={(e) => onAba(Number(e.target.value))}>
              {abas.map((a, i) => (
                <option key={a.nome + i} value={i}>
                  {a.nome}
                </option>
              ))}
            </select>
          </label>
        )}
        <label className="flex flex-col gap-1.5 text-sm font-semibold">
          Linha do cabeçalho
          <select
            className={classeEntrada}
            value={linhaCabecalho ?? ''}
            onChange={(e) => onCabecalho(e.target.value === '' ? null : Number(e.target.value))}
          >
            <option value="">Sem cabeçalho (dados desde a linha 1)</option>
            {linhas.slice(0, 30).map((l, i) => (
              <option key={i} value={i}>
                Linha {i + 1}: {resumoLinha(l)}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1.5 text-sm font-semibold">
          Números no arquivo
          <select className={classeEntrada} value={decimal} onChange={(e) => onDecimal(e.target.value as SeparadorDecimal)}>
            <option value="auto">Detectar sozinho</option>
            <option value=",">Vírgula decimal (1.234,56)</option>
            <option value=".">Ponto decimal (1,234.56)</option>
          </select>
        </label>
      </div>

      <fieldset className="grid gap-x-6 gap-y-4 rounded-medio border border-linha bg-papel p-4 sm:grid-cols-2 sm:p-5">
        <legend className="px-1 text-sm font-semibold">Colunas</legend>
        {CAMPOS.map(({ campo, rotulo, dica }) => (
          <label key={campo} className="flex flex-col gap-1.5 text-sm">
            <span className="font-semibold">
              {rotulo}
              {campo === 'nome' && <span className="text-marcador"> (obrigatório)</span>}
            </span>
            <select
              className={classeEntrada}
              value={mapeamento[campo] ?? ''}
              onChange={(e) => {
                const novo = { ...mapeamento };
                if (e.target.value === '') delete novo[campo];
                else novo[campo] = Number(e.target.value);
                onMapeamento(novo);
              }}
            >
              <option value="">Não usar</option>
              {Array.from({ length: totalColunas }, (_, i) => (
                <option key={i} value={i}>
                  Coluna {letraColuna(i)}
                  {textoCelula(cabecalho[i]) ? `: ${textoCelula(cabecalho[i]).slice(0, 40)}` : ''}
                </option>
              ))}
            </select>
            {dica && <span className="text-xs text-regua">{dica}</span>}
          </label>
        ))}
      </fieldset>

      <div>
        <h3 className="mb-2 text-sm font-semibold">Primeiras linhas de dados</h3>
        <div className="overflow-x-auto rounded-medio border border-linha bg-white">
          <table className="numeros w-full min-w-max text-left text-xs">
            <thead>
              <tr className="border-b border-linha bg-papel">
                {Array.from({ length: totalColunas }, (_, i) => (
                  <th key={i} scope="col" className={`px-3 py-2 font-semibold ${colunasUsadas.has(i) ? 'text-cianotipia' : 'text-regua'}`}>
                    {letraColuna(i)}
                    {textoCelula(cabecalho[i]) && <span className="block font-normal">{textoCelula(cabecalho[i]).slice(0, 24)}</span>}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-linha">
              {amostra.map((l, r) => (
                <tr key={r}>
                  {Array.from({ length: totalColunas }, (_, i) => (
                    <td key={i} className={`max-w-56 truncate px-3 py-1.5 ${colunasUsadas.has(i) ? '' : 'text-regua/70'}`}>
                      {textoCelula(l[i])}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="flex flex-wrap gap-3 border-t border-linha pt-5">
        <Botao type="button" onClick={onContinuar} disabled={mapeamento.nome === undefined}>
          Ver prévia
        </Botao>
        <Botao type="button" variante="secundario" onClick={onVoltar}>
          Trocar arquivo
        </Botao>
      </div>
    </section>
  );
}

function Previa({
  resultado: r,
  orcamentoProjeto,
  itensAtuais,
  modo,
  onModo,
  todosProblemas,
  onTodosProblemas,
  enviando,
  onVoltar,
  onImportar,
  projetoId,
}: {
  resultado: Resultado;
  orcamentoProjeto: number | null;
  itensAtuais: number;
  modo: 'acrescentar' | 'substituir' | null;
  onModo: (m: 'acrescentar' | 'substituir') => void;
  todosProblemas: boolean;
  onTodosProblemas: () => void;
  enviando: boolean;
  onVoltar: () => void;
  onImportar: () => void;
  projetoId: string;
}) {
  const erros = r.problemas.filter((p) => p.gravidade === 'erro');
  const avisos = r.problemas.filter((p) => p.gravidade === 'aviso');
  const problemas = [...erros, ...avisos];
  const visiveis = todosProblemas ? problemas : problemas.slice(0, LIMITE_PROBLEMAS);
  const codigos = useMemo(() => codigosDaPrevia(r.itens), [r.itens]);
  const percentual = r.resumo.custoTotal !== null && orcamentoProjeto ? Math.round((r.resumo.custoTotal / orcamentoProjeto) * 100) : null;
  const criterio = {
    codigo: 'Etapas montadas pelo código do item (1, 1.1, 1.1.1).',
    nivel: 'Etapas montadas pela coluna de nível.',
    plano: 'Sem código nem nível: todos os itens no mesmo nível.',
  }[r.criterio];
  const podeImportar = r.itens.length > 0 && erros.length === 0 && (itensAtuais === 0 || modo !== null) && !enviando;

  return (
    <section className="flex flex-col gap-6">
      <div>
        <p className="text-sm text-regua">{r.origem}</p>
        <p className="mt-1 text-regua">{criterio}</p>
      </div>

      <dl className="numeros grid grid-cols-2 gap-px overflow-hidden rounded-medio border border-linha bg-linha text-sm sm:grid-cols-4">
        <div className="bg-papel px-4 py-3">
          <dt className="text-regua">Estrutura</dt>
          <dd className="mt-0.5 font-semibold">
            {r.resumo.etapas} etapas, {r.resumo.tarefas} tarefas
          </dd>
        </div>
        <div className="bg-papel px-4 py-3">
          <dt className="text-regua">Níveis</dt>
          <dd className="mt-0.5 font-semibold">{r.resumo.niveis}</dd>
        </div>
        <div className="bg-papel px-4 py-3">
          <dt className="text-regua">Custo previsto</dt>
          <dd className="mt-0.5 font-semibold">{formatarMoeda(r.resumo.custoTotal)}</dd>
          {percentual !== null && <dd className="text-xs text-regua">{percentual}% do orçamento do projeto</dd>}
        </div>
        <div className="bg-papel px-4 py-3">
          <dt className="text-regua">Prazo</dt>
          <dd className="mt-0.5 font-semibold">{r.resumo.inicio ? `${formatarData(r.resumo.inicio)} a ${formatarData(r.resumo.fim)}` : '—'}</dd>
        </div>
      </dl>

      {problemas.length > 0 && (
        <div className={`rounded-medio border px-4 py-3 ${erros.length > 0 ? 'border-marcador/40 bg-marcador-claro' : 'border-linha bg-papel'}`}>
          <h3 className={`font-semibold ${erros.length > 0 ? 'text-marcador' : ''}`}>
            {erros.length > 0
              ? `${erros.length} ${erros.length === 1 ? 'problema impede' : 'problemas impedem'} a importação. Corrija no arquivo e envie de novo.`
              : `${avisos.length} ${avisos.length === 1 ? 'aviso' : 'avisos'}: a importação pode seguir, mas vale conferir.`}
          </h3>
          <ul className="mt-2 flex flex-col gap-1 text-sm">
            {visiveis.map((p, i) => (
              <li key={i} className={p.gravidade === 'erro' ? 'text-marcador' : 'text-grafite'}>
                {p.linha !== null && <span className="numeros mr-1.5 font-semibold">Linha {p.linha}:</span>}
                {p.mensagem}
              </li>
            ))}
          </ul>
          {!todosProblemas && problemas.length > LIMITE_PROBLEMAS && (
            <button type="button" onClick={onTodosProblemas} className="mt-2 text-sm font-semibold text-cianotipia hover:underline underline-offset-4">
              Mostrar todos ({problemas.length})
            </button>
          )}
        </div>
      )}

      {r.itens.length > 0 && (
        <div className="overflow-hidden rounded-medio border border-linha bg-papel">
          <ol className="max-h-[28rem] divide-y divide-linha overflow-y-auto">
            {r.itens.slice(0, LIMITE_PREVIA).map((item, i) => (
              <li
                key={item.chave}
                className={`grid grid-cols-[minmax(0,1fr)_auto] gap-3 px-4 py-2 text-sm ${item.tipo === 'etapa' ? 'bg-concreto/70' : ''}`}
              >
                <p className="min-w-0" style={{ paddingLeft: `${Math.min(item.nivel - 1, 5) * 0.9}rem` }}>
                  <span className="numeros mr-2 text-regua">{codigos[i]}</span>
                  <span className={item.tipo === 'etapa' ? 'font-semibold' : ''}>{item.nome}</span>
                  {item.tipo === 'tarefa' && item.inicio_previsto && (
                    <span className="numeros block text-xs text-regua">
                      {formatarData(item.inicio_previsto)} a {formatarData(item.fim_previsto)}
                    </span>
                  )}
                </p>
                <span className="numeros text-right">{item.custo_previsto !== null ? formatarMoeda(item.custo_previsto) : ''}</span>
              </li>
            ))}
          </ol>
          {r.itens.length > LIMITE_PREVIA && (
            <p className="border-t border-linha px-4 py-2 text-sm text-regua">
              Mostrando {LIMITE_PREVIA} de {r.itens.length} itens. Todos serão importados.
            </p>
          )}
        </div>
      )}

      {itensAtuais > 0 && r.itens.length > 0 && erros.length === 0 && (
        <fieldset className="flex flex-col gap-2 rounded-medio border border-linha bg-papel p-4">
          <legend className="px-1 text-sm font-semibold">
            O projeto já tem {itensAtuais} {itensAtuais === 1 ? 'item' : 'itens'} na EAP
          </legend>
          <label className="flex items-start gap-3 text-sm">
            <input type="radio" name="modo" className="mt-1 size-4 accent-cianotipia" checked={modo === 'substituir'} onChange={() => onModo('substituir')} />
            <span>
              <span className="font-semibold">Substituir a EAP atual.</span> Os {itensAtuais} itens de hoje são apagados e dão lugar aos do
              arquivo.
            </span>
          </label>
          <label className="flex items-start gap-3 text-sm">
            <input type="radio" name="modo" className="mt-1 size-4 accent-cianotipia" checked={modo === 'acrescentar'} onChange={() => onModo('acrescentar')} />
            <span>
              <span className="font-semibold">Acrescentar no fim.</span> A EAP atual fica como está e o arquivo entra depois dela.
            </span>
          </label>
        </fieldset>
      )}

      <div className="flex flex-wrap items-center gap-3 border-t border-linha pt-5">
        <Botao type="button" onClick={onImportar} disabled={!podeImportar}>
          {enviando ? 'Importando…' : `Importar ${r.itens.length} ${r.itens.length === 1 ? 'item' : 'itens'}`}
        </Botao>
        <Botao type="button" variante="secundario" onClick={onVoltar} disabled={enviando}>
          Voltar
        </Botao>
        <Link href={`/projetos/${projetoId}/cronograma`} className={classeBotao('discreto', 'ml-auto text-sm')}>
          Cancelar
        </Link>
      </div>
    </section>
  );
}
