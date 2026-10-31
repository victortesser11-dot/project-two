'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { formatarData, hojeIso, type ApontamentoEntrada, type ItemEap } from '@obras/shared';
import { sincronizarApontamentos } from './acoes';
import { tarefasDoDia } from './selecao';
import { classeEntrada } from '@/components/ui';

type Pendente = ApontamentoEntrada & { erro?: string; definitivo?: boolean };

const quantidadeBr = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 2 });

function lerFila(chave: string): Pendente[] {
  try {
    const bruto = localStorage.getItem(chave);
    const lista = bruto ? JSON.parse(bruto) : [];
    return Array.isArray(lista) ? lista : [];
  } catch {
    return [];
  }
}

function gravarFila(chave: string, fila: Pendente[]) {
  try {
    if (fila.length === 0) localStorage.removeItem(chave);
    else localStorage.setItem(chave, JSON.stringify(fila));
  } catch {
    // Sem armazenamento (modo privado): a fila vive só nesta aba.
  }
}

/**
 * Tarefas do dia com apontamento de avanço que funciona sem sinal: cada
 * apontamento entra numa fila no aparelho e sobe quando a internet volta.
 */
export function ListaHoje({
  projetoId,
  usuarioId,
  itens,
  etapas,
  podeApontar,
}: {
  projetoId: string;
  /** A fila é de cada pessoa: quem entrar depois no mesmo aparelho não envia a fila de outra. */
  usuarioId: string;
  itens: ItemEap[];
  etapas: Record<string, string>;
  podeApontar: boolean;
}) {
  const chave = `obras:fila-avanco:${usuarioId}:${projetoId}`;
  const [fila, setFila] = useState<Pendente[]>([]);
  const [online, setOnline] = useState(true);
  const [enviando, setEnviando] = useState(false);
  const [aviso, setAviso] = useState<string | null>(null);
  const enviandoRef = useRef(false);
  const hoje = hojeIso();

  // Fila salva no aparelho + service worker para abrir a página sem sinal.
  useEffect(() => {
    setFila(lerFila(chave));
    setOnline(navigator.onLine);
    if ('serviceWorker' in navigator) navigator.serviceWorker.register('/sw.js').catch(() => {});
  }, [chave]);

  const atualizarFila = useCallback(
    (mudar: (f: Pendente[]) => Pendente[]) => {
      setFila((atual) => {
        const nova = mudar(atual);
        gravarFila(chave, nova);
        return nova;
      });
    },
    [chave],
  );

  const enviar = useCallback(async () => {
    if (enviandoRef.current || !navigator.onLine) return;
    const lote = lerFila(chave).filter((p) => !p.definitivo);
    if (lote.length === 0) return;
    enviandoRef.current = true;
    setEnviando(true);
    try {
      const resultados = await sincronizarApontamentos(
        projetoId,
        lote.map(({ erro: _e, definitivo: _d, ...a }) => a),
      );
      const porId = new Map(resultados.map((r) => [r.id, r]));
      atualizarFila((atual) =>
        atual.flatMap((p) => {
          const r = porId.get(p.id);
          if (!r) return [p];
          if (r.ok) return [];
          return [{ ...p, erro: r.erro, definitivo: r.definitivo }];
        }),
      );
      const recusados = resultados.filter((r) => !r.ok && r.definitivo).length;
      const ok = resultados.filter((r) => r.ok).length;
      setAviso(
        recusados > 0
          ? `${recusados} ${recusados === 1 ? 'apontamento foi recusado' : 'apontamentos foram recusados'}. Veja abaixo.`
          : ok > 0
            ? `${ok} ${ok === 1 ? 'apontamento enviado' : 'apontamentos enviados'}.`
            : null,
      );
    } catch {
      // Sem conexão com o servidor: tudo continua na fila.
    } finally {
      enviandoRef.current = false;
      setEnviando(false);
    }
  }, [atualizarFila, chave, projetoId]);

  // Envia ao abrir, quando o sinal volta e a cada 30 s enquanto houver fila.
  useEffect(() => {
    const ligou = () => {
      setOnline(true);
      void enviar();
    };
    const caiu = () => setOnline(false);
    window.addEventListener('online', ligou);
    window.addEventListener('offline', caiu);
    void enviar();
    const timer = window.setInterval(() => void enviar(), 30_000);
    return () => {
      window.removeEventListener('online', ligou);
      window.removeEventListener('offline', caiu);
      window.clearInterval(timer);
    };
  }, [enviar]);

  // % mostrado = último apontamento na fila (ainda não enviado) ou o do servidor.
  const pctLocal = useMemo(() => {
    const m = new Map<string, number>();
    for (const p of fila) if (!p.definitivo && p.percentual !== null && p.percentual !== undefined) m.set(p.tarefa_id, p.percentual);
    return m;
  }, [fila]);
  const qtdLocal = useMemo(() => {
    const m = new Map<string, number>();
    for (const p of fila) if (!p.definitivo && p.quantidade) m.set(p.tarefa_id, (m.get(p.tarefa_id) ?? 0) + p.quantidade);
    return m;
  }, [fila]);

  function apontar(tarefa: ItemEap, valores: { percentual?: number; quantidade?: number; observacao?: string }) {
    const novo: Pendente = {
      id: crypto.randomUUID(),
      tarefa_id: tarefa.id,
      data: hoje,
      percentual: valores.percentual ?? null,
      quantidade: valores.quantidade ?? null,
      observacao: valores.observacao?.trim() || null,
    };
    atualizarFila((f) => [...f, novo]);
    setAviso(navigator.onLine ? null : 'Sem sinal: o apontamento ficou guardado no aparelho e sobe sozinho quando a internet voltar.');
    void enviar();
  }

  const grupos = tarefasDoDia(itens, hoje);
  const pendentes = fila.filter((p) => !p.definitivo).length;
  const recusados = fila.filter((p) => p.definitivo);
  const nomeTarefa = new Map(itens.map((i) => [i.id, i.nome]));

  return (
    <div className="flex flex-col gap-6">
      {/* Situação da conexão e da fila */}
      <div
        role="status"
        className={`flex flex-wrap items-center justify-between gap-3 rounded-medio px-4 py-3 text-sm ${
          !online ? 'bg-marcador-claro text-marcador' : pendentes > 0 ? 'bg-cianotipia-claro text-cianotipia' : 'bg-concreto text-regua'
        }`}
      >
        <span className="font-semibold">
          {!online
            ? `Sem sinal. ${pendentes > 0 ? `${pendentes} ${pendentes === 1 ? 'apontamento guardado' : 'apontamentos guardados'} no aparelho.` : 'Os apontamentos ficam guardados no aparelho.'}`
            : pendentes > 0
              ? enviando
                ? `Enviando ${pendentes} ${pendentes === 1 ? 'apontamento' : 'apontamentos'}…`
                : `${pendentes} ${pendentes === 1 ? 'apontamento esperando' : 'apontamentos esperando'} envio.`
              : 'Tudo enviado.'}
        </span>
        {online && pendentes > 0 && !enviando && (
          <button type="button" onClick={() => void enviar()} className="min-h-11 font-semibold underline underline-offset-4">
            Enviar agora
          </button>
        )}
      </div>
      {aviso && <p className="-mt-3 text-sm text-regua">{aviso}</p>}

      {recusados.length > 0 && (
        <section aria-labelledby="titulo-recusados" className="rounded-medio border border-marcador/40 bg-marcador-claro p-4">
          <h2 id="titulo-recusados" className="font-semibold text-marcador">
            Apontamentos recusados
          </h2>
          <ul className="mt-2 flex flex-col gap-2 text-sm">
            {recusados.map((p) => (
              <li key={p.id} className="flex flex-wrap items-center justify-between gap-2">
                <span>
                  <strong className="font-semibold">{nomeTarefa.get(p.tarefa_id) ?? 'Tarefa'}</strong>
                  {p.percentual !== null ? ` · ${p.percentual}%` : p.quantidade ? ` · ${quantidadeBr.format(p.quantidade)}` : ''}: {p.erro}
                </span>
                <button
                  type="button"
                  onClick={() => atualizarFila((f) => f.filter((x) => x.id !== p.id))}
                  className="min-h-11 font-semibold text-marcador underline underline-offset-4"
                >
                  Descartar
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}

      <Grupo
        titulo="Atrasadas"
        descricao="Já deviam ter terminado."
        tarefas={grupos.atrasadas}
        alerta
        {...{ etapas, hoje, podeApontar, pctLocal, qtdLocal, apontar }}
      />
      <Grupo
        titulo="Previstas para hoje"
        descricao={formatarData(hoje)}
        tarefas={grupos.emAndamento}
        vazio="Nenhuma tarefa prevista para hoje."
        {...{ etapas, hoje, podeApontar, pctLocal, qtdLocal, apontar }}
      />
      <Grupo
        titulo="Próximos dias"
        descricao="Para separar equipe e material."
        tarefas={grupos.proximas}
        {...{ etapas, hoje, podeApontar, pctLocal, qtdLocal, apontar }}
      />
      {grupos.concluidasHoje.length > 0 && (
        <p className="text-sm text-obra-ok">
          Concluídas hoje: {grupos.concluidasHoje.map((t) => t.nome).join(', ')}.
        </p>
      )}
    </div>
  );
}

function Grupo({
  titulo,
  descricao,
  tarefas,
  vazio,
  alerta,
  etapas,
  hoje,
  podeApontar,
  pctLocal,
  qtdLocal,
  apontar,
}: {
  titulo: string;
  descricao: string;
  tarefas: ItemEap[];
  vazio?: string;
  alerta?: boolean;
  etapas: Record<string, string>;
  hoje: string;
  podeApontar: boolean;
  pctLocal: Map<string, number>;
  qtdLocal: Map<string, number>;
  apontar: (t: ItemEap, v: { percentual?: number; quantidade?: number; observacao?: string }) => void;
}) {
  if (tarefas.length === 0 && !vazio) return null;
  const idTitulo = `grupo-${titulo.replace(/\W+/g, '-').toLowerCase()}`;
  return (
    <section aria-labelledby={idTitulo}>
      <div className="flex items-baseline justify-between gap-3">
        <h2 id={idTitulo} className={`text-lg font-semibold ${alerta ? 'text-marcador' : ''}`}>
          {titulo} <span className="numeros text-base font-normal text-regua">({tarefas.length})</span>
        </h2>
        <span className="text-sm text-regua">{descricao}</span>
      </div>
      {tarefas.length === 0 ? (
        <p className="mt-2 text-sm text-regua">{vazio}</p>
      ) : (
        <ul className="mt-3 flex flex-col gap-3">
          {tarefas.map((t) => (
            <CartaoTarefa
              key={t.id}
              tarefa={t}
              etapa={etapas[t.id]}
              hoje={hoje}
              podeApontar={podeApontar}
              pctPendente={pctLocal.get(t.id)}
              qtdPendente={qtdLocal.get(t.id)}
              onApontar={(v) => apontar(t, v)}
            />
          ))}
        </ul>
      )}
    </section>
  );
}

const ATALHOS = [25, 50, 75, 100];

function CartaoTarefa({
  tarefa,
  etapa,
  hoje,
  podeApontar,
  pctPendente,
  qtdPendente,
  onApontar,
}: {
  tarefa: ItemEap;
  etapa?: string;
  hoje: string;
  podeApontar: boolean;
  pctPendente?: number;
  qtdPendente?: number;
  onApontar: (v: { percentual?: number; quantidade?: number; observacao?: string }) => void;
}) {
  const [aberto, setAberto] = useState(false);
  const [modo, setModo] = useState<'pct' | 'qtd'>(tarefa.quantidade && tarefa.unidade ? 'qtd' : 'pct');
  const [pct, setPct] = useState('');
  const [qtd, setQtd] = useState('');
  const [obs, setObs] = useState('');
  const [erro, setErro] = useState<string | null>(null);

  const temQuantidade = Boolean(tarefa.quantidade && Number(tarefa.quantidade) > 0);
  // Estimativa local enquanto a quantidade não sobe (o banco faz a conta oficial).
  const pctQtdPendente =
    qtdPendente && temQuantidade
      ? Math.min(100, Number(tarefa.percentual_fisico) + (qtdPendente / Number(tarefa.quantidade)) * 100)
      : undefined;
  const atual = pctPendente ?? pctQtdPendente ?? Number(tarefa.percentual_fisico);
  const pendente = pctPendente !== undefined || pctQtdPendente !== undefined;
  const dias = (iso: string | null) => (iso ? Math.round((Date.parse(iso) - Date.parse(hoje)) / 86_400_000) : null);
  const restam = dias(tarefa.fim_previsto);
  const comecaEm = dias(tarefa.inicio_previsto);
  const id = (c: string) => `${tarefa.id}-${c}`;

  function salvar(valor?: number) {
    setErro(null);
    if (modo === 'pct' || valor !== undefined) {
      const n = valor ?? Number(pct.replace(',', '.'));
      if (valor === undefined && pct.trim() === '') return setErro('Informe o avanço em %.');
      if (!Number.isFinite(n)) return setErro('Use só números.');
      if (n < 0 || n > 100) return setErro('Use um valor entre 0 e 100.');
      onApontar({ percentual: Math.round(n * 100) / 100, observacao: obs });
    } else {
      const n = Number(qtd.replace(/\./g, '').replace(',', '.'));
      if (qtd === '' || !Number.isFinite(n) || n <= 0) return setErro('Informe a quantidade feita hoje.');
      onApontar({ quantidade: n, observacao: obs });
    }
    setPct('');
    setQtd('');
    setObs('');
    setAberto(false);
  }

  return (
    <li className="rounded-medio border border-linha bg-papel">
      <div className="px-4 pt-4 pb-3">
        {etapa && <p className="text-xs text-regua">{etapa}</p>}
        <p className="font-semibold break-words">
          <span className="numeros mr-1.5 text-sm font-normal text-regua">{tarefa.codigo}</span>
          {tarefa.nome}
        </p>
        <p className="numeros mt-0.5 text-sm text-regua">
          {formatarData(tarefa.inicio_previsto)} a {formatarData(tarefa.fim_previsto)}
          {comecaEm !== null && comecaEm > 0
            ? ` · começa ${comecaEm === 1 ? 'amanhã' : `em ${comecaEm} dias`}`
            : restam !== null && restam >= 0 && ` · ${restam === 0 ? 'termina hoje' : `faltam ${restam} ${restam === 1 ? 'dia' : 'dias'}`}`}
          {restam !== null && restam < 0 && <span className="font-semibold text-marcador"> · {-restam} {restam === -1 ? 'dia' : 'dias'} de atraso</span>}
        </p>
        <div className="mt-3 flex items-center gap-3">
          <div
            className="h-2.5 flex-1 overflow-hidden rounded-full bg-linha"
            role="progressbar"
            aria-valuenow={Math.round(atual)}
            aria-valuemin={0}
            aria-valuemax={100}
            aria-label={`Avanço de ${tarefa.nome}`}
          >
            <div className={`h-full rounded-full ${pendente ? 'bg-cianotipia/60' : 'bg-cianotipia'}`} style={{ width: `${atual}%` }} />
          </div>
          <span className="numeros w-14 text-right font-semibold">{Math.round(atual)}%</span>
        </div>
        {pendente && <p className="mt-1 text-xs text-cianotipia">Apontamento guardado, esperando envio.</p>}
      </div>

      {podeApontar &&
        (aberto ? (
          <div className="flex flex-col gap-3 border-t border-linha bg-concreto/60 px-4 py-4">
            {temQuantidade && (
              <div role="group" aria-label="Como apontar" className="inline-flex self-start rounded-medio border border-linha bg-papel p-0.5">
                {(['qtd', 'pct'] as const).map((m) => (
                  <button
                    key={m}
                    type="button"
                    aria-pressed={modo === m}
                    onClick={() => setModo(m)}
                    className={`min-h-10 rounded-[8px] px-3 text-sm font-semibold ${modo === m ? 'bg-cianotipia text-white' : 'text-regua'}`}
                  >
                    {m === 'qtd' ? `Feito hoje (${tarefa.unidade ?? 'un'})` : 'Avanço total (%)'}
                  </button>
                ))}
              </div>
            )}

            {modo === 'pct' || !temQuantidade ? (
              <>
                <div className="grid grid-cols-4 gap-2">
                  {ATALHOS.map((v) => (
                    <button
                      key={v}
                      type="button"
                      onClick={() => salvar(v)}
                      className="numeros min-h-12 rounded-medio border border-campo/60 bg-papel text-base font-semibold hover:border-cianotipia hover:text-cianotipia"
                    >
                      {v}%
                    </button>
                  ))}
                </div>
                <label htmlFor={id('pct')} className="text-sm font-semibold">
                  Ou digite o avanço total
                </label>
                <div className="flex gap-2">
                  <input
                    id={id('pct')}
                    inputMode="decimal"
                    value={pct}
                    onChange={(e) => setPct(e.target.value)}
                    placeholder={`${Math.round(atual)}`}
                    className={`${classeEntrada} numeros`}
                    aria-describedby={erro ? id('erro') : undefined}
                  />
                  <span className="self-center font-semibold">%</span>
                </div>
              </>
            ) : (
              <>
                <label htmlFor={id('qtd')} className="text-sm font-semibold">
                  Quanto foi feito hoje ({tarefa.unidade})
                </label>
                <input
                  id={id('qtd')}
                  inputMode="decimal"
                  value={qtd}
                  onChange={(e) => setQtd(e.target.value)}
                  placeholder="0"
                  className={`${classeEntrada} numeros`}
                  aria-describedby={id('qtd-dica')}
                />
                <p id={id('qtd-dica')} className="numeros text-sm text-regua">
                  Previsto na tarefa: {quantidadeBr.format(Number(tarefa.quantidade))} {tarefa.unidade}.
                </p>
              </>
            )}

            <label htmlFor={id('obs')} className="text-sm font-semibold">
              Observação <span className="font-normal text-regua">(opcional)</span>
            </label>
            <input
              id={id('obs')}
              value={obs}
              onChange={(e) => setObs(e.target.value)}
              maxLength={500}
              placeholder="Ex.: faltou bloco à tarde"
              className={classeEntrada}
            />
            {erro && (
              <p id={id('erro')} role="alert" className="text-sm text-marcador">
                {erro}
              </p>
            )}
            <div className="flex gap-2">
              <button
                type="button"
                onClick={() => salvar()}
                className="min-h-12 flex-1 rounded-medio bg-cianotipia px-4 font-semibold text-white hover:bg-cianotipia-escuro"
              >
                Salvar avanço
              </button>
              <button
                type="button"
                onClick={() => setAberto(false)}
                className="min-h-12 rounded-medio border border-campo/60 bg-papel px-4 font-semibold"
              >
                Cancelar
              </button>
            </div>
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setAberto(true)}
            className="flex min-h-12 w-full items-center justify-center gap-2 border-t border-linha font-semibold text-cianotipia hover:bg-cianotipia-claro"
          >
            Apontar avanço
          </button>
        ))}
    </li>
  );
}
