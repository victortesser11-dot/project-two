'use client';

import { useActionState, useState } from 'react';
import { CLIMAS, ROTULO_CLIMA, type Clima, type ClimaDoDia, type Diario } from '@obras/shared';
import { salvarDiario, type EstadoDiario } from './acoes';
import { AvisoErro, Botao, Campo, classeEntrada } from '@/components/ui';
import { Cloud, CloudDrizzle, CloudRainWind, Sun } from 'lucide-react';

const numeroBr = (n: number | null | undefined) => (n === null || n === undefined ? '' : String(n).replace('.', ','));

const ICONE: Record<Clima, React.ReactNode> = {
  sol: <Sun aria-hidden className="size-5" />,
  nublado: <Cloud aria-hidden className="size-5" />,
  chuva: <CloudDrizzle aria-hidden className="size-5" />,
  chuva_forte: <CloudRainWind aria-hidden className="size-5" />,
};

/** Clima de um período: quatro botões grandes (rádio) e "deu para trabalhar?". */
function Periodo({
  nome,
  titulo,
  clima,
  praticavel,
  onClima,
  onPraticavel,
}: {
  nome: 'manha' | 'tarde';
  titulo: string;
  clima: Clima | null;
  praticavel: boolean;
  onClima: (c: Clima) => void;
  onPraticavel: (p: boolean) => void;
}) {
  return (
    <fieldset className="flex flex-col gap-2">
      <legend className="mb-2 text-sm font-semibold">{titulo}</legend>
      <div className="grid grid-cols-4 gap-2">
        {CLIMAS.map((c) => (
          <label
            key={c}
            className={`flex min-h-16 cursor-pointer flex-col items-center justify-center gap-1 rounded-medio border text-xs font-semibold transition-colors has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-cianotipia ${
              clima === c ? 'border-cianotipia bg-cianotipia-claro text-cianotipia' : 'border-campo/50 bg-papel text-regua hover:border-grafite'
            }`}
          >
            <input type="radio" name={`clima_${nome}`} value={c} checked={clima === c} onChange={() => onClima(c)} className="sr-only" />
            {ICONE[c]}
            {ROTULO_CLIMA[c]}
          </label>
        ))}
      </div>
      <label className="flex min-h-11 items-center gap-3 text-sm">
        <input
          type="checkbox"
          name={`praticavel_${nome}`}
          checked={praticavel}
          onChange={(e) => onPraticavel(e.target.checked)}
          className="size-5 accent-cianotipia"
        />
        Deu para trabalhar
      </label>
    </fieldset>
  );
}

export function FormularioDiario({
  projetoId,
  data,
  diario,
  sugestao,
}: {
  projetoId: string;
  data: string;
  diario: Diario | null;
  /** Clima do Open-Meteo para a localização da obra (quando ainda não há clima salvo). */
  sugestao: ClimaDoDia | null;
}) {
  const [estado, acao, salvando] = useActionState<EstadoDiario, FormData>(salvarDiario, {});
  const temClima = diario?.clima_manha != null;
  const base = temClima || !sugestao ? null : sugestao;

  const [manha, setManha] = useState<Clima | null>(diario?.clima_manha ?? base?.clima_manha ?? null);
  const [tarde, setTarde] = useState<Clima | null>(diario?.clima_tarde ?? base?.clima_tarde ?? null);
  const [pManha, setPManha] = useState(diario ? diario.praticavel_manha : (base?.praticavel_manha ?? true));
  const [pTarde, setPTarde] = useState(diario ? diario.praticavel_tarde : (base?.praticavel_tarde ?? true));
  const [tMin, setTMin] = useState(numeroBr(diario?.temp_min ?? base?.temp_min));
  const [tMax, setTMax] = useState(numeroBr(diario?.temp_max ?? base?.temp_max));
  const [chuva, setChuva] = useState(numeroBr(diario?.chuva_mm ?? base?.chuva_mm));

  // "Automático" só se o clima salvo é o sugerido, sem ajuste na obra.
  const automatico = base
    ? manha === base.clima_manha && tarde === base.clima_tarde && pManha === base.praticavel_manha && pTarde === base.praticavel_tarde
    : Boolean(diario?.clima_automatico);
  const e = estado.erros ?? {};

  return (
    <form action={acao} className="flex flex-col gap-6" aria-label="Clima e ocorrências do dia">
      <input type="hidden" name="projeto_id" value={projetoId} />
      <input type="hidden" name="data" value={data} />
      <input type="hidden" name="clima_automatico" value={automatico ? 'true' : 'false'} />

      <section aria-labelledby="titulo-clima" className="flex flex-col gap-4 rounded-medio border border-linha bg-papel p-4 sm:p-5">
        <div>
          <h3 id="titulo-clima" className="text-base font-semibold">
            Clima
          </h3>
          {base && (
            <p className="mt-1 text-sm text-cianotipia">Sugerido pelo Open-Meteo para a localização da obra. Confira e ajuste se precisar.</p>
          )}
        </div>
        <div className="grid gap-5 lg:grid-cols-2">
          <Periodo nome="manha" titulo="Manhã" clima={manha} praticavel={pManha} onClima={setManha} onPraticavel={setPManha} />
          <Periodo nome="tarde" titulo="Tarde" clima={tarde} praticavel={pTarde} onClima={setTarde} onPraticavel={setPTarde} />
        </div>
        <div className="grid grid-cols-3 gap-3">
          <Campo rotulo="Mínima (°C)" nome="temp_min" erro={e.temp_min}>
            <input id="temp_min" name="temp_min" inputMode="decimal" value={tMin} onChange={(ev) => setTMin(ev.target.value)} className={`${classeEntrada} numeros`} />
          </Campo>
          <Campo rotulo="Máxima (°C)" nome="temp_max" erro={e.temp_max}>
            <input id="temp_max" name="temp_max" inputMode="decimal" value={tMax} onChange={(ev) => setTMax(ev.target.value)} className={`${classeEntrada} numeros`} />
          </Campo>
          <Campo rotulo="Chuva (mm)" nome="chuva_mm" erro={e.chuva_mm}>
            <input id="chuva_mm" name="chuva_mm" inputMode="decimal" value={chuva} onChange={(ev) => setChuva(ev.target.value)} className={`${classeEntrada} numeros`} />
          </Campo>
        </div>
      </section>

      <section aria-labelledby="titulo-ocorrencias" className="flex flex-col gap-4 rounded-medio border border-linha bg-papel p-4 sm:p-5">
        <h3 id="titulo-ocorrencias" className="text-base font-semibold">
          Ocorrências e observações
        </h3>
        <Campo rotulo="Ocorrências" nome="ocorrencias" erro={e.ocorrencias} dica="Paralisações, acidentes, visitas, falta de material, entregas.">
          <textarea id="ocorrencias" name="ocorrencias" rows={4} maxLength={4000} defaultValue={diario?.ocorrencias ?? ''} className={classeEntrada} />
        </Campo>
        <Campo rotulo="Observações" nome="observacoes" erro={e.observacoes}>
          <textarea id="observacoes" name="observacoes" rows={3} maxLength={4000} defaultValue={diario?.observacoes ?? ''} className={classeEntrada} />
        </Campo>
      </section>

      {estado.erroGeral && <AvisoErro>{estado.erroGeral}</AvisoErro>}
      <div className="flex flex-wrap items-center gap-3">
        <Botao type="submit" disabled={salvando}>
          {salvando ? 'Salvando…' : 'Salvar diário'}
        </Botao>
        {estado.ok && (
          <p role="status" className="text-sm text-obra-ok">
            {estado.mensagem}
          </p>
        )}
      </div>
    </form>
  );
}
