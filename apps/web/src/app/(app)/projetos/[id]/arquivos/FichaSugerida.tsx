'use client';

import Link from 'next/link';
import { useMemo, useState, useTransition } from 'react';
import { ClipboardCheck, LoaderCircle } from 'lucide-react';
import { propostaFicha, type CampoPropostaFicha, type DadosObraLidos, type FichaObra } from '@obras/shared';
import { avisar } from '@/lib/avisos';
import { Botao, classeBotao, classeEntrada } from '@/components/ui';
import { gravarFichaDaLeitura } from './acoesIa';

export type FichaAtual = { endereco: string | null; cep: string | null } & Partial<FichaObra>;

/**
 * Dados da obra que a IA leu nos projetos, lado a lado com o que a obra tem hoje. O engenheiro marca, corrige se
 * precisar e grava: nada entra na obra sem essa confirmação. Campo vazio na obra vem marcado; trocar um valor que já
 * existe vem desmarcado.
 */
export function FichaSugerida({ projetoId, atual, lidos }: { projetoId: string; atual: FichaAtual; lidos: DadosObraLidos }) {
  const linhas = useMemo(() => propostaFicha(atual, lidos), [atual, lidos]);
  const [marcados, setMarcados] = useState<Set<CampoPropostaFicha>>(() => new Set(linhas.filter((l) => l.marcar).map((l) => l.campo)));
  const [valores, setValores] = useState<Partial<Record<CampoPropostaFicha, string>>>(() =>
    Object.fromEntries(linhas.map((l) => [l.campo, l.sugerido])),
  );
  const [erros, setErros] = useState<Record<string, string>>({});
  const [gravando, iniciar] = useTransition();

  if (linhas.length === 0) return null;

  function alternar(campo: CampoPropostaFicha) {
    setMarcados((m) => {
      const novo = new Set(m);
      if (novo.has(campo)) novo.delete(campo);
      else novo.add(campo);
      return novo;
    });
  }

  function gravar() {
    const envio = Object.fromEntries([...marcados].map((c) => [c, valores[c] ?? '']));
    iniciar(async () => {
      const r = await gravarFichaDaLeitura(projetoId, envio);
      if (!r.ok) {
        setErros(r.erros ?? {});
        avisar.erro(r.erro);
        return;
      }
      setErros({});
      avisar.ok(`${r.valor.gravados} ${r.valor.gravados === 1 ? 'dado gravado' : 'dados gravados'} na obra.`);
      if (r.valor.semLocalizacao) avisar.erro('Não achei a localização deste CEP. Confira o número em "Editar dados da obra".');
    });
  }

  return (
    <div>
      <h4 className="text-sm font-semibold tracking-wide text-regua uppercase">Dados da obra encontrados nos projetos</h4>
      <p className="mt-1 text-sm text-regua">
        Confira com as pranchas, corrija o que precisar e marque o que vai para os dados da obra. Só o que você marcar é gravado.
      </p>
      <ul className="mt-2 divide-y divide-linha rounded-medio border border-linha bg-papel">
        {linhas.map((l) => {
          const id = `ficha-${l.campo}`;
          const marcado = marcados.has(l.campo);
          return (
            <li key={l.campo} className="grid gap-2 px-3 py-3 sm:grid-cols-[minmax(0,14rem)_minmax(0,1fr)] sm:items-start sm:gap-4">
              <label className="flex min-h-11 cursor-pointer items-start gap-3">
                <input
                  type="checkbox"
                  className="mt-0.5 size-5 shrink-0 accent-cianotipia"
                  checked={marcado}
                  disabled={gravando}
                  onChange={() => alternar(l.campo)}
                  aria-describedby={`${id}-hoje`}
                />
                <span className="min-w-0 text-sm">
                  <span className="font-medium">{l.rotulo}</span>
                  <span id={`${id}-hoje`} className="block text-xs text-regua">
                    {l.atual ? (
                      <>
                        Hoje na obra: <span className="numeros">{l.atual}</span>
                      </>
                    ) : (
                      'Vazio na obra'
                    )}
                  </span>
                </span>
              </label>
              <div>
                <label htmlFor={id} className="sr-only">
                  {l.rotulo} lido nos projetos
                </label>
                <input
                  id={id}
                  value={valores[l.campo] ?? ''}
                  onChange={(e) => {
                    const v = e.target.value;
                    setValores((x) => ({ ...x, [l.campo]: v }));
                    if (!marcado) alternar(l.campo);
                  }}
                  disabled={gravando}
                  inputMode={l.campo === 'cep' || l.campo.startsWith('area_') ? 'decimal' : undefined}
                  aria-invalid={Boolean(erros[l.campo])}
                  aria-describedby={erros[l.campo] ? `${id}-erro` : undefined}
                  className={`${classeEntrada} ${marcado ? '' : 'text-regua'} numeros`}
                />
                {erros[l.campo] && (
                  <p id={`${id}-erro`} className="mt-1 text-sm text-marcador">
                    {erros[l.campo]}
                  </p>
                )}
              </div>
            </li>
          );
        })}
      </ul>
      <div className="mt-3 flex flex-wrap items-center gap-3">
        <Botao type="button" onClick={gravar} disabled={gravando || marcados.size === 0}>
          {gravando ? <LoaderCircle aria-hidden className="size-4 animate-spin" /> : <ClipboardCheck aria-hidden className="size-4" />}
          {gravando ? 'Gravando…' : `Gravar ${marcados.size} ${marcados.size === 1 ? 'dado' : 'dados'} na obra`}
        </Botao>
        <Link href={`/projetos/${projetoId}/editar`} className={classeBotao('discreto', 'text-sm text-cianotipia underline-offset-4 hover:underline')}>
          Ver todos os dados da obra
        </Link>
      </div>
    </div>
  );
}
