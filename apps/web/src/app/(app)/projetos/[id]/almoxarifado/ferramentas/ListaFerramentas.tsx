'use client';

import Link from 'next/link';
import { useActionState, useCallback, useEffect, useMemo, useState, useTransition } from 'react';
import {
  dataDoInstante,
  formatarData,
  lerCodigoFerramenta,
  normalizarTexto,
  situacaoEmprestimo,
  type EmprestimoFerramenta,
  type ItemEstoque,
  type Trabalhador,
} from '@obras/shared';
import { devolverFerramenta, emprestarFerramenta, type EstadoForm } from '../acoes';
import { AvisoErro, Botao, Campo, classeEntrada } from '@/components/ui';
import { LeitorQr } from './LeitorQr';

type Filtro = 'todas' | 'disponiveis' | 'fora' | 'atrasadas';
const OUTRA = 'outra';

export function FormularioEmprestimo({
  projetoId,
  itemId,
  equipe,
  hoje,
  aoTerminar,
}: {
  projetoId: string;
  itemId: string;
  equipe: Trabalhador[];
  hoje: string;
  aoTerminar?: () => void;
}) {
  const [estado, acao, salvando] = useActionState<EstadoForm, FormData>(emprestarFerramenta, {});
  const [pessoa, setPessoa] = useState('');
  const e = estado.erros ?? {};
  useEffect(() => {
    if (estado.ok) aoTerminar?.();
  }, [estado, aoTerminar]);

  return (
    <form action={acao} className="flex flex-col gap-3" aria-label="Emprestar ferramenta">
      <input type="hidden" name="projeto_id" value={projetoId} />
      <input type="hidden" name="item_id" value={itemId} />
      <div className="grid gap-3 sm:grid-cols-3">
        <Campo rotulo="Com quem vai ficar" nome={`emp-pessoa-${itemId}`} erro={e.trabalhador_id ?? (pessoa === OUTRA ? undefined : e.responsavel)}>
          <select
            id={`emp-pessoa-${itemId}`}
            name={pessoa === OUTRA ? undefined : 'trabalhador_id'}
            value={pessoa}
            onChange={(ev) => setPessoa(ev.target.value)}
            className={classeEntrada}
          >
            <option value="">Escolha a pessoa</option>
            {equipe.map((p) => (
              <option key={p.id} value={p.id}>
                {p.nome} · {p.funcao}
              </option>
            ))}
            <option value={OUTRA}>Outra pessoa (escrever o nome)</option>
          </select>
        </Campo>
        {pessoa === OUTRA && (
          <Campo rotulo="Nome" nome={`emp-nome-${itemId}`} erro={e.responsavel}>
            <input id={`emp-nome-${itemId}`} name="responsavel" maxLength={160} className={classeEntrada} />
          </Campo>
        )}
        <Campo rotulo="Devolver até" nome={`emp-ate-${itemId}`} erro={e.devolver_ate} dica="Opcional">
          <input id={`emp-ate-${itemId}`} name="devolver_ate" type="date" min={hoje} className={`${classeEntrada} numeros`} />
        </Campo>
      </div>
      {estado.erroGeral && <AvisoErro>{estado.erroGeral}</AvisoErro>}
      <Botao type="submit" disabled={salvando} className="self-start">
        {salvando ? 'Emprestando…' : 'Emprestar'}
      </Botao>
    </form>
  );
}

export function BotaoDevolucao({ projetoId, itemId, aoTerminar }: { projetoId: string; itemId: string; aoTerminar?: (mensagem: string) => void }) {
  const [obs, setObs] = useState('');
  const [erro, setErro] = useState<string | null>(null);
  const [salvando, iniciar] = useTransition();
  return (
    <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
      <div className="flex flex-col gap-1.5 sm:w-72">
        <label htmlFor={`dev-obs-${itemId}`} className="text-sm font-semibold">
          Observação da devolução
        </label>
        <input id={`dev-obs-${itemId}`} value={obs} onChange={(e) => setObs(e.target.value)} maxLength={500} placeholder="Opcional (ex.: voltou sem a broca)" className={classeEntrada} />
      </div>
      <Botao
        type="button"
        disabled={salvando}
        onClick={() =>
          iniciar(async () => {
            setErro(null);
            const r = await devolverFerramenta(projetoId, itemId, obs);
            if (r.ok) aoTerminar?.(r.mensagem ?? 'Devolução registrada.');
            else setErro(r.erro);
          })
        }
      >
        {salvando ? 'Registrando…' : 'Receber devolução'}
      </Botao>
      {erro && (
        <p role="alert" className="text-sm text-marcador">
          {erro}
        </p>
      )}
    </div>
  );
}

export function ListaFerramentas({
  projetoId,
  ferramentas,
  emprestimos,
  nomeObra,
  equipe,
  hoje,
  podeMovimentar,
}: {
  projetoId: string;
  ferramentas: ItemEstoque[];
  emprestimos: EmprestimoFerramenta[];
  nomeObra: Record<string, string>;
  equipe: Trabalhador[];
  hoje: string;
  podeMovimentar: boolean;
}) {
  const [busca, setBusca] = useState('');
  const [filtro, setFiltro] = useState<Filtro>('todas');
  const [aberto, setAberto] = useState<string | null>(null);
  const [aviso, setAviso] = useState<{ tipo: 'ok' | 'erro'; texto: string } | null>(null);
  const aberta = useMemo(() => new Map(emprestimos.map((e) => [e.item_id, e])), [emprestimos]);

  const lista = useMemo(() => {
    const termo = normalizarTexto(busca);
    return ferramentas
      .filter((f) => f.ativo || aberta.has(f.id))
      .filter((f) => {
        const e = aberta.get(f.id);
        if (filtro === 'disponiveis') return !e;
        if (filtro === 'fora') return !!e;
        if (filtro === 'atrasadas') return !!e && situacaoEmprestimo(e, hoje).atrasado;
        return true;
      })
      .filter((f) => termo === '' || normalizarTexto(`${f.nome} ${f.codigo} ${f.patrimonio ?? ''}`).includes(termo));
  }, [ferramentas, aberta, filtro, busca, hoje]);

  const lido = useCallback(
    (texto: string) => {
      const r = lerCodigoFerramenta(texto);
      const f = r && ('itemId' in r ? ferramentas.find((x) => x.id === r.itemId) : ferramentas.find((x) => x.codigo.toUpperCase() === r.codigo || x.patrimonio?.toUpperCase() === r.codigo));
      if (!f) {
        setAviso({ tipo: 'erro', texto: 'Ferramenta não encontrada no catálogo desta empresa.' });
        return;
      }
      setAviso(null);
      setFiltro('todas');
      setBusca('');
      setAberto(f.id);
      requestAnimationFrame(() => document.getElementById(`ferramenta-${f.id}`)?.scrollIntoView({ block: 'center', behavior: 'smooth' }));
    },
    [ferramentas],
  );

  const filtros: { chave: Filtro; nome: string }[] = [
    { chave: 'todas', nome: 'Todas' },
    { chave: 'disponiveis', nome: 'Disponíveis' },
    { chave: 'fora', nome: 'Emprestadas' },
    { chave: 'atrasadas', nome: 'Atrasadas' },
  ];

  return (
    <div className="flex flex-col gap-4">
      {podeMovimentar && <LeitorQr aoLer={lido} />}
      {aviso && (
        <p role={aviso.tipo === 'erro' ? 'alert' : 'status'} className={`text-sm ${aviso.tipo === 'erro' ? 'text-marcador' : 'font-semibold text-obra-ok'}`}>
          {aviso.texto}
        </p>
      )}
      <section aria-labelledby="titulo-ferramentas" className="rounded-medio border border-linha bg-papel">
        <div className="flex flex-col gap-3 border-b border-linha px-4 py-3 sm:flex-row sm:items-center sm:justify-between sm:px-5">
          <h3 id="titulo-ferramentas" className="text-base font-semibold">
            Ferramentas da empresa
          </h3>
          <label htmlFor="busca-ferramenta" className="sr-only">
            Buscar ferramenta
          </label>
          <input
            id="busca-ferramenta"
            type="search"
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            placeholder="Buscar por nome, código ou patrimônio"
            className={`${classeEntrada} sm:w-72`}
          />
        </div>
        <div role="group" aria-label="Filtrar ferramentas" className="flex gap-2 overflow-x-auto px-4 pt-3 sm:px-5">
          {filtros.map((f) => (
            <button
              key={f.chave}
              type="button"
              aria-pressed={filtro === f.chave}
              onClick={() => setFiltro(f.chave)}
              className={`min-h-11 shrink-0 rounded-full border px-4 text-sm font-semibold ${
                filtro === f.chave ? 'border-cianotipia bg-cianotipia-claro text-cianotipia' : 'border-linha bg-papel text-regua hover:text-grafite'
              }`}
            >
              {f.nome}
            </button>
          ))}
        </div>
        {lista.length === 0 ? (
          <p className="px-4 py-6 text-sm text-regua sm:px-5">Nenhuma ferramenta com esse filtro.</p>
        ) : (
          <ul className="mt-3 divide-y divide-linha border-t border-linha">
            {lista.map((f) => {
              const e = aberta.get(f.id);
              const s = e ? situacaoEmprestimo(e, hoje) : null;
              const nestaObra = e?.projeto_id === projetoId;
              const destacado = aberto === f.id;
              // Empresta a disponível (ativa); recebe a que saiu desta obra (mesmo se já foi baixada).
              const podeAgir = podeMovimentar && (e ? nestaObra : f.ativo);
              return (
                <li key={f.id} id={`ferramenta-${f.id}`} className={`flex flex-col gap-3 px-4 py-3 sm:px-5 ${destacado ? 'bg-cianotipia-claro/50' : ''}`}>
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <div className="min-w-0">
                      <Link href={`/f/${f.id}`} className="font-semibold hover:text-cianotipia">
                        {f.nome}
                      </Link>
                      <p className="numeros text-sm text-regua">
                        {f.codigo}
                        {f.patrimonio ? ` · patrimônio ${f.patrimonio}` : ''}
                        {!f.ativo && ' · inativa'}
                      </p>
                      <p className={`mt-0.5 text-sm ${!e ? 'text-obra-ok' : s?.atrasado ? 'font-semibold text-marcador' : 'text-grafite'}`}>
                        {!e
                          ? 'Disponível'
                          : `Com ${e.responsavel} ${s!.diasFora === 0 ? 'desde hoje' : `desde ${formatarData(dataDoInstante(e.retirada_em))} · ${s!.diasFora} ${s!.diasFora === 1 ? 'dia' : 'dias'}`}${
                              e.devolver_ate ? (s!.atrasado ? ` · devolução atrasada (era ${formatarData(e.devolver_ate)})` : ` · devolver até ${formatarData(e.devolver_ate)}`) : ''
                            }${nestaObra ? '' : ` · na obra ${nomeObra[e.projeto_id] ?? 'outra'}`}`}
                      </p>
                    </div>
                    {podeAgir && (
                      <Botao type="button" variante="secundario" onClick={() => setAberto(destacado ? null : f.id)} aria-expanded={destacado}>
                        {destacado ? 'Fechar' : e ? 'Devolver' : 'Emprestar'}
                      </Botao>
                    )}
                  </div>
                  {destacado && podeAgir && (
                    <div className="rounded-medio border border-linha bg-papel p-3">
                      {e ? (
                        <BotaoDevolucao
                          projetoId={projetoId}
                          itemId={f.id}
                          aoTerminar={(m) => {
                            setAberto(null);
                            setAviso({ tipo: 'ok', texto: `${f.nome}: ${m}` });
                          }}
                        />
                      ) : (
                        <FormularioEmprestimo
                          projetoId={projetoId}
                          itemId={f.id}
                          equipe={equipe}
                          hoje={hoje}
                          aoTerminar={() => {
                            setAberto(null);
                            setAviso({ tipo: 'ok', texto: `${f.nome} emprestada.` });
                          }}
                        />
                      )}
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </div>
  );
}
