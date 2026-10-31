// Variáveis públicas do Supabase. Aceita o nome novo (publishable) e o antigo (anon).
export const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL ?? '';
export const supabaseKey =
  process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? '';

export const supabaseConfigurado = supabaseUrl !== '' && supabaseKey !== '';

export function urlDoSite(): string {
  const explicita = process.env.NEXT_PUBLIC_SITE_URL;
  if (explicita) return explicita.replace(/\/$/, '');
  const vercel = process.env.VERCEL_PROJECT_PRODUCTION_URL ?? process.env.VERCEL_URL;
  if (vercel) return `https://${vercel}`;
  return 'http://localhost:3000';
}
