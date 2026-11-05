# Modelos dos e-mails de acesso (Supabase Auth)

Gerados por `packages/emails` (não edite à mão): mudou o modelo, rode `pnpm --filter @obras/emails exportar`.
O teste do pacote falha se estes arquivos ficarem diferentes do código.

No painel do Supabase: **Authentication → Emails → Templates**. Em cada aba, troque o assunto e cole o arquivo
inteiro no corpo (aba "Source"):

| Aba no painel          | Assunto                                                   | Arquivo                   |
| ---------------------- | --------------------------------------------------------- | ------------------------- |
| Confirm sign up        | Confirme seu e-mail para entrar no Controle de Obras      | `confirmar-cadastro.html` |
| Invite user            | Você foi convidado para uma obra no Controle de Obras     | `convite.html`            |
| Magic link             | Seu link para entrar no Controle de Obras                 | `link-magico.html`        |
| Change email address   | Confirme a troca de e-mail da sua conta                   | `troca-de-email.html`     |
| Reset password         | Crie uma nova senha no Controle de Obras                  | `redefinir-senha.html`    |
| Reauthentication       | Seu código de confirmação                                 | `reautenticacao.html`     |

Os links levam para `{{ .SiteURL }}/auth/confirmar?token_hash=...&type=...`: o **Site URL** (Authentication →
URL Configuration) precisa ser o endereço de produção do app, e o logo vem de `{{ .SiteURL }}/email/logo.png`.
A página `/auth/confirmar` pede um toque antes de validar o link: antivírus de e-mail corporativo que abre os
links sozinho não gasta o código, e o link funciona aberto em outro aparelho.

O convite usa os dados que o app grava no convite (`convidado_por`, `projeto`, `empresa`, `papel`); convite
feito pelo painel do Supabase, sem esses dados, sai com o texto genérico.

O link vale por 1 hora (Authentication → Providers → Email → "Email OTP Expiration" = 3600).
