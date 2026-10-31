'use client';

import Link from 'next/link';
import { useMemo, useState, useTransition } from 'react';
import {
  converterLinhaNfe,
  formatarChaveNfe,
  formatarCnpj,
  formatarData,
  formatarMoeda,
  formatarQuantidade,
  lerNfeXml,
  lerNumero,
  nomeDoProdutoNfe,
  normalizarUnidade,
  sugerirItensNfe,
  UNIDADES_ESTOQUE,
  type ItemEstoque,
  type LinhaNfe,
  type ResultadoNfe,
  type VinculoFornecedor,
} from '@obras/shared';
import { registrarEntrada, type PedidoEntrada } from '../acoes';
import { Botao, classeEntrada } from '@/components/ui';

const NOVO = 'novo';
const IGNORAR = 'ignorar';

type Escolha = { item: string; nome: string; unidade: string; fator: string; origem: 'vinculo' | 'nome' | null };

/** Entrada pelo XML da NF-e: lê no aparelho, mostra a prévia casada com o catálogo e só grava ao confirmar. */
export function EntradaNfe({
  projetoId,
  materiais,
  vinculos,
  hoje,
}: {
  projetoId: string;
  materiais: ItemEstoque[];
  vinculos: VinculoFornecedor[];
  hoje: string;
}) {
  const [arquivo, setArquivo] = useState<string | null>(null);
  const [leitura, setLeitura] = useState<ResultadoNfe | null>(null);
  const [escolhas, setEscolhas] = useState<Escolha[]>([]);
  const [data, setData] = useState(hoje);
  const [arrastando, setArrastando] = useState(false);
  const [resultado, setResultado] = useState<{ tipo: 'ok' | 'erro'; texto: string } | null>(null);
  const [enviando, iniciar] = useTransition();
  const porId = useMemo(() => new Map(materiais.map((m) => [m.id, m])), [materiais]);
  const ordenados = useMemo(() => [...materiais].sort((a, b) => a.nome.localeCompare(b.nome, 'pt-BR')), [materiais]);

  async function abrir(f: File) {
    setResultado(null);
    if (f.size > 5_000_000) {
      setLeitura({ nota: null, problemas: [{ gravidade: 'erro', mensagem: 'Arquivo grande demais para um XML de NF-e (mais de 5 MB).' }] });
      return;
    }
    const texto = await f.text();
    const r = lerNfeXml(texto);
    setArquivo(f.name);
    setLeitura(r);
    if (r.nota) {
      const sugestoes = sugerirItensNfe(r.nota.linhas, materiais, vinculos, r.nota.emitente.cnpj);
      setEscolhas(
        r.nota.linhas.map((l, i) => ({
          item: sugestoes[i]!.item_id ?? NOVO,
          nome: nomeDoProdutoNfe(l.descricao),
          unidade: normalizarUnidade(l.unidade),
          fator: '1',
          origem: sugestoes[i]!.origem,
        })),
      );
    }
  }

  function mudar(i: number, campos: Partial<Escolha>) {
    setEscolhas((atual) => atual.map((e, j) => (j === i ? { ...e, ...campos } : e)));
  }

  const nota = leitura?.nota ?? null;
  const temErro = leitura?.problemas.some((p) => p.gravidade === 'erro') ?? false;

  function conversao(l: LinhaNfe, e: Escolha) {
    const item = porId.get(e.item);
    const unidadeNota = normalizarUnidade(l.unidade);
    const destino = e.item === NOVO ? e.unidade : item?.unidade ?? unidadeNota;
    const precisaFator = e.item !== NOVO && e.item !== IGNORAR && item !== undefined && item.unidade !== unidadeNota;
    const fator = precisaFator ? (lerNumero(e.fator, ',') ?? Number.NaN) : 1;
    return { destino, precisaFator, fatorValido: Number.isFinite(fator) && fator > 0, ...converterLinhaNfe(l, precisaFator ? fator : 1) };
  }

  const ativas = nota ? nota.linhas.map((l, i) => ({ l, e: escolhas[i]! })).filter(({ e }) => e && e.item !== IGNORAR) : [];
  const totalLancado = ativas.reduce((s, { l }) => s + l.custoTotal, 0);
  const pendentes = ativas.filter(({ l, e }) => {
    const c = conversao(l, e);
    return (e.item === NOVO && (e.nome.trim().length < 2 || e.unidade.trim() === '')) || (c.precisaFator && !c.fatorValido);
  }).length;

  function confirmar() {
    if (!nota) return;
    const pedido: PedidoEntrada = {
      data,
      fornecedor: nota.emitente.nome,
      cnpj_fornecedor: nota.emitente.cnpj,
      nota_fiscal: nota.numero,
      chave_nfe: nota.chave,
      itens: ativas.map(({ l, e }) => {
        const c = conversao(l, e);
        return {
          item_id: e.item === NOVO ? null : e.item,
          novo: e.item === NOVO ? { nome: e.nome.trim(), unidade: e.unidade.trim(), ncm: l.ncm } : null,
          quantidade: c.quantidade,
          valor_unitario: c.valor_unitario,
          codigo_fornecedor: l.codigo || null,
        };
      }),
    };
    setResultado(null);
    iniciar(async () => {
      const r = await registrarEntrada(projetoId, pedido);
      if (r.ok) {
        setResultado({ tipo: 'ok', texto: `${r.mensagem} NF ${nota.numero ?? ''} de ${nota.emitente.fantasia ?? nota.emitente.nome ?? 'fornecedor'}.` });
        setLeitura(null);
        setArquivo(null);
        setEscolhas([]);
      } else {
        setResultado({ tipo: 'erro', texto: r.erro });
      }
    });
  }

  return (
    <div className="flex flex-col gap-5">
      <label
        htmlFor="arquivo-nfe"
        onDragOver={(e) => {
          e.preventDefault();
          setArrastando(true);
        }}
        onDragLeave={() => setArrastando(false)}
        onDrop={(e) => {
          e.preventDefault();
          setArrastando(false);
          const f = e.dataTransfer.files[0];
          if (f) void abrir(f);
        }}
        className={`flex cursor-pointer flex-col items-center gap-2 rounded-medio border-2 border-dashed px-4 py-8 text-center transition-colors ${
          arrastando ? 'border-cianotipia bg-cianotipia-claro' : 'border-campo/60 bg-concreto/40 hover:border-cianotipia'
        }`}
      >
        <svg aria-hidden viewBox="0 0 24 24" className="size-8 text-cianotipia" fill="none" stroke="currentColor" strokeWidth="1.8">
          <path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z" />
          <path d="M14 3v5h5M9 13h6M9 17h6" />
        </svg>
        <span className="font-semibold">{arquivo ? `Lido: ${arquivo}. Escolher outro XML` : 'Escolher o XML da NF-e'}</span>
        <span className="text-sm text-regua">O arquivo .xml que o fornecedor manda junto com o DANFE. Fica no aparelho até você confirmar.</span>
        <input
          id="arquivo-nfe"
          type="file"
          accept=".xml,text/xml,application/xml"
          className="sr-only"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) void abrir(f);
            e.target.value = '';
          }}
        />
      </label>

      {resultado && (
        <div
          role={resultado.tipo === 'erro' ? 'alert' : 'status'}
          className={`rounded-medio px-4 py-3 text-sm ${resultado.tipo === 'erro' ? 'bg-marcador-claro text-marcador' : 'bg-obra-ok/10 font-semibold text-obra-ok'}`}
        >
          {resultado.texto}
          {resultado.tipo === 'ok' && (
            <Link href={`/projetos/${projetoId}/almoxarifado`} className="ml-2 underline underline-offset-4">
              Ver o estoque
            </Link>
          )}
        </div>
      )}

      {leitura && leitura.problemas.length > 0 && (
        <ul className="flex flex-col gap-2">
          {leitura.problemas.map((p, i) => (
            <li
              key={i}
              role={p.gravidade === 'erro' ? 'alert' : undefined}
              className={`rounded-medio px-4 py-2.5 text-sm ${p.gravidade === 'erro' ? 'bg-marcador-claro font-semibold text-marcador' : 'border border-linha bg-concreto text-grafite'}`}
            >
              {p.mensagem}
            </li>
          ))}
        </ul>
      )}

      {nota && (
        <>
          <section aria-labelledby="titulo-nota" className="rounded-medio border border-linha bg-papel p-4 sm:p-5">
            <div className="flex flex-col gap-1 sm:flex-row sm:items-baseline sm:justify-between">
              <h3 id="titulo-nota" className="text-base font-semibold">
                NF {nota.numero}
                {nota.serie ? ` · série ${nota.serie}` : ''} · {nota.emitente.fantasia ?? nota.emitente.nome}
              </h3>
              <p className="numeros text-lg font-semibold">{formatarMoeda(nota.valorTotal)}</p>
            </div>
            <dl className="numeros mt-3 grid gap-x-6 gap-y-2 text-sm sm:grid-cols-2">
              <div>
                <dt className="text-regua">Fornecedor</dt>
                <dd>
                  {nota.emitente.nome}
                  {nota.emitente.cnpj && <span className="text-regua"> · {formatarCnpj(nota.emitente.cnpj)}</span>}
                </dd>
              </div>
              <div>
                <dt className="text-regua">Emissão</dt>
                <dd>{formatarData(nota.emissao)}</dd>
              </div>
              <div>
                <dt className="text-regua">Destinatário</dt>
                <dd>{nota.destinatario.nome ?? '—'}</dd>
              </div>
              <div>
                <dt className="text-regua">Chave de acesso</dt>
                <dd>{formatarChaveNfe(nota.chave)}</dd>
              </div>
            </dl>
            <div className="mt-4 max-w-xs">
              <label htmlFor="data-entrada" className="text-sm font-semibold">
                Data em que o material chegou na obra
              </label>
              <input
                id="data-entrada"
                type="date"
                max={hoje}
                value={data}
                onChange={(e) => setData(e.target.value)}
                className={`${classeEntrada} numeros mt-1.5`}
              />
            </div>
          </section>

          <datalist id="unidades-estoque">
            {UNIDADES_ESTOQUE.map((u) => (
              <option key={u} value={u} />
            ))}
          </datalist>

          <ol className="flex flex-col gap-3" aria-label="Itens da nota">
            {nota.linhas.map((l, i) => {
              const e = escolhas[i];
              if (!e) return null;
              const c = conversao(l, e);
              const ignorada = e.item === IGNORAR;
              return (
                <li key={l.numero} className={`rounded-medio border bg-papel p-4 ${ignorada ? 'border-linha opacity-70' : 'border-linha'}`}>
                  <div className="flex flex-col gap-1 sm:flex-row sm:justify-between sm:gap-4">
                    <div className="min-w-0">
                      <p className="font-semibold">
                        {l.numero}. {l.descricao}
                      </p>
                      <p className="numeros text-sm text-regua">
                        Código {l.codigo}
                        {l.ncm ? ` · NCM ${l.ncm}` : ''}
                      </p>
                    </div>
                    <p className="numeros shrink-0 text-sm sm:text-right">
                      <span className="font-semibold">{formatarQuantidade(l.quantidade, l.unidade)}</span>
                      <span className="text-regua"> · </span>
                      <span className="font-semibold">{formatarMoeda(l.custoTotal)}</span>
                      {(l.frete > 0 || l.ipi > 0 || l.icmsSt > 0 || l.desconto > 0) && (
                        <span className="block text-regua">
                          produtos {formatarMoeda(l.valorProdutos)}
                          {l.desconto > 0 && ` − desc. ${formatarMoeda(l.desconto)}`}
                          {l.frete > 0 && ` + frete ${formatarMoeda(l.frete)}`}
                          {l.ipi > 0 && ` + IPI ${formatarMoeda(l.ipi)}`}
                          {l.icmsSt > 0 && ` + ST ${formatarMoeda(l.icmsSt)}`}
                        </span>
                      )}
                    </p>
                  </div>

                  <div className="mt-3 grid gap-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
                    <div className="flex flex-col gap-1.5">
                      <label htmlFor={`item-${i}`} className="text-sm font-semibold">
                        No catálogo
                        {e.origem === 'vinculo' && e.item !== NOVO && <span className="ml-2 font-normal text-obra-ok">ligado pela última nota</span>}
                        {e.origem === 'nome' && e.item !== NOVO && <span className="ml-2 font-normal text-regua">mesmo nome</span>}
                      </label>
                      <select id={`item-${i}`} value={e.item} onChange={(ev) => mudar(i, { item: ev.target.value, origem: null })} className={classeEntrada}>
                        <option value={NOVO}>Cadastrar como item novo</option>
                        <option value={IGNORAR}>Não dar entrada nesta linha</option>
                        <optgroup label="Materiais do catálogo">
                          {ordenados.map((m) => (
                            <option key={m.id} value={m.id}>
                              {m.nome} ({m.unidade})
                            </option>
                          ))}
                        </optgroup>
                      </select>
                    </div>

                    {e.item === NOVO && (
                      <div className="grid grid-cols-[minmax(0,1fr)_6rem] gap-2">
                        <div className="flex flex-col gap-1.5">
                          <label htmlFor={`nome-${i}`} className="text-sm font-semibold">
                            Nome no catálogo
                          </label>
                          <input id={`nome-${i}`} value={e.nome} maxLength={200} onChange={(ev) => mudar(i, { nome: ev.target.value })} className={classeEntrada} />
                        </div>
                        <div className="flex flex-col gap-1.5">
                          <label htmlFor={`unidade-${i}`} className="text-sm font-semibold">
                            Unidade
                          </label>
                          <input
                            id={`unidade-${i}`}
                            list="unidades-estoque"
                            value={e.unidade}
                            maxLength={20}
                            onChange={(ev) => mudar(i, { unidade: ev.target.value })}
                            className={classeEntrada}
                          />
                        </div>
                      </div>
                    )}

                    {c.precisaFator && (
                      <div className="flex flex-col gap-1.5">
                        <label htmlFor={`fator-${i}`} className="text-sm font-semibold">
                          Conversão: 1 {l.unidade} da nota vale quantos {c.destino}?
                        </label>
                        <input
                          id={`fator-${i}`}
                          inputMode="decimal"
                          value={e.fator}
                          onChange={(ev) => mudar(i, { fator: ev.target.value })}
                          aria-invalid={!c.fatorValido || undefined}
                          className={`${classeEntrada} numeros max-w-40`}
                        />
                      </div>
                    )}
                  </div>

                  {!ignorada && (
                    <p className="numeros mt-3 text-sm">
                      Entra no estoque: <span className="font-semibold">{formatarQuantidade(c.quantidade, c.destino)}</span> a{' '}
                      <span className="font-semibold">{formatarMoeda(c.valor_unitario)}</span>/{c.destino}
                    </p>
                  )}
                </li>
              );
            })}
          </ol>

          <div className="sticky bottom-0 -mx-4 flex flex-col gap-3 border-t border-linha bg-papel px-4 py-4 sm:mx-0 sm:flex-row sm:items-center sm:justify-between sm:rounded-medio sm:border">
            <p className="numeros text-sm">
              <span className="font-semibold">
                {ativas.length} de {nota.linhas.length} {nota.linhas.length === 1 ? 'linha' : 'linhas'}
              </span>{' '}
              · {formatarMoeda(totalLancado)}
              {pendentes > 0 && <span className="block font-semibold text-marcador">Complete {pendentes === 1 ? '1 linha' : `${pendentes} linhas`} antes de confirmar.</span>}
            </p>
            <Botao type="button" onClick={confirmar} disabled={enviando || temErro || ativas.length === 0 || pendentes > 0 || data > hoje}>
              {enviando ? 'Dando entrada…' : 'Dar entrada na nota'}
            </Botao>
          </div>
        </>
      )}
    </div>
  );
}
