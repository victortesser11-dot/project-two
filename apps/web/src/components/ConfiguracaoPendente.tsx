export function ConfiguracaoPendente() {
  return (
    <main className="mx-auto flex min-h-dvh max-w-xl flex-col justify-center gap-4 px-6">
      <h1 className="text-xl font-semibold sm:text-2xl">Falta ligar o banco de dados</h1>
      <p className="text-regua">
        Defina <code className="rounded-pequeno bg-concreto px-1.5 py-0.5 text-grafite">NEXT_PUBLIC_SUPABASE_URL</code> e{' '}
        <code className="rounded-pequeno bg-concreto px-1.5 py-0.5 text-grafite">NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY</code> nas
        variáveis de ambiente (arquivo <code>.env.local</code> ou painel da Vercel) e publique de novo.
      </p>
    </main>
  );
}
