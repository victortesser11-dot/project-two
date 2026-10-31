import { diasEntre, formatarData, prazoDecorrido } from '@obras/shared';

const MESES = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];

/** Primeiro dia de cada mês entre início e fim, como posição relativa (0–1). */
function marcasDeMes(inicio: string, fim: string) {
  const total = diasEntre(inicio, fim);
  if (total <= 0) return [];
  const marcas: { pos: number; rotulo: string; ano: boolean }[] = [];
  let [ano, mes] = inicio.split('-').map(Number) as [number, number];
  // começa no mês seguinte ao início
  mes += 1;
  for (let i = 0; i < 120; i++) {
    if (mes > 12) {
      mes = 1;
      ano += 1;
    }
    const iso = `${ano}-${String(mes).padStart(2, '0')}-01`;
    if (iso > fim) break;
    marcas.push({ pos: diasEntre(inicio, iso) / total, rotulo: MESES[mes - 1] ?? '', ano: mes === 1 });
    mes += 1;
  }
  return marcas;
}

/**
 * Régua de prazo da obra: do início ao fim previsto, com marcas de mês
 * e o "hoje" cravado. Mostra quanto do prazo já passou.
 */
export function Regua({
  inicio,
  fim,
  hoje,
  compacta = false,
}: {
  inicio: string | null;
  fim: string | null;
  hoje: string;
  compacta?: boolean;
}) {
  if (!inicio || !fim) {
    return <p className="text-sm text-regua">{compacta ? 'Sem datas' : 'Defina início e fim previsto para ver o prazo.'}</p>;
  }

  const decorrido = prazoDecorrido(inicio, fim, hoje) ?? 0;
  const marcas = marcasDeMes(inicio, fim);
  const restante = diasEntre(hoje, fim);
  const atrasado = hoje > fim;
  const texto = atrasado
    ? `${Math.abs(restante)} dias após o fim previsto`
    : hoje < inicio
      ? `Começa em ${diasEntre(hoje, inicio)} dias`
      : `${restante} dias restantes`;

  // Rótulos de mês só quando cabem: no máximo ~14 visíveis.
  const passo = Math.max(1, Math.ceil(marcas.length / 14));

  return (
    <figure className="w-full" aria-label={`Prazo de ${formatarData(inicio)} a ${formatarData(fim)}: ${texto}`}>
      <div className={`relative ${compacta ? 'h-3' : 'h-5'} border-b-2 border-grafite`}>
        {/* trecho decorrido */}
        <div
          className={`absolute bottom-0 left-0 ${compacta ? 'h-1.5' : 'h-2.5'} ${atrasado ? 'bg-marcador' : 'bg-cianotipia'}`}
          style={{ width: `${decorrido * 100}%` }}
        />
        {/* marcas de mês */}
        {marcas.map((m) => (
          <span
            key={m.pos}
            className={`absolute bottom-0 w-px bg-grafite ${m.ano ? (compacta ? 'h-3' : 'h-5') : compacta ? 'h-1.5' : 'h-2.5'}`}
            style={{ left: `${m.pos * 100}%` }}
          />
        ))}
        {/* hoje */}
        {decorrido > 0 && decorrido < 1 && (
          <span
            className={`absolute -bottom-1 w-0.5 bg-marcador ${compacta ? 'h-5' : 'h-8'}`}
            style={{ left: `${decorrido * 100}%` }}
          />
        )}
      </div>
      {!compacta && (
        <div className="relative mt-1 h-4 text-[11px] text-regua">
          {marcas.map((m, i) =>
            i % passo === 0 ? (
              <span key={m.pos} className="absolute -translate-x-1/2" style={{ left: `${m.pos * 100}%` }}>
                {m.rotulo}
              </span>
            ) : null,
          )}
        </div>
      )}
      <figcaption className={`numeros flex justify-between gap-3 text-sm ${compacta ? 'mt-1.5' : 'mt-2'}`}>
        <span className="text-regua">{formatarData(inicio)}</span>
        <span className={atrasado ? 'font-semibold text-marcador' : 'font-medium'}>{texto}</span>
        <span className="text-regua">{formatarData(fim)}</span>
      </figcaption>
    </figure>
  );
}
