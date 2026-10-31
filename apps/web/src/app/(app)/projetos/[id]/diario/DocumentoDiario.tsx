import { formatarData, formatarDataLonga, hojeIso, ROTULO_CLIMA, type Clima } from '@obras/shared';

const quantidadeBr = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 2 });
const numeroBr = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 1 });

/** Conteúdo do diário no formato do retrato assinado (app.conteudo_diario). */
export interface ConteudoDiario {
  projeto: { nome: string; endereco: string | null };
  data: string;
  clima: {
    manha: Clima | null;
    tarde: Clima | null;
    praticavel_manha: boolean;
    praticavel_tarde: boolean;
    temp_min: number | null;
    temp_max: number | null;
    chuva_mm: number | null;
    automatico: boolean;
  };
  ocorrencias: string | null;
  observacoes: string | null;
  efetivo: { funcao: string; empresa: string | null; quantidade: number }[];
  fotos: { caminho: string; legenda: string | null }[];
  avancos: { tarefa: string; percentual: number; quantidade: number | null; unidade: string | null; observacao: string | null }[];
}

export interface Assinatura {
  nome: string | null;
  em: string;
  hash: string;
}

/**
 * Diário como documento: o mesmo para ler o diário assinado e para imprimir
 * (ou salvar em PDF pelo navegador). Fotos chegam com URL assinada à parte.
 */
export function DocumentoDiario({
  conteudo,
  assinatura,
  urls,
}: {
  conteudo: ConteudoDiario;
  assinatura: Assinatura | null;
  urls: Record<string, string>;
}) {
  const c = conteudo;
  const pessoas = c.efetivo.reduce((s, e) => s + Number(e.quantidade), 0);
  const quando = assinatura ? new Date(assinatura.em) : null;
  const horaAssinatura = quando
    ? `${formatarData(hojeIso('America/Sao_Paulo', quando))} às ${new Intl.DateTimeFormat('pt-BR', {
        hour: '2-digit',
        minute: '2-digit',
        timeZone: 'America/Sao_Paulo',
      }).format(quando)}`
    : null;

  return (
    <article className="flex flex-col gap-6 text-[15px] print:gap-4 print:text-[11pt]">
      <header className="border-b-2 border-grafite pb-3">
        <p className="text-sm font-semibold tracking-wide text-regua uppercase">Diário de obra</p>
        <h2 className="mt-1 text-xl font-semibold">{c.projeto.nome}</h2>
        {c.projeto.endereco && <p className="text-sm text-regua">{c.projeto.endereco}</p>}
        <p className="mt-1 font-semibold capitalize">{formatarDataLonga(c.data)}</p>
        {!assinatura && (
          <p className="mt-2 inline-block rounded bg-marcador-claro px-2 py-0.5 text-sm font-semibold text-marcador">
            Rascunho: ainda não assinado
          </p>
        )}
      </header>

      <Secao titulo="Clima">
        <dl className="numeros grid grid-cols-2 gap-x-6 gap-y-2 sm:grid-cols-4">
          <Item rotulo="Manhã" valor={c.clima.manha ? ROTULO_CLIMA[c.clima.manha] : '—'} nota={c.clima.praticavel_manha ? 'Praticável' : 'Impraticável'} />
          <Item rotulo="Tarde" valor={c.clima.tarde ? ROTULO_CLIMA[c.clima.tarde] : '—'} nota={c.clima.praticavel_tarde ? 'Praticável' : 'Impraticável'} />
          <Item
            rotulo="Temperatura"
            valor={c.clima.temp_min !== null && c.clima.temp_max !== null ? `${numeroBr.format(c.clima.temp_min)} a ${numeroBr.format(c.clima.temp_max)} °C` : '—'}
          />
          <Item rotulo="Chuva" valor={c.clima.chuva_mm !== null ? `${numeroBr.format(c.clima.chuva_mm)} mm` : '—'} />
        </dl>
        {c.clima.automatico && <p className="mt-2 text-xs text-regua">Clima sugerido pelo Open-Meteo para a localização da obra e conferido na obra.</p>}
      </Secao>

      <Secao titulo={`Equipe (${pessoas} ${pessoas === 1 ? 'pessoa' : 'pessoas'})`}>
        {c.efetivo.length === 0 ? (
          <p className="text-regua">Equipe não informada.</p>
        ) : (
          <table className="numeros w-full text-left">
            <thead>
              <tr className="border-b border-linha text-sm text-regua">
                <th className="py-1 pr-3 font-semibold">Função</th>
                <th className="py-1 pr-3 font-semibold">Empresa</th>
                <th className="py-1 text-right font-semibold">Qtd.</th>
              </tr>
            </thead>
            <tbody>
              {c.efetivo.map((e, i) => (
                <tr key={i} className="border-b border-linha/60">
                  <td className="py-1 pr-3">{e.funcao}</td>
                  <td className="py-1 pr-3 text-regua">{e.empresa ?? 'Própria'}</td>
                  <td className="py-1 text-right">{e.quantidade}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Secao>

      <Secao titulo="Serviços executados">
        {c.avancos.length === 0 ? (
          <p className="text-regua">Nenhum avanço apontado neste dia.</p>
        ) : (
          <ul className="numeros flex flex-col gap-1">
            {c.avancos.map((a, i) => (
              <li key={i}>
                <span className="font-medium">{a.tarefa}</span>
                {' — '}
                {a.quantidade !== null
                  ? `${quantidadeBr.format(a.quantidade)} ${a.unidade ?? ''} feitos (${Math.round(a.percentual)}% da tarefa)`
                  : `${Math.round(a.percentual)}% da tarefa`}
                {a.observacao && <span className="text-regua"> · {a.observacao}</span>}
              </li>
            ))}
          </ul>
        )}
      </Secao>

      <Secao titulo="Ocorrências">
        <p className="whitespace-pre-line">{c.ocorrencias ?? 'Sem ocorrências.'}</p>
      </Secao>

      {c.observacoes && (
        <Secao titulo="Observações">
          <p className="whitespace-pre-line">{c.observacoes}</p>
        </Secao>
      )}

      {c.fotos.length > 0 && (
        <Secao titulo={`Fotos (${c.fotos.length})`}>
          <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 print:grid-cols-3">
            {c.fotos.map((f) => (
              <li key={f.caminho} className="break-inside-avoid">
                {urls[f.caminho] ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={urls[f.caminho]} alt={f.legenda ?? 'Foto do dia'} className="aspect-[4/3] w-full rounded-pequeno border border-linha object-cover" />
                ) : (
                  <div className="flex aspect-[4/3] items-center justify-center rounded-pequeno border border-dashed border-linha text-xs text-regua">
                    Foto indisponível
                  </div>
                )}
                {f.legenda && <p className="mt-1 text-sm">{f.legenda}</p>}
              </li>
            ))}
          </ul>
        </Secao>
      )}

      <footer className="mt-2 border-t-2 border-grafite pt-3 text-sm break-inside-avoid">
        {assinatura ? (
          <>
            <p>
              Assinado por <strong className="font-semibold">{assinatura.nome ?? 'engenheiro da obra'}</strong> em {horaAssinatura}.
            </p>
            <p className="mt-1 text-regua">
              Impressão digital do conteúdo (SHA-256):{' '}
              <span className="font-mono text-xs break-all text-grafite">{assinatura.hash}</span>
            </p>
            <p className="mt-1 text-xs text-regua">
              Qualquer mudança no conteúdo muda esse código. Diário assinado não pode ser alterado no sistema.
            </p>
          </>
        ) : (
          <p className="text-regua">Aguardando assinatura do engenheiro da obra.</p>
        )}
      </footer>
    </article>
  );
}

function Secao({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <section className="break-inside-avoid">
      <h3 className="mb-2 text-base font-semibold">{titulo}</h3>
      {children}
    </section>
  );
}

function Item({ rotulo, valor, nota }: { rotulo: string; valor: string; nota?: string }) {
  return (
    <div>
      <dt className="text-sm text-regua">{rotulo}</dt>
      <dd className="font-semibold">{valor}</dd>
      {nota && <dd className="text-xs text-regua">{nota}</dd>}
    </div>
  );
}
