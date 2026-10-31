'use client';

import { useState, useTransition } from 'react';
import { agenteOnline, dataDoInstante, formatarData, horaDoInstante, type AgenteCamera } from '@obras/shared';
import { criarAgente, revogarAgente } from '../acoes';
import { Botao, classeEntrada } from '@/components/ui';

function Token({ token }: { token: string }) {
  const [copiado, setCopiado] = useState(false);
  const docker = `docker run -d --restart unless-stopped --name agente-obra -e AGENTE_TOKEN=${token} -v agente-dados:/dados agente-obra`;
  return (
    <div role="status" className="flex flex-col gap-3 rounded-medio border border-cianotipia/40 bg-cianotipia-claro p-4">
      <p className="text-sm font-semibold text-cianotipia">Copie o token agora: ele não aparece de novo.</p>
      <div className="flex flex-col gap-2 sm:flex-row">
        <code className="numeros min-w-0 flex-1 overflow-x-auto rounded-pequeno border border-linha bg-papel px-3 py-2.5 text-sm break-all">{token}</code>
        <Botao
          type="button"
          variante="secundario"
          onClick={() => {
            void navigator.clipboard?.writeText(token).then(() => setCopiado(true));
          }}
        >
          {copiado ? 'Copiado' : 'Copiar token'}
        </Botao>
      </div>
      <p className="text-sm text-grafite">
        No computador da obra (com Docker), depois de montar a imagem do agente (<code>apps/agente</code>):
      </p>
      <code className="numeros overflow-x-auto rounded-pequeno border border-linha bg-papel px-3 py-2.5 text-xs whitespace-pre-wrap break-all">{docker}</code>
      <p className="text-sm text-regua">O passo a passo completo (Raspberry, Windows, descobrir o endereço da câmera) está no README do agente.</p>
    </div>
  );
}

export function Agentes({ projetoId, agentes, agora }: { projetoId: string; agentes: AgenteCamera[]; agora: string }) {
  const [nome, setNome] = useState('');
  const [token, setToken] = useState<string | null>(null);
  const [mensagem, setMensagem] = useState<{ tipo: 'ok' | 'erro'; texto: string } | null>(null);
  const [desligando, setDesligando] = useState<string | null>(null);
  const [ocupado, iniciar] = useTransition();
  const instante = new Date(agora);

  return (
    <div className="flex flex-col gap-4">
      {agentes.length === 0 ? (
        <p className="text-sm text-regua">Nenhum agente ainda. Cadastre um para cada computador que vai buscar as fotos na obra.</p>
      ) : (
        <ul className="divide-y divide-linha rounded-medio border border-linha">
          {agentes.map((a) => {
            const online = agenteOnline(a, instante);
            return (
              <li key={a.id} className={`flex flex-wrap items-center justify-between gap-3 px-4 py-3 ${a.ativo ? '' : 'bg-concreto/50'}`}>
                <div className="min-w-0">
                  <p className="font-semibold">
                    {a.nome}
                    {!a.ativo && <span className="ml-2 text-xs font-semibold text-regua">(desligado)</span>}
                  </p>
                  <p className={`numeros text-sm ${a.ativo && !online ? 'font-semibold text-marcador' : 'text-regua'}`}>
                    {!a.ativo
                      ? 'Token sem efeito'
                      : online
                        ? `Ligado · versão ${a.versao ?? '?'}`
                        : a.ultimo_contato_em
                          ? `Sem contato desde ${formatarData(dataDoInstante(a.ultimo_contato_em))} às ${horaDoInstante(a.ultimo_contato_em)}`
                          : 'Ainda não ligou: instale o agente com o token'}
                  </p>
                </div>
                {a.ativo &&
                  (desligando === a.id ? (
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-sm">As câmeras dele param de mandar foto.</span>
                      <Botao
                        type="button"
                        disabled={ocupado}
                        onClick={() =>
                          iniciar(async () => {
                            const r = await revogarAgente(projetoId, a.id);
                            setMensagem(r.ok ? { tipo: 'ok', texto: r.mensagem ?? '' } : { tipo: 'erro', texto: r.erro });
                            setDesligando(null);
                          })
                        }
                      >
                        Desligar agente
                      </Botao>
                      <Botao type="button" variante="secundario" onClick={() => setDesligando(null)}>
                        Cancelar
                      </Botao>
                    </div>
                  ) : (
                    <Botao type="button" variante="secundario" onClick={() => setDesligando(a.id)}>
                      Desligar
                    </Botao>
                  ))}
              </li>
            );
          })}
        </ul>
      )}

      <form
        className="flex flex-col gap-2 sm:flex-row sm:items-end"
        onSubmit={(e) => {
          e.preventDefault();
          iniciar(async () => {
            const r = await criarAgente(projetoId, nome);
            if (r.ok && r.valor) {
              setToken(r.valor.token);
              setNome('');
              setMensagem(null);
            } else if (!r.ok) setMensagem({ tipo: 'erro', texto: r.erro });
          });
        }}
      >
        <div className="flex flex-1 flex-col gap-1.5">
          <label htmlFor="nome-agente" className="text-sm font-semibold">
            Nome do computador
          </label>
          <input
            id="nome-agente"
            value={nome}
            onChange={(e) => setNome(e.target.value)}
            maxLength={80}
            placeholder="Ex.: Raspberry do almoxarifado"
            className={classeEntrada}
          />
        </div>
        <Botao type="submit" disabled={ocupado || nome.trim().length < 2}>
          Cadastrar agente
        </Botao>
      </form>
      {token && <Token token={token} />}
      {mensagem && (
        <p role={mensagem.tipo === 'erro' ? 'alert' : 'status'} className={`text-sm ${mensagem.tipo === 'erro' ? 'text-marcador' : 'text-obra-ok'}`}>
          {mensagem.texto}
        </p>
      )}
    </div>
  );
}
