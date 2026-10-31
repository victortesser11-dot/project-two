'use client';

import Link from 'next/link';
import { Fragment, useCallback, useEffect, useMemo, useRef, useState, useTransition } from 'react';
import { diasEntre, formatarData, formatarMoeda, type ItemEap } from '@obras/shared';
import { alterarTipoItem, excluirItem, reposicionarItem, type AcaoPosicao, type ResultadoAcao } from './acoes';
import { FormularioItem, type ModoFormulario } from './FormularioItem';
import { classeBotao } from '@/components/ui';

const quantidadeBr = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 4 });

function prazo(item: ItemEap) {
  if (!item.inicio_previsto || !item.fim_previsto) return null;
  return diasEntre(item.inicio_previsto, item.fim_previsto) + 1;
}

/** Última posição do código (1.2.3 → 3): a posição do item entre os irmãos. */
function posicaoEntreIrmaos(item: ItemEap) {
  return Number(item.codigo.split('.').at(-1));
}

function temValores(item: ItemEap) {
  return item.unidade !== null || item.quantidade !== null || item.custo_previsto !== null || item.inicio_previsto !== null || item.fim_previsto !== null;
}

export function ArvoreEap({
  projetoId,
  itens,
  podeEditar,
}: {
  projetoId: string;
  itens: ItemEap[];
  podeEditar: boolean;
}) {
  // Árvores grandes abrem só com o primeiro nível visível.
  const [recolhidos, setRecolhidos] = useState<Set<string>>(
    () => new Set(itens.length > 80 ? itens.filter((i) => i.tipo === 'etapa' && i.nivel === 1).map((i) => i.id) : []),
  );
  const [formulario, setFormulario] = useState<{ ancora: string | 'fim'; config: ModoFormulario } | null>(null);
  const [mensagem, setMensagem] = useState<{ tipo: 'erro' | 'ok'; texto: string } | null>(null);
  const [ocupado, setOcupado] = useState<string | null>(null);
  const [, iniciar] = useTransition();
  const avisoRef = useRef<HTMLDivElement>(null);

  const fecharFormulario = useCallback(() => setFormulario(null), []);

  const visiveis = useMemo(() => {
    const saida: ItemEap[] = [];
    let escondendoAbaixoDe: number | null = null;
    for (const item of itens) {
      if (escondendoAbaixoDe !== null) {
        if (item.nivel > escondendoAbaixoDe) continue;
        escondendoAbaixoDe = null;
      }
      saida.push(item);
      if (item.tipo === 'etapa' && recolhidos.has(item.id)) escondendoAbaixoDe = item.nivel;
    }
    return saida;
  }, [itens, recolhidos]);

  const etapas = itens.filter((i) => i.tipo === 'etapa');
  const tudoAberto = etapas.every((e) => !recolhidos.has(e.id));

  function alternar(id: string) {
    setRecolhidos((atual) => {
      const novo = new Set(atual);
      if (novo.has(id)) novo.delete(id);
      else novo.add(id);
      return novo;
    });
  }

  function executar(itemId: string, acao: () => Promise<ResultadoAcao>) {
    setOcupado(itemId);
    setMensagem(null);
    iniciar(async () => {
      const r = await acao();
      setOcupado(null);
      if (!r.ok) {
        setMensagem({ tipo: 'erro', texto: r.erro });
        avisoRef.current?.focus();
      } else if (r.mensagem) {
        setMensagem({ tipo: 'ok', texto: r.mensagem });
      }
    });
  }

  function abrirNovo(ancora: string | 'fim', config: Extract<ModoFormulario, { modo: 'novo' }>) {
    setMensagem(null);
    setFormulario({ ancora, config });
    if (config.paiId) setRecolhidos((atual) => {
      const novo = new Set(atual);
      novo.delete(config.paiId!);
      return novo;
    });
  }

  if (itens.length === 0 && !formulario) {
    return (
      <section className="rounded-medio border border-dashed border-regua/50 bg-papel px-5 py-10 sm:px-8">
        <h2 className="text-xl font-semibold sm:text-2xl">Monte a EAP da obra</h2>
        <p className="mt-3 max-w-xl text-regua">
          A EAP organiza a obra em etapas e tarefas. Cada tarefa leva quantidade, custo previsto e datas; as etapas somam tudo
          que está dentro delas. Equipe, materiais e fotos vão se ligar a essas tarefas.
        </p>
        {podeEditar ? (
          <div className="mt-6 flex flex-wrap gap-3">
            <Link href={`/projetos/${projetoId}/cronograma/importar`} className={classeBotao('primario')}>
              Importar planilha ou MS Project
            </Link>
            <button
              type="button"
              className={classeBotao('secundario')}
              onClick={() => abrirNovo('fim', { modo: 'novo', paiId: null, tipo: 'etapa', ondeTexto: 'Primeira etapa' })}
            >
              Criar a primeira etapa
            </button>
          </div>
        ) : (
          <p className="mt-6 text-sm font-medium">O engenheiro responsável ainda não montou a EAP.</p>
        )}
      </section>
    );
  }

  return (
    <section aria-label="EAP">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
        <button
          type="button"
          className="text-sm font-medium text-cianotipia hover:underline underline-offset-4 disabled:text-regua"
          disabled={etapas.length === 0}
          onClick={() => setRecolhidos(tudoAberto ? new Set(etapas.map((e) => e.id)) : new Set())}
        >
          {tudoAberto ? 'Recolher todas as etapas' : 'Abrir todas as etapas'}
        </button>
        {podeEditar && (
          <div className="flex flex-wrap gap-2">
            <Link href={`/projetos/${projetoId}/cronograma/importar`} className={classeBotao('secundario', 'text-sm')}>
              Importar
            </Link>
            <button
              type="button"
              className={classeBotao('primario', 'text-sm')}
              onClick={() => abrirNovo('fim', { modo: 'novo', paiId: null, tipo: 'etapa', ondeTexto: 'Nova etapa no fim da EAP' })}
            >
              Nova etapa
            </button>
          </div>
        )}
      </div>

      <div ref={avisoRef} tabIndex={-1} aria-live="polite" className="outline-none">
        {mensagem && (
          <div
            role={mensagem.tipo === 'erro' ? 'alert' : 'status'}
            className={`mb-3 flex items-start justify-between gap-3 rounded-medio border px-4 py-3 text-sm ${
              mensagem.tipo === 'erro' ? 'border-marcador/40 bg-marcador-claro text-marcador' : 'border-obra-ok/30 bg-white text-obra-ok'
            }`}
          >
            <span>{mensagem.texto}</span>
            <button type="button" onClick={() => setMensagem(null)} className="font-semibold" aria-label="Fechar aviso">
              ×
            </button>
          </div>
        )}
      </div>

      <div className="overflow-hidden rounded-medio border border-linha bg-papel">
        {/* Cabeçalho das colunas (telas largas) */}
        <div className="hidden grid-cols-[minmax(0,1fr)_7rem_8.5rem_5.5rem_5.5rem_3.5rem_2.75rem] gap-3 border-b border-linha px-4 py-2 text-xs font-semibold text-regua md:grid">
          <span>Item</span>
          <span className="text-right">Quantidade</span>
          <span className="text-right">Custo previsto</span>
          <span>Início</span>
          <span>Término</span>
          <span className="text-right">Dias</span>
          <span className="sr-only">Ações</span>
        </div>

        <ol className="divide-y divide-linha">
          {visiveis.map((item) => (
            <Fragment key={item.id}>
              <Linha
                item={item}
                aberto={!recolhidos.has(item.id)}
                ocupado={ocupado === item.id}
                podeEditar={podeEditar}
                onAlternar={() => alternar(item.id)}
                onEditar={() => {
                  setMensagem(null);
                  setFormulario({ ancora: item.id, config: { modo: 'editar', item } });
                }}
                onNovoDentro={(tipo) =>
                  abrirNovo(item.id, { modo: 'novo', paiId: item.id, tipo, ondeTexto: `Nova ${tipo} dentro de ${item.codigo} ${item.nome}` })
                }
                onNovoAbaixo={() =>
                  abrirNovo(item.id, {
                    modo: 'novo',
                    paiId: item.pai_id,
                    tipo: item.tipo,
                    posicao: posicaoEntreIrmaos(item) + 1,
                    ondeTexto: `Novo item logo abaixo de ${item.codigo}`,
                  })
                }
                onMover={(acao) => executar(item.id, () => reposicionarItem(projetoId, item.id, acao))}
                onTipo={(tipo) => executar(item.id, () => alterarTipoItem(projetoId, item.id, tipo))}
                onExcluir={() => {
                  const dentro = item.qtd_filhos > 0 ? ' e tudo que está dentro dela' : '';
                  if (window.confirm(`Excluir ${item.codigo} "${item.nome}"${dentro}? Não dá para desfazer.`)) {
                    executar(item.id, () => excluirItem(projetoId, item.id));
                  }
                }}
              />
              {formulario && formulario.ancora === item.id && (
                <li>
                  <FormularioItem key={JSON.stringify(formulario.config)} projetoId={projetoId} config={formulario.config} onFechar={fecharFormulario} />
                </li>
              )}
            </Fragment>
          ))}
          {formulario && formulario.ancora === 'fim' && (
            <li>
              <FormularioItem projetoId={projetoId} config={formulario.config} onFechar={fecharFormulario} />
            </li>
          )}
        </ol>
      </div>
    </section>
  );
}

function Linha({
  item,
  aberto,
  ocupado,
  podeEditar,
  onAlternar,
  onEditar,
  onNovoDentro,
  onNovoAbaixo,
  onMover,
  onTipo,
  onExcluir,
}: {
  item: ItemEap;
  aberto: boolean;
  ocupado: boolean;
  podeEditar: boolean;
  onAlternar: () => void;
  onEditar: () => void;
  onNovoDentro: (tipo: 'etapa' | 'tarefa') => void;
  onNovoAbaixo: () => void;
  onMover: (acao: AcaoPosicao) => void;
  onTipo: (tipo: 'etapa' | 'tarefa') => void;
  onExcluir: () => void;
}) {
  const etapa = item.tipo === 'etapa';
  const dias = prazo(item);
  const recuo = Math.min(item.nivel - 1, 5);
  const custo = item.custo_previsto === null ? null : Number(item.custo_previsto);

  return (
    <li
      className={`relative grid grid-cols-[minmax(0,1fr)_2.75rem] items-start gap-x-3 px-4 py-2.5 md:grid-cols-[minmax(0,1fr)_7rem_8.5rem_5.5rem_5.5rem_3.5rem_2.75rem] md:items-center ${
        etapa ? 'bg-concreto/70' : ''
      } ${ocupado ? 'opacity-60' : ''}`}
      aria-busy={ocupado}
    >
      {/* Nome, com recuo pelo nível */}
      <div className="flex min-w-0 items-start gap-1.5" style={{ paddingLeft: `${recuo * 0.9}rem` }}>
        {etapa ? (
          <button
            type="button"
            onClick={onAlternar}
            aria-expanded={aberto}
            aria-label={`${aberto ? 'Recolher' : 'Abrir'} ${item.nome}`}
            className="-ml-1 flex size-7 shrink-0 items-center justify-center rounded-pequeno text-regua hover:bg-linha/60 hover:text-grafite"
          >
            <svg aria-hidden viewBox="0 0 16 16" className={`size-4 transition-transform ${aberto ? 'rotate-90' : ''}`} fill="none" stroke="currentColor" strokeWidth="2">
              <path d="m6 3.5 4.5 4.5L6 12.5" />
            </svg>
          </button>
        ) : (
          <span aria-hidden className="w-6 shrink-0" />
        )}
        <div className="min-w-0 py-0.5">
          <p className="leading-snug">
            <span className="numeros mr-2 text-sm text-regua">{item.codigo}</span>
            <span className={etapa ? 'font-semibold' : ''}>{item.nome}</span>
          </p>
          {/* Resumo em telas estreitas */}
          <p className="numeros mt-0.5 flex flex-wrap gap-x-3 text-sm text-regua md:hidden">
            {etapa && <span>{item.qtd_tarefas === 1 ? '1 tarefa' : `${item.qtd_tarefas} tarefas`}</span>}
            {item.inicio_previsto && <span>{formatarData(item.inicio_previsto)} a {formatarData(item.fim_previsto)}</span>}
            {!etapa && item.quantidade !== null && (
              <span>
                {quantidadeBr.format(Number(item.quantidade))} {item.unidade ?? ''}
              </span>
            )}
            {custo !== null && <span className="font-semibold text-grafite">{formatarMoeda(custo)}</span>}
          </p>
        </div>
      </div>

      {/* Colunas em telas largas */}
      <span className="numeros hidden text-right text-sm md:block">
        {!etapa && item.quantidade !== null ? `${quantidadeBr.format(Number(item.quantidade))} ${item.unidade ?? ''}` : ''}
      </span>
      <span className={`numeros hidden text-right text-sm md:block ${etapa ? 'font-semibold' : ''}`}>{custo === null ? '' : formatarMoeda(custo)}</span>
      <span className="numeros hidden text-sm md:block">{item.inicio_previsto ? formatarData(item.inicio_previsto) : ''}</span>
      <span className="numeros hidden text-sm md:block">{item.fim_previsto ? formatarData(item.fim_previsto) : ''}</span>
      <span className="numeros hidden text-right text-sm text-regua md:block">{dias ?? ''}</span>

      {podeEditar ? (
        <MenuItem
          item={item}
          onEditar={onEditar}
          onNovoDentro={onNovoDentro}
          onNovoAbaixo={onNovoAbaixo}
          onMover={onMover}
          onTipo={onTipo}
          onExcluir={onExcluir}
        />
      ) : (
        <span />
      )}
    </li>
  );
}

function MenuItem({
  item,
  onEditar,
  onNovoDentro,
  onNovoAbaixo,
  onMover,
  onTipo,
  onExcluir,
}: {
  item: ItemEap;
  onEditar: () => void;
  onNovoDentro: (tipo: 'etapa' | 'tarefa') => void;
  onNovoAbaixo: () => void;
  onMover: (acao: AcaoPosicao) => void;
  onTipo: (tipo: 'etapa' | 'tarefa') => void;
  onExcluir: () => void;
}) {
  const ref = useRef<HTMLDetailsElement>(null);
  const etapa = item.tipo === 'etapa';

  // <details> não fecha sozinho: fecha ao tocar fora ou apertar Esc.
  useEffect(() => {
    const detalhes = ref.current;
    if (!detalhes) return;
    const fora = (e: PointerEvent) => {
      if (detalhes.open && !detalhes.contains(e.target as Node)) detalhes.open = false;
    };
    const esc = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && detalhes.open) {
        detalhes.open = false;
        detalhes.querySelector('summary')?.focus();
      }
    };
    document.addEventListener('pointerdown', fora);
    document.addEventListener('keydown', esc);
    return () => {
      document.removeEventListener('pointerdown', fora);
      document.removeEventListener('keydown', esc);
    };
  }, []);

  const fecharE = (fn: () => void) => () => {
    if (ref.current) ref.current.open = false;
    fn();
  };

  const opcao = 'block w-full px-4 py-2.5 text-left text-sm hover:bg-concreto/60 focus-visible:bg-concreto/60';

  return (
    <details ref={ref} className="relative justify-self-end">
      <summary
        className="flex size-11 cursor-pointer list-none items-center justify-center rounded-medio text-regua hover:bg-linha/60 hover:text-grafite [&::-webkit-details-marker]:hidden"
        aria-label={`Ações de ${item.codigo} ${item.nome}`}
      >
        <svg aria-hidden viewBox="0 0 16 16" className="size-5" fill="currentColor">
          <circle cx="3" cy="8" r="1.5" />
          <circle cx="8" cy="8" r="1.5" />
          <circle cx="13" cy="8" r="1.5" />
        </svg>
      </summary>
      <div className="absolute right-0 z-20 mt-1 w-64 overflow-hidden rounded-medio border border-linha bg-white py-1 shadow-[0_6px_20px_rgb(26_29_33/0.10)]">
        <button type="button" className={opcao} onClick={fecharE(onEditar)}>
          Editar
        </button>
        {etapa && (
          <>
            <button type="button" className={opcao} onClick={fecharE(() => onNovoDentro('tarefa'))}>
              Nova tarefa dentro
            </button>
            <button type="button" className={opcao} onClick={fecharE(() => onNovoDentro('etapa'))}>
              Nova etapa dentro
            </button>
          </>
        )}
        <button type="button" className={opcao} onClick={fecharE(onNovoAbaixo)}>
          Novo item logo abaixo
        </button>
        <hr className="my-1 border-linha" />
        <button type="button" className={opcao} onClick={fecharE(() => onMover('subir'))}>
          Subir
        </button>
        <button type="button" className={opcao} onClick={fecharE(() => onMover('descer'))}>
          Descer
        </button>
        <button type="button" className={opcao} onClick={fecharE(() => onMover('avancar'))}>
          Colocar dentro do item de cima
        </button>
        {item.nivel > 1 && (
          <button type="button" className={opcao} onClick={fecharE(() => onMover('recuar'))}>
            Tirar da etapa
          </button>
        )}
        <hr className="my-1 border-linha" />
        {etapa && item.qtd_filhos === 0 && (
          <button type="button" className={opcao} onClick={fecharE(() => onTipo('tarefa'))}>
            Transformar em tarefa
          </button>
        )}
        {!etapa && !temValores(item) && (
          <button type="button" className={opcao} onClick={fecharE(() => onTipo('etapa'))}>
            Transformar em etapa
          </button>
        )}
        <button type="button" className={`${opcao} text-marcador`} onClick={fecharE(onExcluir)}>
          Excluir{item.qtd_filhos > 0 ? ' com o que está dentro' : ''}
        </button>
      </div>
    </details>
  );
}
