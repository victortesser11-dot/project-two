/** Marca do app: casa em traço sobre um quadrado. `claro`: versão para o azul-noite (quadrado amarelo de segurança). */
export function Logo({ className = 'size-7', claro = false }: { className?: string; claro?: boolean }) {
  const fundo = claro ? '#f5b800' : '#2346a0';
  const traco = claro ? '#0e1b3d' : '#fff';
  return (
    <svg aria-hidden viewBox="0 0 32 32" className={`${className} shrink-0`}>
      <rect width="32" height="32" rx="8" fill={fundo} />
      <path d="M6 24h20M8 24V12l8-5 8 5v12" fill="none" stroke={traco} strokeWidth="2.4" strokeLinejoin="round" />
      <path d="M13 24v-6h6v6" fill="none" stroke={traco} strokeWidth="2.4" />
    </svg>
  );
}
