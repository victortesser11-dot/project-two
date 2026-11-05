'use client';

import { useRouter } from 'next/navigation';
import { useActionState, useMemo, useState, useTransition } from 'react';
import { formatarData, formatarMoeda, lerNumero, type ContratoMedicao, type Medicao, type SituacaoPagamento } from '@obras/shared';
import type { EstadoForm } from '../../acoes';
import { ajustarMedicao, aprovarMedicao, excluirMedicao, observarMedicao, registrarPagamentoMedicao } from '../acoes';
import { SeloSituacao } from '../Selo';
import { AvisoErro, Botao, Campo, classeEntrada } from '@/components/ui';

export interface LinhaBoletim {
  itemId: string;
  codigo: string;
  tarefa: string;
  unidade: string;
  contratado: number;
  precoUnitario: number;
  /** Medido nos boletins aprovados anteriores. */
  antes: number;
  /** Executado até o fim do período, na unidade do item (o limite que o banco aplica). */
  executado: number;
  /** Medido neste boletim. */
  atual: number;
}

const q4 = (v: number) => Math.round(v * 10000) / 10000;
const cent = (v: number) => Math.round(v * 100) / 100;
const fmt = (n: number) => n.toLocaleString('pt-BR', { maximumFractionDigits: 4 });
const paraCampo = (n: number) => (n === 0 ? '' : String(n).replace('.', ','));

export function Boletim({
  projetoId,
  obra,
  medicao: m,
  contrato,
  linhas,
  situacao,
  podeAprovar,
  hoje,
}: {
  projetoId: string;
  obra: string;
  medicao: Medicao;
  contrato: Pick<ContratoMedicao, 'nome' | 'parte' | 'retencao_pct'>;
  linhas: LinhaBoletim[];
  situacao: SituacaoPagamento;
  podeAprovar: boolean;
  hoje: string;
}) {
  const router = useRouter();
  const rascunho = m.status === 'rascunho';
  const [valores, setValores] = useState<Record<string, string>>(() => Object.fromEntries(linhas.map((l) => [l.itemId, paraCampo(l.atual)])));
  const [todos, setTodos] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const [aviso, setAviso] = useState<string | null>(null);
  const [rodando, iniciar] = useTransition();
  const [obs, setObs] = useState(m.observacao ?? '');

  const calc = useMemo(
    () =>
      linhas.map((l) => {
        const lido = lerNumero(valores[l.itemId] ?? '', ',');
        const q = lido === null || Number.isNaN(lido) ? 0 : q4(lido);
        const acumulado = q4(l.antes + q);
        const problema =
          lido !== null && Number.isNaN(lido)
            ? 'Número inválido'
            : q < 0
              ? 'Não pode ser negativo'
              : acumulado > l.contratado
                ? 'Passa do contratado'
                : acumulado > l.executado
                  ? 'Passa do executado'
                  : null;
        return { ...l, q, valor: cent(q * l.precoUnitario), acumulado, problema, mudou: q !== l.atual };
      }),
    [linhas, valores],
  );
  const bruto = cent(calc.reduce((s, l) => s + l.valor, 0));
  const retencao = cent((bruto * contrato.retencao_pct) / 100);
  const mudou = calc.some((l) => l.mudou);
  const comProblema = calc.some((l) => l.problema);
  const visiveis = calc.filter((l) => todos || l.q > 0 || l.atual > 0 || (rascunho && l.executado > l.antes));
  const cliente = contrato.parte === 'cliente';

  function salvar() {
    setErro(null);
    setAviso(null);
    iniciar(async () => {
      const r = await ajustarMedicao(
        projetoId,
        m.id,
        calc.filter((l) => l.mudou).map((l) => ({ itemId: l.itemId, quantidade: l.q })),
      );
      if (!r.ok) setErro(r.erro);
      else setAviso('Medição salva.');
      router.refresh();
    });
  }

  function medirTudo() {
    setValores(Object.fromEntries(linhas.map((l) => [l.itemId, paraCampo(Math.max(0, q4(Math.min(l.executado, l.contratado) - l.antes)))])));
  }

  return (
    <article className="flex flex-col gap-6">
      <header className="flex flex-col gap-3">
        <p className="text-sm text-regua">
          {obra} · {cliente ? 'Cliente' : 'Empreiteira'}: {contrato.nome}
        </p>
        <div className="flex flex-wrap items-center gap-3">
          <h2 className="text-xl font-semibold sm:text-2xl">Medição nº {m.numero}</h2>
          <SeloSituacao situacao={situacao} parte={contrato.parte} />
        </div>
        <p className="numeros text-regua">
          Período: {formatarData(m.inicio)} a {formatarData(m.fim)}
          {m.aprovada_em && ` · Aprovada por ${m.aprovada_nome ?? 'engenheiro'} em ${formatarData(m.aprovada_em.slice(0, 10))}`}
          {m.vencimento && !m.pago_em && ` · Vence em ${formatarData(m.vencimento)}`}
          {m.pago_em && ` · ${cliente ? 'Recebida' : 'Paga'} em ${formatarData(m.pago_em)} (${formatarMoeda(m.pago_valor)})`}
        </p>
        {rascunho && (
          <p className="max-w-3xl text-sm text-regua print:hidden">
            A sugestão é o executado até {formatarData(m.fim)} (último avanço apontado) menos o que já foi medido. Você pode medir menos; mais do que o
            executado o banco não aceita. Para medir mais, aponte o avanço da tarefa antes.
          </p>
        )}
      </header>

      <div className="flex flex-wrap items-center gap-3 print:hidden">
        <label className="flex min-h-11 items-center gap-2 text-sm">
          <input type="checkbox" checked={todos} onChange={(e) => setTodos(e.target.checked)} className="size-5 accent-cianotipia" />
          Mostrar todos os itens do contrato ({linhas.length})
        </label>
        {rascunho && (
          <Botao type="button" variante="discreto" onClick={medirTudo}>
            Medir tudo o que foi executado
          </Botao>
        )}
      </div>

      <div className="overflow-x-auto rounded-medio border border-linha bg-papel">
        <table className="numeros w-full min-w-[860px] text-left text-sm">
          <thead className="bg-concreto">
            <tr>
              <th className="px-4 py-2 font-semibold">Tarefa</th>
              <th className="px-3 py-2 text-right font-semibold">Contratado</th>
              <th className="px-3 py-2 text-right font-semibold">Preço unit.</th>
              <th className="px-3 py-2 text-right font-semibold">Já medido</th>
              <th className="px-3 py-2 text-right font-semibold">Executado até {formatarData(m.fim)}</th>
              <th className="px-3 py-2 text-right font-semibold">Esta medição</th>
              <th className="px-3 py-2 text-right font-semibold">Valor</th>
              <th className="px-3 py-2 text-right font-semibold">Acumulado</th>
            </tr>
          </thead>
          <tbody>
            {visiveis.length === 0 && (
              <tr>
                <td colSpan={8} className="px-4 py-4 text-regua">
                  Nada executado além do já medido neste período. Aponte o avanço das tarefas ou marque “Mostrar todos os itens”.
                </td>
              </tr>
            )}
            {visiveis.map((l) => (
              <tr key={l.itemId} className={`border-t border-linha ${l.problema ? 'bg-marcador-claro/60' : ''}`}>
                <td className="px-4 py-2">
                  <span className="text-regua">{l.codigo}</span> {l.tarefa}
                  {l.problema && <span className="block text-xs font-semibold text-marcador">{l.problema}</span>}
                </td>
                <td className="px-3 py-2 text-right whitespace-nowrap">
                  {fmt(l.contratado)} {l.unidade}
                </td>
                <td className="px-3 py-2 text-right">{formatarMoeda(l.precoUnitario)}</td>
                <td className="px-3 py-2 text-right text-regua">{l.antes > 0 ? fmt(l.antes) : '—'}</td>
                <td className="px-3 py-2 text-right">{fmt(l.executado)}</td>
                <td className="px-3 py-2 text-right">
                  {rascunho ? (
                    <label className="flex items-center justify-end gap-2">
                      <span className="sr-only">Quantidade medida de {l.tarefa}</span>
                      <input
                        inputMode="decimal"
                        value={valores[l.itemId] ?? ''}
                        onChange={(e) => setValores((v) => ({ ...v, [l.itemId]: e.target.value }))}
                        aria-invalid={l.problema ? true : undefined}
                        className={`${classeEntrada} numeros w-28 text-right`}
                        placeholder="0"
                      />
                      <span className="w-8 text-left text-regua">{l.unidade}</span>
                    </label>
                  ) : (
                    <span className="font-semibold whitespace-nowrap">
                      {fmt(l.q)} {l.unidade}
                    </span>
                  )}
                </td>
                <td className="px-3 py-2 text-right font-semibold">{l.valor > 0 ? formatarMoeda(l.valor) : '—'}</td>
                <td className="px-3 py-2 text-right text-regua whitespace-nowrap">
                  {fmt(l.acumulado)} ({Math.round((l.acumulado / l.contratado) * 100)}%)
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot className="border-t-2 border-grafite/20">
            <tr>
              <td colSpan={6} className="px-4 py-2 text-right">
                Valor bruto
              </td>
              <td className="px-3 py-2 text-right font-semibold">{formatarMoeda(bruto)}</td>
              <td />
            </tr>
            <tr>
              <td colSpan={6} className="px-4 py-2 text-right">
                Retenção ({contrato.retencao_pct.toLocaleString('pt-BR')}%)
              </td>
              <td className="px-3 py-2 text-right">− {formatarMoeda(retencao)}</td>
              <td />
            </tr>
            <tr>
              <td colSpan={6} className="px-4 py-2 text-right font-semibold">
                {cliente ? 'A receber' : 'A pagar'}
              </td>
              <td className="px-3 py-2 text-right text-base font-semibold">{formatarMoeda(cent(bruto - retencao))}</td>
              <td />
            </tr>
          </tfoot>
        </table>
      </div>

      {/* No celular a tabela rola de lado: os totais repetem aqui, sempre à vista. */}
      <dl className="numeros grid grid-cols-3 gap-px overflow-hidden rounded-medio border border-linha bg-linha text-sm sm:hidden">
        <div className="bg-papel px-3 py-2">
          <dt className="text-regua">Bruto</dt>
          <dd className="font-semibold">{formatarMoeda(bruto)}</dd>
        </div>
        <div className="bg-papel px-3 py-2">
          <dt className="text-regua">Retenção</dt>
          <dd>{formatarMoeda(retencao)}</dd>
        </div>
        <div className="bg-papel px-3 py-2">
          <dt className="text-regua">{cliente ? 'A receber' : 'A pagar'}</dt>
          <dd className="font-semibold">{formatarMoeda(cent(bruto - retencao))}</dd>
        </div>
      </dl>

      {erro && <AvisoErro>{erro}</AvisoErro>}
      {aviso && (
        <p role="status" className="text-sm font-semibold text-obra-ok">
          {aviso}
        </p>
      )}

      {rascunho ? (
        <div className="flex flex-col gap-4 print:hidden">
          <Campo rotulo="Observação do boletim" nome="med-obs" dica="Aparece no boletim impresso.">
            <textarea id="med-obs" value={obs} onChange={(e) => setObs(e.target.value)} rows={2} className={classeEntrada} />
          </Campo>
          <div className="flex flex-wrap gap-3">
            <Botao type="button" disabled={!mudou || comProblema || rodando} onClick={salvar}>
              {rodando ? 'Salvando…' : 'Salvar medição'}
            </Botao>
            {obs !== (m.observacao ?? '') && (
              <Botao
                type="button"
                variante="secundario"
                disabled={rodando}
                onClick={() =>
                  iniciar(async () => {
                    const r = await observarMedicao(projetoId, m.id, obs);
                    if (!r.ok) setErro(r.erro);
                    router.refresh();
                  })
                }
              >
                Salvar observação
              </Botao>
            )}
            {podeAprovar && (
              <Botao
                type="button"
                variante="secundario"
                disabled={mudou || rodando || m.valor_bruto <= 0}
                title={mudou ? 'Salve a medição antes de aprovar' : undefined}
                onClick={() => {
                  if (
                    !window.confirm(
                      `Aprovar a medição nº ${m.numero} de ${formatarMoeda(m.valor_liquido)} líquidos? Depois de aprovada ela não muda mais.`,
                    )
                  )
                    return;
                  setErro(null);
                  iniciar(async () => {
                    const r = await aprovarMedicao(projetoId, m.id);
                    if (!r.ok) setErro(r.erro);
                    router.refresh();
                  });
                }}
              >
                Aprovar medição
              </Botao>
            )}
            <Botao
              type="button"
              variante="discreto"
              disabled={rodando}
              onClick={() => {
                if (!window.confirm(`Apagar o rascunho da medição nº ${m.numero}?`)) return;
                iniciar(async () => {
                  const r = await excluirMedicao(projetoId, m.id);
                  if (r && !r.ok) setErro(r.erro);
                });
              }}
            >
              Apagar rascunho
            </Botao>
          </div>
          {!podeAprovar && <p className="text-sm text-regua">Quem aprova a medição é o engenheiro da obra.</p>}
        </div>
      ) : (
        <>
          {m.observacao && <p className="text-sm">Observação: {m.observacao}</p>}
          {m.status === 'aprovada' && <FormularioPagamento projetoId={projetoId} medicao={m} hoje={hoje} cliente={cliente} />}
          <div className="print:hidden">
            <Botao type="button" variante="secundario" onClick={() => window.print()}>
              Imprimir boletim
            </Botao>
          </div>
          <div className="hidden grid-cols-2 gap-10 pt-16 text-center text-sm print:grid">
            <p className="border-t border-grafite pt-2">Engenheiro responsável</p>
            <p className="border-t border-grafite pt-2">{cliente ? 'Cliente' : 'Contratada'}</p>
          </div>
        </>
      )}
    </article>
  );
}

function FormularioPagamento({ projetoId, medicao, hoje, cliente }: { projetoId: string; medicao: Medicao; hoje: string; cliente: boolean }) {
  const [estado, acao, salvando] = useActionState<EstadoForm, FormData>(registrarPagamentoMedicao, {});
  const e = estado.erros ?? {};
  return (
    <form action={acao} className="flex flex-col gap-3 rounded-medio border border-linha bg-papel p-4 sm:flex-row sm:items-end print:hidden">
      <input type="hidden" name="projeto_id" value={projetoId} />
      <input type="hidden" name="medicao_id" value={medicao.id} />
      <div className="sm:w-48">
        <Campo rotulo={cliente ? 'Recebido em' : 'Pago em'} nome="pg-data" erro={e.data}>
          <input id="pg-data" type="date" name="data" defaultValue={hoje} max={hoje} className={classeEntrada} />
        </Campo>
      </div>
      <div className="sm:w-48">
        <Campo rotulo="Valor (R$)" nome="pg-valor" erro={e.valor}>
          <input
            id="pg-valor"
            name="valor"
            inputMode="decimal"
            defaultValue={medicao.valor_liquido.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            className={`${classeEntrada} numeros`}
          />
        </Campo>
      </div>
      <Botao type="submit" disabled={salvando}>
        {salvando ? 'Registrando…' : cliente ? 'Registrar recebimento' : 'Registrar pagamento'}
      </Botao>
      {estado.erroGeral && <AvisoErro>{estado.erroGeral}</AvisoErro>}
      {estado.ok && estado.mensagem && <p className="text-sm font-semibold text-obra-ok">{estado.mensagem}</p>}
    </form>
  );
}
