'use client';

import { Fragment, useEffect, useRef, useState, useTransition, type ReactNode } from 'react';
import { Copy, LoaderCircle, RotateCcw, SendHorizontal, Sparkles } from 'lucide-react';
import { LIMITE_MENSAGENS_ASSISTENTE, LIMITE_TEXTO_PERGUNTA } from '@obras/shared';
import { avisar } from '@/lib/avisos';
import { perguntarAoAssistente } from './acoes';

type Mensagem = { papel: 'usuario' | 'assistente'; texto: string };

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

/** Conversa com o assistente da obra. Fica só neste navegador (aba aberta); nada vai para o banco. */
export function Assistente({ projetoId, nomeObra }: { projetoId: string; nomeObra: string }) {
  const chave = `assistente:${projetoId}`;
  const [mensagens, setMensagens] = useState<Mensagem[]>([]);
  const [texto, setTexto] = useState('');
  const [erro, setErro] = useState<string | null>(null);
  const [pensando, iniciar] = useTransition();
  const fim = useRef<HTMLDivElement>(null);

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
    const conversa = [...mensagens, { papel: 'usuario' as const, texto: p }].slice(-LIMITE_MENSAGENS_ASSISTENTE);
    setMensagens(conversa);
    setTexto('');
    setErro(null);
    iniciar(async () => {
      const r = await perguntarAoAssistente(projetoId, conversa);
      if (!r.ok) {
        setErro(r.erro);
        return;
      }
      setMensagens((m) => [...m, { papel: 'assistente', texto: r.texto }]);
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
            <ul className="flex flex-wrap justify-center gap-2">
              {SUGESTOES.map((s) => (
                <li key={s}>
                  <button
                    type="button"
                    onClick={() => enviar(s)}
                    className="min-h-11 rounded-full border border-linha bg-papel px-4 py-2 text-left text-sm hover:border-cianotipia hover:text-cianotipia"
                  >
                    {s}
                  </button>
                </li>
              ))}
            </ul>
          </div>
        ) : (
          <ol className="flex flex-col gap-4">
            {mensagens.map((m, i) => (
              <li key={i} className={`flex ${m.papel === 'usuario' ? 'justify-end' : 'justify-start'}`}>
                {m.papel === 'usuario' ? (
                  <p className="max-w-[85%] rounded-cartao rounded-br-sm bg-cianotipia px-4 py-2.5 whitespace-pre-wrap text-white">{m.texto}</p>
                ) : (
                  <div className="max-w-[92%] rounded-cartao rounded-bl-sm border border-linha bg-concreto/40 px-4 py-3">
                    <TextoResposta texto={m.texto} />
                    <button
                      type="button"
                      onClick={() =>
                        navigator.clipboard.writeText(m.texto).then(
                          () => avisar.ok('Resposta copiada.'),
                          () => avisar.erro('Não foi possível copiar.'),
                        )
                      }
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
