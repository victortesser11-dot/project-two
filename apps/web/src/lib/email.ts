import 'server-only';

// Envio pela API da Resend (sem SDK). Sem RESEND_API_KEY, não envia nada e o app segue normal.
// Sem domínio verificado na Resend, o remetente de teste (onboarding@resend.dev) só entrega para o
// e-mail do dono da conta da Resend; os outros voltam erro 403, registrado no log.

export type MensagemEmail = { para: string; assunto: string; html: string; texto: string; responderPara?: string | null };

export function emailConfigurado() {
  return Boolean(process.env.RESEND_API_KEY);
}

export async function enviarEmail(m: MensagemEmail): Promise<boolean> {
  const chave = process.env.RESEND_API_KEY;
  if (!chave) return false;
  const remetente = process.env.EMAIL_REMETENTE || 'Controle de Obras <onboarding@resend.dev>';
  try {
    const resposta = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { Authorization: `Bearer ${chave}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from: remetente,
        to: [m.para],
        subject: m.assunto,
        html: m.html,
        text: m.texto,
        ...(m.responderPara ? { reply_to: m.responderPara } : {}),
      }),
      signal: AbortSignal.timeout(10_000),
    });
    if (!resposta.ok) {
      console.error(`E-mail "${m.assunto}" não enviado: ${resposta.status} ${(await resposta.text().catch(() => '')).slice(0, 300)}`);
      return false;
    }
    return true;
  } catch (erro) {
    console.error(`E-mail "${m.assunto}" não enviado:`, erro instanceof Error ? erro.message : erro);
    return false;
  }
}
