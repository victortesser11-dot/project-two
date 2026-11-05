import 'server-only';
import { after } from 'next/server';
import { emailAcessoObra } from '@obras/emails';
import { DESCRICAO_PAPEL_PROJETO, ROTULO_PAPEL_PROJETO, type PapelProjeto } from '@obras/shared';
import { emailConfigurado, enviarEmail } from '@/lib/email';
import { urlDoSite } from '@/lib/env';
import { adminConfigurado, criarClienteAdmin } from '@/lib/supabase/admin';
import type { criarClienteServidor } from '@/lib/supabase/server';

type Cliente = Awaited<ReturnType<typeof criarClienteServidor>>;

/** Obra, empresa e quem está dando o acesso (lidos com a sessão de quem pede, pelo RLS). */
async function contexto(supabase: Cliente, projetoId: string) {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) return null;
  const { data: projeto } = await supabase
    .from('projeto')
    .select('nome, empresa_id, empresa:empresa_id (nome)')
    .eq('id', projetoId)
    .maybeSingle();
  if (!projeto) return null;
  return { usuario: user, projeto: projeto.nome, empresaId: projeto.empresa_id, empresa: projeto.empresa?.nome ?? null };
}

// Nome de obra e empresa vão para o modelo do Supabase: sem marcação, por garantia.
const semMarcacao = (texto: string) => texto.replace(/[<>]/g, '').slice(0, 120);

export type ResultadoConvite = { ok: true } | { ok: false; erro: string };

/**
 * Convida por e-mail quem ainda não tem conta. Só administrador da empresa traz gente nova
 * (é a mesma regra de `adicionar_membro_projeto`); depois disso o app chama a função de novo
 * e o banco confere tudo outra vez.
 */
export async function convidarParaObra(
  supabase: Cliente,
  projetoId: string,
  email: string,
  papel: PapelProjeto,
): Promise<ResultadoConvite> {
  const ctx = await contexto(supabase, projetoId);
  if (!ctx) return { ok: false, erro: 'Projeto não encontrado.' };

  const { data: vinculo } = await supabase
    .from('membro_empresa')
    .select('papel')
    .eq('empresa_id', ctx.empresaId)
    .eq('usuario_id', ctx.usuario.id)
    .maybeSingle();
  if (vinculo?.papel !== 'admin') {
    return { ok: false, erro: `Ainda não há conta com ${email}. Peça a um administrador da empresa para convidar a pessoa.` };
  }
  if (!adminConfigurado()) {
    return { ok: false, erro: `Ainda não há conta com ${email}. Peça para a pessoa criar a conta no app e tente de novo.` };
  }

  const { error } = await criarClienteAdmin().auth.admin.inviteUserByEmail(email, {
    redirectTo: `${urlDoSite()}/conta/senha?convite=1`,
    data: {
      convidado_por: ctx.usuario.email ?? '',
      projeto: semMarcacao(ctx.projeto),
      empresa: ctx.empresa ? semMarcacao(ctx.empresa) : '',
      papel: ROTULO_PAPEL_PROJETO[papel],
    },
  });
  // Conta criada por outra pessoa no meio do caminho: segue e deixa o banco decidir.
  if (error && error.code !== 'email_exists') {
    console.error('Convite não enviado:', error.code ?? error.message);
    if (error.code === 'over_email_send_rate_limit' || error.status === 429) {
      return { ok: false, erro: 'Muitos e-mails enviados na última hora. Espere um pouco e convide de novo.' };
    }
    return { ok: false, erro: 'Não foi possível enviar o convite agora. Tente de novo em alguns minutos.' };
  }
  return { ok: true };
}

/** Avisa por e-mail quem já tinha conta e ganhou acesso. O envio roda depois da resposta; falha não atrapalha. */
export async function avisarAcessoObra(supabase: Cliente, projetoId: string, email: string, papel: PapelProjeto) {
  if (!emailConfigurado()) return;
  const ctx = await contexto(supabase, projetoId);
  const quem = ctx?.usuario.email;
  if (!ctx || !quem || quem.toLowerCase() === email.toLowerCase()) return;
  const base = urlDoSite();
  const mensagem = emailAcessoObra({
    base,
    obra: ctx.projeto,
    empresa: ctx.empresa,
    papel: ROTULO_PAPEL_PROJETO[papel],
    oQueFaz: DESCRICAO_PAPEL_PROJETO[papel],
    quem,
    urlObra: `${base}/projetos/${projetoId}`,
  });
  after(() => enviarEmail({ para: email, ...mensagem, responderPara: quem }));
}
