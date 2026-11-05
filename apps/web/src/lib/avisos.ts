import { toast } from 'sonner';

/** Avisos rápidos depois de uma ação (só no navegador). Erro de formulário continua junto do campo. */
export const avisar = {
  ok: (mensagem: string) => toast.success(mensagem),
  erro: (mensagem: string) => toast.error(mensagem, { duration: 8000 }),
  info: (mensagem: string) => toast.info(mensagem),
};

/** Mostra o resultado de uma action no padrão `{ ok, mensagem } | { ok: false, erro }`. */
export function avisarResultado(r: { ok: true; mensagem: string } | { ok: false; erro: string }) {
  if (r.ok) avisar.ok(r.mensagem);
  else avisar.erro(r.erro);
}
