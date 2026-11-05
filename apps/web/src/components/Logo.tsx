/** Marca do app: casa em traço branco sobre cianotipia. */
export function Logo({ className = 'size-7' }: { className?: string }) {
  return (
    <svg aria-hidden viewBox="0 0 32 32" className={`${className} shrink-0`}>
      <rect width="32" height="32" rx="8" fill="#2346a0" />
      <path d="M6 24h20M8 24V12l8-5 8 5v12" fill="none" stroke="#fff" strokeWidth="2.4" strokeLinejoin="round" />
      <path d="M13 24v-6h6v6" fill="none" stroke="#fff" strokeWidth="2.4" />
    </svg>
  );
}
