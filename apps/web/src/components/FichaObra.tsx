import Link from 'next/link';
import { ClipboardList } from 'lucide-react';
import { CAMPOS_FICHA, type ProjetoComFicha } from '@obras/shared';

/**
 * Ficha técnica da obra no painel (carimbo das pranchas e licenciamento). Vazia, só quem edita a obra vê o convite para
 * preencher, pela leitura dos projetos com IA ou à mão.
 */
export function FichaObra({ projeto, podeEditar, comIa }: { projeto: ProjetoComFicha; podeEditar: boolean; comIa: boolean }) {
  const preenchidos = CAMPOS_FICHA.flatMap((c) => {
    const v = projeto[c.campo];
    if (v === null || v === undefined || v === '') return [];
    return [{ rotulo: c.rotulo.replace(' (m²)', ''), valor: c.area ? `${Number(v).toLocaleString('pt-BR', { maximumFractionDigits: 2 })} m²` : String(v), area: c.area }];
  });
  if (preenchidos.length === 0 && !podeEditar) return null;

  return (
    <section aria-labelledby="ficha-titulo" className="cartao p-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h3 id="ficha-titulo" className="flex items-center gap-3 font-semibold tracking-tight">
          <span aria-hidden className="flex size-9 items-center justify-center rounded-medio bg-cianotipia-claro text-cianotipia">
            <ClipboardList className="size-5" />
          </span>
          Ficha da obra
        </h3>
        {podeEditar && (
          <Link href={`/projetos/${projeto.id}/editar`} className="text-sm font-medium text-cianotipia underline-offset-4 hover:underline">
            Editar
          </Link>
        )}
      </div>
      {preenchidos.length > 0 ? (
        <dl className="mt-4 grid gap-x-6 gap-y-3 text-sm sm:grid-cols-2 lg:grid-cols-3">
          {preenchidos.map((f) => (
            <div key={f.rotulo} className="min-w-0">
              <dt className="text-regua">{f.rotulo}</dt>
              <dd className={`font-medium break-words${f.area ? ' numeros' : ''}`}>{f.valor}</dd>
            </div>
          ))}
        </dl>
      ) : (
        <p className="mt-3 text-sm text-regua">
          Tipo, áreas, pavimentos, responsável técnico, ART e alvará ainda não foram preenchidos.{' '}
          {comIa ? (
            <>
              Envie as pranchas na aba{' '}
              <Link href={`/projetos/${projeto.id}/arquivos`} className="font-medium text-cianotipia underline-offset-4 hover:underline">
                Arquivos
              </Link>{' '}
              e use &quot;Ler o projeto com IA&quot;: ela sugere os dados para você conferir.
            </>
          ) : (
            'Preencha em "Editar".'
          )}
        </p>
      )}
    </section>
  );
}
