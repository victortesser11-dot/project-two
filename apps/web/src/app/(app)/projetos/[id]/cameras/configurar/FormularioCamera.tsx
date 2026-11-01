'use client';

import { useActionState, useEffect, useRef, useState } from 'react';
import { enderecoIntelbras, enderecoLocal, horaCurta, ROTULO_ORIGEM_CAMERA, type AgenteCamera, type Camera, type OrigemCamera } from '@obras/shared';
import { salvarCamera, type EstadoForm } from '../acoes';
import { AvisoErro, Botao, Campo, classeEntrada } from '@/components/ui';

const PADRAO = ['07:00', '12:00', '17:00'];

/** Monta o endereço da foto de uma câmera ou NVR Intelbras a partir do IP. */
function MontarEndereco({ aoMontar }: { aoMontar: (endereco: string) => void }) {
  const [ip, setIp] = useState('');
  const [ondeEsta, setOndeEsta] = useState<'camera' | 'nvr'>('camera');
  const [canal, setCanal] = useState('1');
  return (
    <fieldset className="flex flex-col gap-3 rounded-medio border border-linha bg-concreto/40 p-3">
      <legend className="px-1 text-sm font-semibold">Montar o endereço (Intelbras)</legend>
      <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_auto_6rem] sm:items-end">
        <div className="flex flex-col gap-1.5">
          <label htmlFor="mont-ip" className="text-sm">
            IP na rede da obra
          </label>
          <input id="mont-ip" inputMode="decimal" value={ip} onChange={(e) => setIp(e.target.value)} placeholder="192.168.1.108" className={`${classeEntrada} numeros`} />
        </div>
        <div className="flex flex-col gap-1.5">
          <span className="text-sm" id="mont-onde">
            Ligada
          </span>
          <div role="radiogroup" aria-labelledby="mont-onde" className="inline-flex rounded-medio border border-linha bg-papel p-0.5">
            {(['camera', 'nvr'] as const).map((o) => (
              <button
                key={o}
                type="button"
                role="radio"
                aria-checked={ondeEsta === o}
                onClick={() => setOndeEsta(o)}
                className={`min-h-10 rounded-[8px] px-3 text-sm font-semibold ${ondeEsta === o ? 'bg-cianotipia-claro text-cianotipia' : 'text-regua'}`}
              >
                {o === 'camera' ? 'Direto no roteador' : 'No NVR'}
              </button>
            ))}
          </div>
        </div>
        {ondeEsta === 'nvr' && (
          <div className="flex flex-col gap-1.5">
            <label htmlFor="mont-canal" className="text-sm">
              Canal
            </label>
            <input id="mont-canal" inputMode="numeric" value={canal} onChange={(e) => setCanal(e.target.value.replace(/\D/g, ''))} className={`${classeEntrada} numeros`} />
          </div>
        )}
      </div>
      <Botao
        type="button"
        variante="secundario"
        disabled={ip.trim() === ''}
        onClick={() => aoMontar(enderecoIntelbras({ ip, canal: ondeEsta === 'nvr' ? Number(canal) || 1 : null }))}
        className="self-start"
      >
        Usar este endereço
      </Botao>
    </fieldset>
  );
}

export function FormularioCamera({
  projetoId,
  camera,
  agentes,
  aoSalvar,
}: {
  projetoId: string;
  camera?: Camera;
  agentes: AgenteCamera[];
  aoSalvar?: () => void;
}) {
  const [estado, acao, salvando] = useActionState<EstadoForm, FormData>(salvarCamera, {});
  const [origem, setOrigem] = useState<OrigemCamera>(camera?.origem ?? (agentes.some((a) => a.ativo) ? 'agente' : 'manual'));
  const [endereco, setEndereco] = useState(camera?.endereco ?? '');
  const [horarios, setHorarios] = useState<string[]>(camera ? camera.horarios.map(horaCurta) : PADRAO);
  const form = useRef<HTMLFormElement>(null);
  const e = estado.erros ?? {};
  const v = (c: string, original = '') => estado.valores?.[c] ?? original;
  const id = (c: string) => `${camera ? `cam-${camera.id}` : 'cam-nova'}-${c}`;
  const ativos = agentes.filter((a) => a.ativo || a.id === camera?.agente_id);

  useEffect(() => {
    if (estado.ok) {
      if (!camera) {
        form.current?.reset();
        setEndereco('');
        setHorarios(PADRAO);
      }
      aoSalvar?.();
    }
  }, [estado, camera, aoSalvar]);

  return (
    <form ref={form} action={acao} className="flex flex-col gap-4" aria-label={camera ? `Editar ${camera.nome}` : 'Cadastrar câmera'}>
      <input type="hidden" name="projeto_id" value={projetoId} />
      {camera && <input type="hidden" name="camera_id" value={camera.id} />}
      <input type="hidden" name="origem" value={origem} />

      <div className="grid gap-4 sm:grid-cols-2">
        <Campo rotulo="Nome" nome={id('nome')} erro={e.nome} dica="Onde ela olha: Fachada, Pátio, Torre A…">
          <input id={id('nome')} name="nome" required maxLength={80} defaultValue={v('nome', camera?.nome)} className={classeEntrada} />
        </Campo>
        {!camera ? (
          <fieldset className="flex flex-col gap-1.5">
            <legend className="text-sm font-semibold">Como a foto chega</legend>
            <div className="flex flex-col gap-2">
              {(['agente', 'manual'] as const).map((o) => (
                <label key={o} className="flex min-h-11 cursor-pointer items-center gap-3 rounded-medio border border-linha px-3 has-[:checked]:border-cianotipia has-[:checked]:bg-cianotipia-claro">
                  <input type="radio" name="origem-escolha" checked={origem === o} onChange={() => setOrigem(o)} className="size-4 accent-cianotipia" />
                  <span className="text-sm font-semibold">{ROTULO_ORIGEM_CAMERA[o]}</span>
                </label>
              ))}
            </div>
          </fieldset>
        ) : (
          <p className="text-sm text-regua sm:pt-7">{ROTULO_ORIGEM_CAMERA[camera.origem]}</p>
        )}
      </div>

      {origem === 'agente' && (
        <>
          <Campo rotulo="Agente que busca a foto" nome={id('agente')} erro={e.agente_id}>
            <select id={id('agente')} name="agente_id" defaultValue={v('agente_id', camera?.agente_id ?? ativos[0]?.id ?? '')} className={classeEntrada}>
              <option value="">Escolha o agente</option>
              {ativos.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.ativo ? a.nome : `${a.nome} (revogado: só dá para desligar a câmera)`}
                </option>
              ))}
            </select>
          </Campo>
          <MontarEndereco aoMontar={setEndereco} />
          <Campo
            rotulo="Endereço da foto"
            nome={id('endereco')}
            erro={e.endereco}
            dica={
              endereco && !enderecoLocal(endereco)
                ? 'Esse endereço parece de internet. O agente busca a foto na rede da obra (ex.: 192.168.x.x); não abra porta da câmera.'
                : 'Teste no computador da obra com "node src/testar-camera.js" antes, se tiver dúvida.'
            }
          >
            <input
              id={id('endereco')}
              name="endereco"
              value={endereco}
              onChange={(ev) => setEndereco(ev.target.value)}
              placeholder="http://192.168.1.108/cgi-bin/snapshot.cgi"
              className={`${classeEntrada} numeros`}
              autoComplete="off"
            />
          </Campo>
          <div className="grid gap-4 sm:grid-cols-2">
            <Campo rotulo="Usuário da câmera" nome={id('usuario')} erro={e.usuario} dica="Crie um usuário só de visualização; não use o admin.">
              <input id={id('usuario')} name="usuario" maxLength={80} defaultValue={v('usuario', camera?.usuario ?? '')} className={classeEntrada} autoComplete="off" />
            </Campo>
            <Campo
              rotulo="Senha da câmera"
              nome={id('senha')}
              erro={e.senha}
              dica={camera?.tem_senha ? 'Guardada cifrada. Deixe vazio para manter.' : 'Fica cifrada no cofre; só o agente recebe.'}
            >
              <input id={id('senha')} name="senha" type="password" maxLength={128} placeholder={camera?.tem_senha ? '••••••••' : ''} className={classeEntrada} autoComplete="new-password" />
            </Campo>
          </div>
          {camera?.tem_senha && (
            <label className="flex min-h-11 items-center gap-3 text-sm">
              <input type="checkbox" name="remover_senha" className="size-4 accent-cianotipia" />
              Apagar a senha guardada
            </label>
          )}
        </>
      )}

      <fieldset className="flex flex-col gap-2">
        <legend className="text-sm font-semibold">Horários das fotos</legend>
        <p className="text-sm text-regua">
          {origem === 'agente' ? 'De 1 a 4 por dia. O agente tenta por até 1 hora depois de cada horário.' : 'De 1 a 4 por dia: o horário combinado para tirar a foto, sempre do mesmo ponto.'}
        </p>
        <div className="flex flex-wrap gap-2">
          {horarios.map((h, i) => (
            <div key={i} className="flex items-center gap-1">
              <label htmlFor={id(`hora-${i}`)} className="sr-only">
                Horário {i + 1}
              </label>
              <input
                id={id(`hora-${i}`)}
                type="time"
                name="horario"
                value={h}
                onChange={(ev) => setHorarios((l) => l.map((x, j) => (j === i ? ev.target.value : x)))}
                className={`${classeEntrada} numeros w-32`}
              />
              {horarios.length > 1 && (
                <button
                  type="button"
                  aria-label={`Tirar o horário ${h}`}
                  onClick={() => setHorarios((l) => l.filter((_, j) => j !== i))}
                  className="flex size-11 items-center justify-center rounded-medio text-regua hover:bg-concreto hover:text-marcador"
                >
                  <svg aria-hidden viewBox="0 0 16 16" className="size-4" fill="none" stroke="currentColor" strokeWidth="2">
                    <path d="m4 4 8 8M12 4l-8 8" />
                  </svg>
                </button>
              )}
            </div>
          ))}
          {horarios.length < 4 && (
            <Botao type="button" variante="secundario" onClick={() => setHorarios((l) => [...l, '15:00'])}>
              Mais um horário
            </Botao>
          )}
        </div>
        {e.horarios && <p className="text-sm text-marcador">{e.horarios}</p>}
      </fieldset>

      <label className="flex min-h-11 items-center gap-3 text-sm">
        <input type="checkbox" name="ativa" defaultChecked={camera ? camera.ativa : true} className="size-4 accent-cianotipia" />
        Câmera ligada (desligue durante uma mudança de posição, para não estragar a comparação)
      </label>

      {estado.erroGeral && <AvisoErro>{estado.erroGeral}</AvisoErro>}
      {estado.ok && estado.mensagem && (
        <p role="status" className="text-sm font-semibold text-obra-ok">
          {estado.mensagem}
        </p>
      )}
      <Botao type="submit" disabled={salvando} className="self-start">
        {salvando ? 'Salvando…' : camera ? 'Salvar câmera' : 'Cadastrar câmera'}
      </Botao>
    </form>
  );
}
