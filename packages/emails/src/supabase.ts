import { cru, html, type Seguro } from './html';
import { botao, codigo, forte, moldura, NOME_PRODUTO, paragrafo, quadro, reserva, titulo } from './moldura';

// Modelos dos e-mails de acesso que o próprio Supabase Auth envia (pelo SMTP da Resend).
// São colados em Authentication → Emails, no painel do Supabase; os arquivos ficam em `supabase/templates/`.
//
// O link não usa `{{ .ConfirmationURL }}`: ele leva para `/auth/confirmar` do app com o `token_hash`, e a página
// pede um toque antes de validar. Assim o link funciona aberto em outro aparelho (cadastrou no computador, abriu
// no celular) e não é gasto por antivírus de e-mail corporativo que abre os links sozinho.

const SITE = cru('{{ .SiteURL }}');
const EMAIL = cru('{{ .Email }}');

function link(tipo: 'email' | 'invite' | 'recovery' | 'email_change'): Seguro {
  return cru(`{{ .SiteURL }}/auth/confirmar?token_hash={{ .TokenHash }}&amp;type=${tipo}`);
}

export type ModeloSupabase = {
  arquivo: string;
  /** Nome da aba em Authentication → Emails → Templates. */
  aba: string;
  assunto: string;
  html: string;
};

function confirmarCadastro(): ModeloSupabase {
  const url = link('email');
  return {
    arquivo: 'confirmar-cadastro.html',
    aba: 'Confirm sign up',
    assunto: `Confirme seu e-mail para entrar no ${NOME_PRODUTO}`,
    html: moldura({
      base: SITE,
      titulo: 'Confirme seu e-mail',
      previa: 'Falta um toque para entrar e cadastrar a primeira obra.',
      conteudo: html`${titulo('Confirme seu e-mail')}
${paragrafo(html`Falta um passo para usar o ${NOME_PRODUTO} com ${forte(EMAIL)}. Confirme o endereço e entre para cadastrar a empresa e a primeira obra.`)}
${botao('Confirmar e-mail', url)}
${paragrafo('O link vale por 1 hora e funciona uma vez.', true)}
${reserva(url)}`,
      motivo: html`Você recebeu este e-mail porque alguém criou uma conta com ${EMAIL}. Se não foi você, ignore: sem a confirmação, nada acontece.`,
      decorrido: 0.08,
    }).valor,
  };
}

function convite(): ModeloSupabase {
  const url = link('invite');
  return {
    arquivo: 'convite.html',
    aba: 'Invite user',
    assunto: `Você foi convidado para uma obra no ${NOME_PRODUTO}`,
    html: moldura({
      base: SITE,
      titulo: 'Convite para a obra',
      previa: cru('{{ if .Data.convidado_por }}{{ .Data.convidado_por }} chamou você{{ else }}Chamaram você{{ end }} para acompanhar a obra.'),
      conteudo: html`${titulo('Você foi convidado para a obra')}
${paragrafo(cru(`{{ if .Data.convidado_por }}<strong style="font-weight:600;">{{ .Data.convidado_por }}</strong> chamou você{{ else }}Chamaram você{{ end }} para acompanhar {{ if .Data.projeto }}a obra <strong style="font-weight:600;">{{ .Data.projeto }}</strong>{{ else }}as obras{{ end }} no ${NOME_PRODUTO}{{ if .Data.empresa }}, da {{ .Data.empresa }}{{ end }}.`))}
${cru('{{ if .Data.papel }}')}${quadro([
        ['Seu papel', cru('{{ .Data.papel }}')],
        ['Entra com', EMAIL],
      ])}${cru('{{ end }}')}
${botao('Aceitar e criar senha', url)}
${paragrafo('Você escolhe uma senha e entra direto na obra. Depois, dá para entrar também com o Google usando este mesmo e-mail.', true)}
${reserva(url)}`,
      motivo: html`Convite enviado para ${EMAIL}. Se você não conhece quem convidou, ignore este e-mail.`,
      decorrido: 0.25,
    }).valor,
  };
}

function linkMagico(): ModeloSupabase {
  const url = link('email');
  return {
    arquivo: 'link-magico.html',
    aba: 'Magic link',
    assunto: `Seu link para entrar no ${NOME_PRODUTO}`,
    html: moldura({
      base: SITE,
      titulo: 'Entrar no app',
      previa: 'Toque no link para entrar sem digitar a senha.',
      conteudo: html`${titulo('Seu link para entrar')}
${paragrafo(html`Toque no botão para entrar como ${forte(EMAIL)}, sem digitar a senha.`)}
${botao(`Entrar no ${NOME_PRODUTO}`, url)}
${paragrafo('O link vale por 1 hora e funciona uma vez.', true)}
${reserva(url)}`,
      motivo: html`Alguém pediu um link de acesso para ${EMAIL}. Se não foi você, ignore: sem o toque no link, ninguém entra.`,
      decorrido: 0.5,
    }).valor,
  };
}

function trocaDeEmail(): ModeloSupabase {
  const url = link('email_change');
  return {
    arquivo: 'troca-de-email.html',
    aba: 'Change email address',
    assunto: 'Confirme a troca de e-mail da sua conta',
    html: moldura({
      base: SITE,
      titulo: 'Troca de e-mail',
      previa: 'Confirme o novo endereço da sua conta.',
      conteudo: html`${titulo('Confirme a troca de e-mail')}
${quadro([
  ['E-mail atual', EMAIL],
  ['Novo e-mail', cru('{{ .NewEmail }}')],
])}
${paragrafo('A troca só vale depois da confirmação. Até lá, continue entrando com o e-mail atual.')}
${botao('Confirmar troca', url)}
${reserva(url)}`,
      motivo: html`Você recebeu este e-mail porque pediram para trocar o e-mail da conta ${EMAIL}. Se não foi você, ignore e troque sua senha.`,
      decorrido: 0.75,
    }).valor,
  };
}

function redefinirSenha(): ModeloSupabase {
  const url = link('recovery');
  return {
    arquivo: 'redefinir-senha.html',
    aba: 'Reset password',
    assunto: `Crie uma nova senha no ${NOME_PRODUTO}`,
    html: moldura({
      base: SITE,
      titulo: 'Nova senha',
      previa: 'Toque no link para escolher uma nova senha.',
      conteudo: html`${titulo('Crie uma nova senha')}
${paragrafo(html`Recebemos um pedido para trocar a senha de ${forte(EMAIL)}. Toque no botão e escolha a nova senha.`)}
${botao('Criar nova senha', url)}
${paragrafo('O link vale por 1 hora e funciona uma vez.', true)}
${reserva(url)}`,
      motivo: html`Se não foi você que pediu, ignore este e-mail: a senha de ${EMAIL} continua a mesma.`,
      decorrido: 0.62,
    }).valor,
  };
}

function reautenticacao(): ModeloSupabase {
  return {
    arquivo: 'reautenticacao.html',
    aba: 'Reauthentication',
    assunto: 'Seu código de confirmação',
    html: moldura({
      base: SITE,
      titulo: 'Código de confirmação',
      previa: cru('Código: {{ .Token }}'),
      conteudo: html`${titulo('Seu código de confirmação')}
${paragrafo('Digite este código no app para confirmar a ação.')}
${codigo(cru('{{ .Token }}'))}
${paragrafo('O código vale por poucos minutos. Não passe para ninguém: nossa equipe nunca pede este código.', true)}`,
      motivo: html`Código pedido pela conta ${EMAIL}. Se não foi você, troque sua senha.`,
      decorrido: 0.9,
    }).valor,
  };
}

export function modelosSupabase(): ModeloSupabase[] {
  return [confirmarCadastro(), convite(), linkMagico(), trocaDeEmail(), redefinirSenha(), reautenticacao()];
}
