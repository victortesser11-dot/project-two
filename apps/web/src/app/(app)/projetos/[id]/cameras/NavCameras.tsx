import Link from 'next/link';

export type AbaCameras = 'cameras' | 'galeria' | 'comparar' | 'timelapse' | 'configurar';

export function NavCameras({ projetoId, ativa, podeConfigurar }: { projetoId: string; ativa: AbaCameras; podeConfigurar: boolean }) {
  const base = `/projetos/${projetoId}/cameras`;
  const abas: { chave: AbaCameras; href: string; nome: string }[] = [
    { chave: 'cameras', href: base, nome: 'Hoje' },
    { chave: 'galeria', href: `${base}/galeria`, nome: 'Galeria' },
    { chave: 'comparar', href: `${base}/comparar`, nome: 'Comparar dias' },
    { chave: 'timelapse', href: `${base}/timelapse`, nome: 'Time-lapse' },
    ...(podeConfigurar ? [{ chave: 'configurar' as const, href: `${base}/configurar`, nome: 'Configurar' }] : []),
  ];
  return (
    <nav aria-label="Seções das câmeras" className="-mx-4 overflow-x-auto px-4 sm:mx-0 sm:px-0 print:hidden">
      <div className="inline-flex min-w-max rounded-medio border border-linha bg-concreto p-0.5">
        {abas.map((a) => (
          <Link
            key={a.chave}
            href={a.href}
            aria-current={ativa === a.chave ? 'page' : undefined}
            className={`flex min-h-10 items-center rounded-[8px] px-3.5 text-sm font-semibold whitespace-nowrap transition-colors ${
              ativa === a.chave ? 'bg-papel text-grafite shadow-[0_0_0_1px_var(--color-linha)]' : 'text-regua hover:text-grafite'
            }`}
          >
            {a.nome}
          </Link>
        ))}
      </div>
    </nav>
  );
}

export function TopoCameras({
  projetoId,
  ativa,
  podeConfigurar,
  titulo,
  descricao,
  acoes,
}: {
  projetoId: string;
  ativa: AbaCameras;
  podeConfigurar: boolean;
  titulo: string;
  descricao: string;
  acoes?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-5">
      <NavCameras projetoId={projetoId} ativa={ativa} podeConfigurar={podeConfigurar} />
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h2 className="text-xl font-semibold sm:text-2xl">{titulo}</h2>
          <p className="mt-1 max-w-2xl text-regua">{descricao}</p>
        </div>
        {acoes && <div className="flex flex-wrap gap-2">{acoes}</div>}
      </div>
    </div>
  );
}

/** Seletor de câmera por links (?camera=), mantendo os outros parâmetros. */
export function SeletorCamera({
  cameras,
  atual,
  href,
}: {
  cameras: { id: string; nome: string }[];
  atual: string;
  href: (cameraId: string) => string;
}) {
  if (cameras.length < 2) return null;
  return (
    <nav aria-label="Câmera" className="flex gap-2 overflow-x-auto">
      {cameras.map((c) => (
        <Link
          key={c.id}
          href={href(c.id)}
          aria-current={c.id === atual ? 'page' : undefined}
          className={`flex min-h-11 shrink-0 items-center rounded-full border px-4 text-sm font-semibold ${
            c.id === atual ? 'border-cianotipia bg-cianotipia-claro text-cianotipia' : 'border-linha bg-papel text-regua hover:text-grafite'
          }`}
        >
          {c.nome}
        </Link>
      ))}
    </nav>
  );
}
