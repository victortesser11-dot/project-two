// Capacete: desenho do Phosphor Icons ("hard-hat", peso bold), licença MIT (c) 2023 Phosphor Icons.
const CAPACETE =
  'M228,148.4V136a100.41,100.41,0,0,0-64-93.3V40a20,20,0,0,0-20-20H112A20,20,0,0,0,92,40v2.7A100.41,100.41,0,0,0,28,136v12.4A20,20,0,0,0,12,168v24a20,20,0,0,0,20,20H224a20,20,0,0,0,20-20V168A20,20,0,0,0,228,148.4ZM204,136v12H164V69.07A76.35,76.35,0,0,1,204,136ZM140,44V148H116V44ZM92,69.07V148H52V136A76.35,76.35,0,0,1,92,69.07ZM220,188H36V172H220Z';

/**
 * Marca do app: capacete amarelo de segurança. Padrão: quadrado azul-noite (fundo claro, favicon).
 * `claro`: quadrado amarelo com capacete azul-noite, para ficar sobre o menu azul-noite.
 */
export function Logo({ className = 'size-7', claro = false }: { className?: string; claro?: boolean }) {
  const fundo = claro ? '#f5b800' : '#0e1b3d';
  const capacete = claro ? '#0e1b3d' : '#f5b800';
  return (
    <svg aria-hidden viewBox="0 0 32 32" className={`${className} shrink-0`}>
      <rect width="32" height="32" rx="7" fill={fundo} />
      <g transform="translate(5 4.7) scale(0.0859)">
        <path d={CAPACETE} fill={capacete} />
      </g>
    </svg>
  );
}
