'use client';

import { useActionState, useEffect, useRef, useState, useTransition } from 'react';
import { hojeIso, ROTULO_TIPO_CUSTO, TIPOS_CUSTO_MAO_OBRA, type Empreiteira, type Trabalhador } from '@obras/shared';
import { buscarCnpj, definirNaObra, incluirNaEquipe, salvarCusto, salvarEmpreiteira, salvarPessoa, type EstadoForm } from './acoes';
import { AvisoErro, Botao, Campo, classeEntrada } from '@/components/ui';

function Retorno({ estado }: { estado: EstadoForm }) {
  if (estado.erroGeral) return <AvisoErro>{estado.erroGeral}</AvisoErro>;
  if (estado.ok && estado.mensagem)
    return (
      <p role="status" className="text-sm text-obra-ok">
        {estado.mensagem}
      </p>
    );
  return null;
}

/** Cadastro de pessoa (nova entra na obra) ou edição (com pessoa). */
export function FormularioPessoa({
  projetoId,
  empreiteiras,
  pessoa,
}: {
  projetoId: string;
  empreiteiras: Empreiteira[];
  pessoa?: Trabalhador;
}) {
  const [estado, acao, salvando] = useActionState<EstadoForm, FormData>(salvarPessoa, {});
  const form = useRef<HTMLFormElement>(null);
  useEffect(() => {
    if (estado.ok && !pessoa) form.current?.reset();
  }, [estado, pessoa]);
  const e = estado.erros ?? {};
  const v = (campo: string, original = '') => estado.valores?.[campo] ?? original;
  const id = (c: string) => `${pessoa ? 'editar' : 'nova'}-${c}`;

  return (
    <form ref={form} action={acao} className="flex flex-col gap-4" aria-label={pessoa ? `Editar ${pessoa.nome}` : 'Cadastrar pessoa'}>
      <input type="hidden" name="projeto_id" value={projetoId} />
      {pessoa && <input type="hidden" name="pessoa_id" value={pessoa.id} />}
      <div className="grid gap-4 sm:grid-cols-2">
        <Campo rotulo="Nome" nome={id('nome')} erro={e.nome}>
          <input id={id('nome')} name="nome" required maxLength={160} defaultValue={v('nome', pessoa?.nome)} className={classeEntrada} autoComplete="off" />
        </Campo>
        <Campo rotulo="Função" nome={id('funcao')} erro={e.funcao}>
          <input id={id('funcao')} name="funcao" required maxLength={80} list="funcoes-obra" defaultValue={v('funcao', pessoa?.funcao)} className={classeEntrada} />
        </Campo>
        <Campo
          rotulo="CPF"
          nome={id('cpf')}
          erro={e.cpf}
          dica={pessoa?.cpf_mascarado ? `Cadastrado: ${pessoa.cpf_mascarado}. Deixe vazio para manter.` : 'Opcional. Fica mascarado na tela.'}
        >
          <input id={id('cpf')} name="cpf" inputMode="numeric" autoComplete="off" placeholder="000.000.000-00" defaultValue={v('cpf')} className={`${classeEntrada} numeros`} />
        </Campo>
        <Campo rotulo="Empreiteira" nome={id('empreiteira')} erro={e.empreiteira_id}>
          <select id={id('empreiteira')} name="empreiteira_id" defaultValue={v('empreiteira_id', pessoa?.empreiteira_id ?? '')} className={classeEntrada}>
            <option value="">Equipe própria</option>
            {empreiteiras
              .filter((x) => x.ativa)
              .map((x) => (
                <option key={x.id} value={x.id}>
                  {x.nome}
                </option>
              ))}
          </select>
        </Campo>
        <Campo rotulo="Telefone" nome={id('telefone')} erro={e.telefone}>
          <input id={id('telefone')} name="telefone" inputMode="tel" maxLength={30} defaultValue={v('telefone', pessoa?.telefone ?? '')} className={classeEntrada} />
        </Campo>
      </div>
      <Retorno estado={estado} />
      <Botao type="submit" disabled={salvando} className="self-start">
        {salvando ? 'Salvando…' : pessoa ? 'Salvar dados' : 'Cadastrar e incluir na obra'}
      </Botao>
    </form>
  );
}

/** Traz pessoas já cadastradas na empresa para esta obra. */
export function IncluirPessoas({ projetoId, foraDaObra }: { projetoId: string; foraDaObra: Trabalhador[] }) {
  const [escolhidos, setEscolhidos] = useState<Set<string>>(new Set());
  const [mensagem, setMensagem] = useState<{ tipo: 'ok' | 'erro'; texto: string } | null>(null);
  const [salvando, iniciar] = useTransition();
  if (foraDaObra.length === 0) return <p className="text-sm text-regua">Todas as pessoas da empresa já estão nesta obra.</p>;

  return (
    <div className="flex flex-col gap-3">
      <ul className="flex max-h-72 flex-col overflow-auto rounded-medio border border-linha">
        {foraDaObra.map((p) => (
          <li key={p.id} className="border-b border-linha last:border-b-0">
            <label className="flex min-h-11 cursor-pointer items-center gap-3 px-3 py-2 text-sm">
              <input
                type="checkbox"
                checked={escolhidos.has(p.id)}
                onChange={(e) =>
                  setEscolhidos((s) => {
                    const n = new Set(s);
                    if (e.target.checked) n.add(p.id);
                    else n.delete(p.id);
                    return n;
                  })
                }
                className="size-5 accent-cianotipia"
              />
              <span>
                <span className="font-semibold">{p.nome}</span> <span className="text-regua">· {p.funcao}</span>
              </span>
            </label>
          </li>
        ))}
      </ul>
      <Botao
        type="button"
        className="self-start"
        disabled={escolhidos.size === 0 || salvando}
        onClick={() =>
          iniciar(async () => {
            const r = await incluirNaEquipe(projetoId, [...escolhidos]);
            setMensagem(r.ok ? { tipo: 'ok', texto: r.mensagem ?? 'Incluídas.' } : { tipo: 'erro', texto: r.erro });
            if (r.ok) setEscolhidos(new Set());
          })
        }
      >
        {salvando ? 'Incluindo…' : `Incluir na obra (${escolhidos.size})`}
      </Botao>
      {mensagem && (
        <p role={mensagem.tipo === 'erro' ? 'alert' : 'status'} className={`text-sm ${mensagem.tipo === 'erro' ? 'text-marcador' : 'text-obra-ok'}`}>
          {mensagem.texto}
        </p>
      )}
    </div>
  );
}

export function BotaoNaObra({ projetoId, pessoaId, naObra }: { projetoId: string; pessoaId: string; naObra: boolean }) {
  const [erro, setErro] = useState<string | null>(null);
  const [salvando, iniciar] = useTransition();
  return (
    <>
      <button
        type="button"
        disabled={salvando}
        onClick={() =>
          iniciar(async () => {
            const r = await definirNaObra(projetoId, pessoaId, !naObra);
            if (!r.ok) setErro(r.erro);
          })
        }
        className={`min-h-11 px-2 text-sm font-semibold hover:underline underline-offset-4 ${naObra ? 'text-marcador' : 'text-cianotipia'}`}
      >
        {salvando ? '…' : naObra ? 'Tirar da chamada' : 'Voltar para a chamada'}
      </button>
      {erro && (
        <span role="alert" className="text-xs text-marcador">
          {erro}
        </span>
      )}
    </>
  );
}

/** Empreiteira com consulta do CNPJ na Receita (BrasilAPI) para preencher o nome. */
export function FormularioEmpreiteira({ projetoId }: { projetoId: string }) {
  const [estado, acao, salvando] = useActionState<EstadoForm, FormData>(salvarEmpreiteira, {});
  const [cnpj, setCnpj] = useState('');
  const [nome, setNome] = useState('');
  const [telefone, setTelefone] = useState('');
  const [consulta, setConsulta] = useState<{ tipo: 'ok' | 'alerta' | 'erro'; texto: string } | null>(null);
  const [consultando, iniciar] = useTransition();
  useEffect(() => {
    if (estado.ok) {
      setCnpj('');
      setNome('');
      setTelefone('');
      setConsulta(null);
    }
  }, [estado]);
  const e = estado.erros ?? {};

  function consultar() {
    setConsulta(null);
    iniciar(async () => {
      const r = await buscarCnpj(cnpj);
      if (!r.ok || !r.valor) return setConsulta({ tipo: 'erro', texto: r.ok ? 'Sem dados.' : r.erro });
      const d = r.valor;
      setNome(d.nome_fantasia ?? d.razao_social);
      if (d.telefone && !telefone) setTelefone(d.telefone);
      setConsulta(
        d.ativa
          ? { tipo: 'ok', texto: `${d.razao_social} · situação ATIVA na Receita${d.municipio ? ` · ${d.municipio}/${d.uf}` : ''}.` }
          : { tipo: 'alerta', texto: `${d.razao_social}: situação ${d.situacao ?? 'desconhecida'} na Receita. Confira antes de contratar.` },
      );
    });
  }

  return (
    <form action={acao} className="flex flex-col gap-4" aria-label="Cadastrar empreiteira">
      <input type="hidden" name="projeto_id" value={projetoId} />
      <Campo rotulo="CNPJ" nome="emp-cnpj" erro={e.cnpj} dica="Opcional. Com o CNPJ, o nome e a situação vêm da Receita.">
        <div className="flex gap-2">
          <input
            id="emp-cnpj"
            name="cnpj"
            inputMode="numeric"
            placeholder="00.000.000/0000-00"
            value={cnpj}
            onChange={(ev) => setCnpj(ev.target.value)}
            className={`${classeEntrada} numeros`}
          />
          <Botao type="button" variante="secundario" onClick={consultar} disabled={consultando || cnpj.replace(/\D/g, '').length !== 14}>
            {consultando ? 'Buscando…' : 'Buscar na Receita'}
          </Botao>
        </div>
      </Campo>
      {consulta && (
        <p
          role={consulta.tipo === 'erro' ? 'alert' : 'status'}
          className={`rounded-medio px-3 py-2 text-sm ${
            consulta.tipo === 'ok' ? 'bg-obra-ok/10 text-obra-ok' : consulta.tipo === 'alerta' ? 'bg-marcador-claro font-semibold text-marcador' : 'text-marcador'
          }`}
        >
          {consulta.texto}
        </p>
      )}
      <div className="grid gap-4 sm:grid-cols-2">
        <Campo rotulo="Nome" nome="emp-nome" erro={e.nome}>
          <input id="emp-nome" name="nome" required maxLength={160} value={nome} onChange={(ev) => setNome(ev.target.value)} className={classeEntrada} />
        </Campo>
        <Campo rotulo="Telefone" nome="emp-telefone" erro={e.telefone}>
          <input id="emp-telefone" name="telefone" inputMode="tel" maxLength={30} value={telefone} onChange={(ev) => setTelefone(ev.target.value)} className={classeEntrada} />
        </Campo>
      </div>
      <Retorno estado={estado} />
      <Botao type="submit" disabled={salvando} className="self-start">
        {salvando ? 'Salvando…' : 'Cadastrar empreiteira'}
      </Botao>
    </form>
  );
}

export function FormularioCusto({ projetoId, pessoaId }: { projetoId: string; pessoaId: string }) {
  const [estado, acao, salvando] = useActionState<EstadoForm, FormData>(salvarCusto, {});
  const [tipo, setTipo] = useState<(typeof TIPOS_CUSTO_MAO_OBRA)[number]>('diaria');
  const e = estado.erros ?? {};
  return (
    <form action={acao} className="flex flex-col gap-4" aria-label="Lançar custo">
      <input type="hidden" name="projeto_id" value={projetoId} />
      <input type="hidden" name="pessoa_id" value={pessoaId} />
      <fieldset>
        <legend className="mb-2 text-sm font-semibold">Como é paga</legend>
        <div className="inline-flex flex-wrap rounded-medio border border-linha p-0.5">
          {TIPOS_CUSTO_MAO_OBRA.map((t) => (
            <label
              key={t}
              className={`flex min-h-10 cursor-pointer items-center rounded-[8px] px-3 text-sm font-semibold has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-cianotipia ${
                tipo === t ? 'bg-cianotipia text-white' : 'text-regua'
              }`}
            >
              <input type="radio" name="tipo" value={t} checked={tipo === t} onChange={() => setTipo(t)} className="sr-only" />
              {ROTULO_TIPO_CUSTO[t]}
            </label>
          ))}
        </div>
      </fieldset>
      <div className="grid gap-4 sm:grid-cols-3">
        <Campo rotulo={tipo === 'hora' ? 'Valor da hora (R$)' : tipo === 'diaria' ? 'Valor da diária (R$)' : 'Valor por unidade (R$)'} nome="custo-valor" erro={e.valor}>
          <input id="custo-valor" name="valor" inputMode="decimal" required placeholder="0,00" className={`${classeEntrada} numeros`} />
        </Campo>
        {tipo === 'producao' && (
          <Campo rotulo="Unidade" nome="custo-unidade" erro={e.unidade_producao}>
            <input id="custo-unidade" name="unidade_producao" required maxLength={20} placeholder="m², m³, un" className={classeEntrada} />
          </Campo>
        )}
        <Campo rotulo="Vale a partir de" nome="custo-desde" erro={e.vigente_desde}>
          <input id="custo-desde" name="vigente_desde" type="date" required defaultValue={hojeIso()} className={classeEntrada} />
        </Campo>
      </div>
      <Retorno estado={estado} />
      <Botao type="submit" disabled={salvando} className="self-start">
        {salvando ? 'Salvando…' : 'Lançar custo'}
      </Botao>
    </form>
  );
}

