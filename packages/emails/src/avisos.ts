import { html } from './html';
import { botao, forte, moldura, NOME_PRODUTO, paragrafo, quadro, reserva, textoPuro, titulo } from './moldura';

// E-mails que o próprio app envia (pela API da Resend), com dados da obra.

export type Email = { assunto: string; html: string; texto: string };

/** O que cada papel faz na obra, em uma linha (os mesmos papéis de `PAPEIS_PROJETO`). */
export const O_QUE_O_PAPEL_FAZ: Record<string, string> = {
  engenheiro: 'Planeja o cronograma, aponta o avanço, assina o diário e aprova medições.',
  mestre: 'Aponta o avanço das tarefas, faz a chamada da equipe e preenche o diário.',
  almoxarife: 'Dá entrada nas notas, registra as saídas para as tarefas e cuida das ferramentas.',
  financeiro: 'Acompanha orçado × realizado, lança despesas e controla medições e pagamentos.',
  leitura: 'Acompanha o cronograma, as fotos e o diário, sem alterar nada.',
};

export type AcessoObra = {
  /** Endereço do site, sem barra no fim. */
  base: string;
  obra: string;
  empresa?: string | null;
  /** Rótulo do papel ("Mestre de obras") e a chave dele ("mestre"). */
  papel: string;
  chavePapel: string;
  /** E-mail de quem deu o acesso. */
  quem: string;
  urlObra: string;
};

/** Aviso para quem já tinha conta e ganhou acesso a uma obra. */
export function emailAcessoObra(a: AcessoObra): Email {
  const faz = O_QUE_O_PAPEL_FAZ[a.chavePapel];
  const assunto = `Você agora acessa a obra ${a.obra}`;
  const conteudo = html`${titulo(html`A obra ${a.obra} está no seu painel`)}
${paragrafo(html`${forte(a.quem)} deu a você acesso à obra no ${NOME_PRODUTO}${a.empresa ? html`, da ${a.empresa}` : ''}.`)}
${quadro([
  ['Obra', a.obra],
  ['Seu papel', a.papel],
])}
${faz ? paragrafo(faz) : ''}
${botao('Abrir a obra', a.urlObra)}
${reserva(a.urlObra)}`;

  return {
    assunto,
    html: moldura({
      base: a.base,
      titulo: assunto,
      previa: `${a.quem} deu a você acesso como ${a.papel}.`,
      conteudo,
      motivo: html`Você recebeu este aviso porque ${a.quem} adicionou seu e-mail à obra. Para sair dela, fale com quem deu o acesso; é só responder este e-mail.`,
    }).valor,
    texto: textoPuro([
      `${a.quem} deu a você acesso à obra ${a.obra} no ${NOME_PRODUTO}${a.empresa ? `, da ${a.empresa}` : ''}.`,
      '',
      `Seu papel: ${a.papel}`,
      faz,
      '',
      `Abrir a obra: ${a.urlObra}`,
    ]),
  };
}
