'use client';

import { useActionState, useEffect, useState, useTransition } from 'react';
import { DESCRICAO_PAPEL_PROJETO, PAPEIS_PROJETO, ROTULO_PAPEL_PROJETO, type MembroProjeto, type PapelProjeto } from '@obras/shared';
import { adicionarMembro, alterarPapelMembro, removerMembro, type EstadoMembro, type ResultadoMembro } from './acoes';
import { AvisoErro, Botao, Campo, classeEntrada } from '@/components/ui';
import { useConfirmar } from '@/components/Confirmar';
import { avisarResultado } from '@/lib/avisos';

export function MembrosProjeto({
  projetoId,
  membros,
  podeEditar,
}: {
  projetoId: string;
  membros: MembroProjeto[];
  podeEditar: boolean;
}) {
  const [estado, acao, enviando] = useActionState<EstadoMembro, FormData>(adicionarMembro, {});
  const [ocupado, iniciar] = useTransition();
  const confirmar = useConfirmar();
  const [papelNovo, setPapelNovo] = useState<PapelProjeto>('leitura');
  // Depois de dar acesso, o formulário volta para "Somente leitura".
  useEffect(() => {
    if (estado.ok) setPapelNovo('leitura');
  }, [estado]);

  function executar(tarefa: () => Promise<ResultadoMembro>) {
    iniciar(async () => avisarResultado(await tarefa()));
  }

  const mensagem = estado.ok && estado.mensagem ? { ok: true, texto: estado.mensagem } : null;

  return (
    <section className="cartao" aria-labelledby="titulo-pessoas">
      <h2 id="titulo-pessoas" className="border-b border-linha px-5 py-4 text-base font-semibold">
        Pessoas com acesso
      </h2>

      <ul className="divide-y divide-linha text-sm" aria-busy={ocupado}>
        {membros.map((m) => {
          const controles = podeEditar && m.papel !== null && !m.voce;
          return (
            <li key={m.usuario_id} className="flex flex-col gap-2 px-5 py-3">
              <div className="min-w-0">
                <p className="truncate font-semibold" title={m.email}>
                  {m.email}
                  {m.voce && <span className="ml-1.5 font-normal text-regua">(você)</span>}
                </p>
                {m.admin_empresa && (
                  <p className="text-xs text-regua">
                    Administrador da empresa{m.papel === null ? ': acessa e edita todos os projetos' : ''}
                  </p>
                )}
              </div>
              {controles ? (
                <div className="flex items-center gap-3">
                  <label className="sr-only" htmlFor={`papel-${m.usuario_id}`}>
                    Papel de {m.email}
                  </label>
                  <select
                    id={`papel-${m.usuario_id}`}
                    className={`${classeEntrada} py-1.5`}
                    value={m.papel ?? ''}
                    disabled={ocupado}
                    onChange={(e) => {
                      const papel = e.target.value as PapelProjeto;
                      executar(() => alterarPapelMembro(projetoId, m.usuario_id, papel));
                    }}
                  >
                    {PAPEIS_PROJETO.map((p) => (
                      <option key={p} value={p}>
                        {ROTULO_PAPEL_PROJETO[p]}
                      </option>
                    ))}
                  </select>
                  <button
                    type="button"
                    disabled={ocupado}
                    className="shrink-0 font-semibold text-marcador hover:underline underline-offset-4 disabled:text-regua"
                    onClick={async () => {
                      const sim = await confirmar({
                        titulo: 'Tirar o acesso a esta obra?',
                        texto: `${m.email} deixa de ver a obra. Dá para dar acesso de novo depois.`,
                        confirmar: 'Tirar acesso',
                        perigo: true,
                      });
                      if (sim) executar(() => removerMembro(projetoId, m.usuario_id));
                    }}
                  >
                    Tirar acesso
                  </button>
                </div>
              ) : (
                m.papel && <p className="text-regua">{ROTULO_PAPEL_PROJETO[m.papel]}</p>
              )}
            </li>
          );
        })}
      </ul>

      <div aria-live="polite" className="empty:hidden px-5 pb-1">
        {mensagem && (
          <p className={`rounded-pequeno px-3 py-2 text-sm ${mensagem.ok ? 'bg-obra-ok/10 text-obra-ok' : 'bg-marcador-claro text-marcador'}`}>
            {mensagem.texto}
          </p>
        )}
      </div>

      {podeEditar && (
        <form action={acao} className="flex flex-col gap-3 border-t border-linha px-5 py-4">
          <input type="hidden" name="projeto_id" value={projetoId} />
          <p className="text-sm font-semibold">Dar acesso a alguém</p>
          {estado.erroGeral && <AvisoErro>{estado.erroGeral}</AvisoErro>}
          <Campo rotulo="E-mail da pessoa" nome="membro-email" erro={estado.erros?.email} dica="Sem conta ainda? Enviamos um convite por e-mail (só administradores da empresa trazem gente nova).">
            <input
              id="membro-email"
              name="email"
              type="email"
              required
              autoComplete="off"
              defaultValue={estado.ok ? '' : (estado.valores?.email ?? '')}
              aria-invalid={Boolean(estado.erros?.email)}
              className={classeEntrada}
              placeholder="mestre@construtora.com.br"
            />
          </Campo>
          <Campo rotulo="Papel" nome="membro-papel" erro={estado.erros?.papel}>
            <select
              id="membro-papel"
              name="papel"
              defaultValue={estado.ok ? 'leitura' : (estado.valores?.papel ?? 'leitura')}
              onChange={(e) => setPapelNovo(e.target.value as PapelProjeto)}
              className={classeEntrada}
            >
              {PAPEIS_PROJETO.map((p) => (
                <option key={p} value={p}>
                  {ROTULO_PAPEL_PROJETO[p]}
                </option>
              ))}
            </select>
          </Campo>
          <p className="text-sm text-regua">{DESCRICAO_PAPEL_PROJETO[papelNovo]}</p>
          <Botao type="submit" disabled={enviando} className="self-start">
            {enviando ? 'Dando acesso…' : 'Dar acesso'}
          </Botao>
        </form>
      )}
    </section>
  );
}
