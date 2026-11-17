'use client';

import Link from 'next/link';
import { Fragment, useEffect, useRef, useState, useTransition, type ReactNode } from 'react';
import { ChevronRight, Copy, LoaderCircle, RotateCcw, SendHorizontal, Sparkles } from 'lucide-react';
import {
  LIMITE_MENSAGENS_ASSISTENTE,
  LIMITE_TEXTO_PERGUNTA,
  SECOES_ASSISTENTE,
  type ItemRespostaAssistente,
  type RespostaAssistente,
} from '@obras/shared';
import { avisar } from '@/lib/avisos';
import { SeloGravidade } from '../alertas/SeloGravidade';
import { perguntarAoAssistente } from './acoes';

/** `texto` vai no histórico para o modelo; `resposta` (quando veio em JSON) desenha os cartões. */
type Mensagem = { papel: 'usuario' | 'assistente'; texto: string; resposta?: RespostaAssistente | null };

const SUGESTOES = [
  'O que está atrasado e o que faço primeiro?',
  'O que começa nas próximas duas semanas?',
  'O tempo dos próximos dias atrapalha algum serviço?',
  'Escreva um resumo da semana para o cliente.',
  'Que documentos e projetos estão faltando?',
];

/** **negrito** dentro da linha. */
function comNegrito(texto: string): ReactNode[] {
  return texto.split(/(\*\*[^*]+\*\*)/g).map((parte, i) =>
    parte.startsWith('**') && parte.endsWith('**') ? <strong key={i}>{parte.slice(2, -2)}</strong> : <Fragment key={i}>{parte}</Fragment>,
  );
}

/** Texto do modelo em parágrafos e listas, sem HTML vindo de fora. */
function TextoResposta({ texto }: { texto: string }) {
  const blocos: ReactNode[] = [];
  let lista: string[] = [];
  const fecharLista = () => {
    if (lista.length) {
      blocos.push(
        <ul key={`l${blocos.length}`} className="list-disc pl-5">
          {lista.map((l, i) => (
            <li key={i}>{comNegrito(l)}</li>
          ))}
        </ul>,
      );
      lista = [];
    }
  };
  for (const linha of texto.split('\n')) {
    const item = /^\s*(?:[-*•]|\d+[.)])\s+(.*)$/.exec(linha);
    if (item) {
      lista.push(item[1]!);
      continue;
    }
    fecharLista();
    const t = linha.replace(/^#+\s*/, '').trim();
    if (t) blocos.push(<p key={`p${blocos.length}`}>{comNegrito(t)}</p>);
  }
  fecharLista();
  return <div className="flex flex-col gap-2">{blocos}</div>;
}

function copiar(texto: string, aviso = 'Resposta copiada.') {
  navigator.clipboard.writeText(texto).then(
    () => avisar.ok(aviso),
    () => avisar.erro('Não foi possível copiar.'),
  );
}

/** Um assunto da resposta: selo, título, detalhe e o atalho para a tela onde se resolve (linha inteira tocável). */
function ItemCartao({ item, base }: { item: ItemRespostaAssistente; base: string }) {
  const corpo = (
    <>
      <span className="flex min-w-0 flex-1 flex-col gap-1">
        {item.gravidade && <SeloGravidade gravidade={item.gravidade} />}
        <span className="font-semibold break-words">
          {item.tarefa && <span className="numeros mr-1.5 text-sm font-normal text-regua">{item.tarefa}</span>}
          {item.titulo || item.detalhe}
        </span>
        {item.titulo && item.detalhe && <span className="text-sm text-regua">{comNegrito(item.detalhe)}</span>}
      </span>
      {item.secao && (
        <span className="flex shrink-0 items-center gap-0.5 text-sm font-semibold text-cianotipia">
          Abrir <span className="sr-only">{SECOES_ASSISTENTE[item.secao]}</span>
          <ChevronRight aria-hidden className="size-4" />
        </span>
      )}
    </>
  );
  return (
    <li>
      {item.secao ? (
        <Link href={`${base}/${item.secao}`} className="flex min-h-14 items-center gap-3 px-4 py-3 hover:bg-concreto/50">
          {corpo}
        </Link>
      ) : (
        <div className="flex min-h-14 items-center gap-3 px-4 py-3">{corpo}</div>
      )}
    </li>
  );
}

/** Resposta em cartão: o resumo em destaque, os assuntos um por linha, o texto pronto para copiar e de onde vieram os dados. */
function CartaoResposta({ resposta, texto, base }: { resposta: RespostaAssistente; texto: string; base: string }) {
  return (
    <div className="w-full overflow-hidden rounded-cartao border border-linha bg-papel">
      {resposta.resumo && <p className="px-4 py-3 text-base font-semibold">{comNegrito(resposta.resumo)}</p>}
      {resposta.itens.length > 0 && <ul className="divide-y divide-linha border-t border-linha">{resposta.itens.map((i, n) => <ItemCartao key={n} item={i} base={base} />)}</ul>}
      {resposta.texto_pronto && (
        <div className="border-t border-linha bg-concreto/40 px-4 py-3">
          <p className="text-xs font-semibold tracking-wide text-regua uppercase">Texto pronto</p>
          <p className="mt-1 whitespace-pre-wrap">{resposta.texto_pronto}</p>
          <button
            type="button"
            onClick={() => copiar(resposta.texto_pronto!, 'Texto copiado.')}
            className="mt-2 inline-flex min-h-11 items-center gap-2 rounded-medio border border-campo/60 bg-papel px-3 text-sm font-semibold hover:border-cianotipia hover:text-cianotipia"
          >
            <Copy aria-hidden className="size-4" />
            Copiar o texto
          </button>
        </div>
      )}
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-1 border-t border-linha px-4 py-2 text-xs text-regua">
        <span>
          {resposta.fontes.length > 0 ? (
            <>
              Com base em:{' '}
              {resposta.fontes.map((f, i) => (
                <Fragment key={f}>
                  {i > 0 && ', '}
                  <Link href={`${base}/${f}`} className="font-semibold underline-offset-4 hover:text-cianotipia hover:underline">
                    {SECOES_ASSISTENTE[f]}
                  </Link>
                </Fragment>
              ))}
              .
            </>
          ) : (
            'Com base nos dados desta obra.'
          )}{' '}
          É sugestão: confira antes de decidir.
        </span>
        {!resposta.texto_pronto && (
          <button type="button" onClick={() => copiar(texto)} className="inline-flex min-h-9 items-center gap-1.5 font-semibold hover:text-cianotipia">
            <Copy aria-hidden className="size-3.5" />
            Copiar
          </button>
        )}
      </div>
    </div>
  );
}

/** Conversa com o assistente da obra. Fica só neste navegador (aba aberta); nada vai para o banco. */
export function Assistente({ projetoId, nomeObra }: { projetoId: string; nomeObra: string }) {
  const chave = `assistente:${projetoId}`;
  const [mensagens, setMensagens] = useState<Mensagem[]>([]);
  const [texto, setTexto] = useState('');
  const [erro, setErro] = useState<string | null>(null);
  const [pensando, iniciar] = useTransition();
  const fim = useRef<HTMLDivElement>(null);
  const base = `/projetos/${projetoId}`;

  useEffect(() => {
    try {
      const salvo = sessionStorage.getItem(chave);
      if (salvo) setMensagens(JSON.parse(salvo) as Mensagem[]);
    } catch {
      /* sem armazenamento: começa vazio */
    }
  }, [chave]);
  useEffect(() => {
    try {
      sessionStorage.setItem(chave, JSON.stringify(mensagens));
    } catch {
      /* segue sem guardar */
    }
    fim.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [chave, mensagens, pensando]);

  function enviar(pergunta: string) {
    const p = pergunta.trim();
    if (!p || pensando) return;
    const conversa: Mensagem[] = [...mensagens, { papel: 'usuario' as const, texto: p }].slice(-LIMITE_MENSAGENS_ASSISTENTE);
    setMensagens(conversa);
    setTexto('');
    setErro(null);
    iniciar(async () => {
      const r = await perguntarAoAssistente(
        projetoId,
        conversa.map(({ papel, texto }) => ({ papel, texto })),
      ).catch(() => ({ ok: false as const, erro: 'O assistente não respondeu (a conexão caiu ou passou do tempo). Tente de novo.' }));
      if (!r.ok) {
        setErro(r.erro);
        return;
      }
      setMensagens((m) => [...m, { papel: 'assistente', texto: r.texto, resposta: r.resposta }]);
    });
  }

  return (
    <section aria-label="Conversa com o assistente" className="cartao flex min-h-[60vh] flex-col overflow-hidden">
      <div className="flex-1 overflow-y-auto px-4 py-5 sm:px-6" aria-live="polite">
        {mensagens.length === 0 ? (
          <div className="mx-auto flex max-w-xl flex-col items-center gap-4 py-6 text-center">
            <span aria-hidden className="flex size-12 items-center justify-center rounded-cartao bg-cianotipia-claro text-cianotipia">
              <Sparkles className="size-6" />
            </span>
            <div>
              <p className="font-semibold">Pergunte sobre a obra {nomeObra}</p>
              <p className="mt-1 text-sm text-regua">
                O assistente lê o cronograma, os alertas, a previsão do tempo, o diário, o almoxarifado e os arquivos desta obra. Ele sugere; quem decide é
                você.
              </p>
            </div>
            <Sugestoes lista={SUGESTOES} onEscolher={enviar} centro />
          </div>
        ) : (
          <ol className="flex flex-col gap-4">
            {mensagens.map((m, i) => (
              <li key={i} className={`flex ${m.papel === 'usuario' ? 'justify-end' : 'justify-start'}`}>
                {m.papel === 'usuario' ? (
                  <p className="max-w-[85%] rounded-cartao rounded-br-sm bg-cianotipia px-4 py-2.5 whitespace-pre-wrap text-white">{m.texto}</p>
                ) : m.resposta ? (
                  <div className="flex w-full max-w-[95%] flex-col gap-2">
                    <CartaoResposta resposta={m.resposta} texto={m.texto} base={base} />
                    {i === mensagens.length - 1 && !pensando && m.resposta.sugestoes.length > 0 && (
                      <Sugestoes lista={m.resposta.sugestoes} onEscolher={enviar} />
                    )}
                  </div>
                ) : (
                  <div className="max-w-[92%] rounded-cartao rounded-bl-sm border border-linha bg-concreto/40 px-4 py-3">
                    <TextoResposta texto={m.texto} />
                    <button
                      type="button"
                      onClick={() => copiar(m.texto)}
                      className="mt-2 inline-flex min-h-9 items-center gap-1.5 text-xs font-semibold text-regua hover:text-cianotipia"
                    >
                      <Copy aria-hidden className="size-3.5" />
                      Copiar
                    </button>
                  </div>
                )}
              </li>
            ))}
            {pensando && (
              <li className="flex items-center gap-2 text-sm text-regua">
                <LoaderCircle aria-hidden className="size-4 animate-spin text-cianotipia" />
                Lendo os dados da obra…
              </li>
            )}
          </ol>
        )}
        {erro && (
          <p role="alert" className="mt-4 rounded-medio bg-marcador-claro px-4 py-3 text-sm text-marcador">
            {erro}
          </p>
        )}
        <div ref={fim} />
      </div>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          enviar(texto);
        }}
        className="flex items-end gap-2 border-t border-linha bg-papel px-3 py-3 sm:px-4"
      >
        {mensagens.length > 0 && (
          <button
            type="button"
            onClick={() => {
              setMensagens([]);
              setErro(null);
            }}
            className="flex size-11 shrink-0 items-center justify-center rounded-medio text-regua hover:bg-concreto hover:text-grafite"
            aria-label="Começar outra conversa"
            title="Começar outra conversa"
          >
            <RotateCcw aria-hidden className="size-5" />
          </button>
        )}
        <label className="min-w-0 flex-1">
          <span className="sr-only">Sua pergunta</span>
          <textarea
            value={texto}
            onChange={(e) => setTexto(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                enviar(texto);
              }
            }}
            rows={1}
            maxLength={LIMITE_TEXTO_PERGUNTA}
            placeholder="Sua pergunta sobre a obra"
            className="max-h-40 min-h-11 w-full resize-y rounded-medio border border-campo bg-papel px-3 py-2.5 text-base"
          />
        </label>
        <button
          type="submit"
          disabled={pensando || !texto.trim()}
          className="flex size-11 shrink-0 items-center justify-center rounded-medio bg-cianotipia text-white hover:bg-cianotipia-escuro disabled:opacity-50"
          aria-label="Enviar pergunta"
        >
          <SendHorizontal aria-hidden className="size-5" />
        </button>
      </form>
    </section>
  );
}

/** Perguntas prontas: no começo as fixas; depois de cada resposta, as que o assistente sugeriu para seguir. */
function Sugestoes({ lista, onEscolher, centro = false }: { lista: string[]; onEscolher: (s: string) => void; centro?: boolean }) {
  return (
    <ul aria-label="Perguntas sugeridas" className={`flex flex-wrap gap-2 ${centro ? 'justify-center' : ''}`}>
      {lista.map((s) => (
        <li key={s}>
          <button
            type="button"
            onClick={() => onEscolher(s)}
            className="min-h-11 rounded-full border border-linha bg-papel px-4 py-2 text-left text-sm hover:border-cianotipia hover:text-cianotipia"
          >
            {s}
          </button>
        </li>
      ))}
    </ul>
  );
}
