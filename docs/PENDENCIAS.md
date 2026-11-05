# Pendências que dependem do Victor

Lista viva, atualizada a cada sprint. Nada aqui trava o desenvolvimento: o código segue e
cada item libera algo em produção ou um teste ao vivo. Marque `[x]` quando fizer.

## Para a equipe da obra usar a produção

Endereço do piloto: **https://moda-triade.com.br** (domínio ligado na Vercel em 05/11; DNS no registro.br).

- [ ] **URLs de retorno do login no Supabase.** Authentication → URL Configuration:
      - Site URL: `https://moda-triade.com.br`;
      - Redirect URLs: `https://moda-triade.com.br/**`, `https://controle-de-obras-puce.vercel.app/**` e
        `https://controle-de-obras-*-vtesser.vercel.app/**` (prévias).
      Sem isso, os links dos e-mails (confirmar cadastro, convite, nova senha) não voltam para o app.
- [ ] **Proteção contra senhas vazadas** (recomendado): Authentication → Policies →
      "Leaked password protection" (plano Pro). Recusa senhas que aparecem no HaveIBeenPwned.

## Medição (03/11)

- [ ] **Um boletim de medição real** (o Excel que o engenheiro usa hoje), para o boletim impresso sair no formato que o
      cliente já conhece.
- [ ] **Decisões do contrato com o cliente**: preço com BDI ou a custo? Tem retenção (quanto)? Prazo de pagamento?
      O cliente (ou o fiscal dele) vai entrar na plataforma para aprovar a medição, ou só recebe o boletim impresso?
- [ ] **Pagamento de empreiteira vira despesa?** Hoje a medição da empreiteira registra o pagamento, mas não lança a
      despesa no realizado (para não contar duas vezes com quem já lança a despesa à mão). Diga como prefere.

## E-mails (05/11)

A conta da Resend e a chave já existem. O segredo `RESEND_API_KEY` no GitHub só chega ao GitHub Actions (nada usa hoje):
a Vercel e o Supabase precisam da chave nas configurações deles.

- [ ] **Verificar o domínio na Resend** (sem isso ela só entrega no e-mail do dono da conta): Resend → Domains → Add
      domain → `moda-triade.com.br`, região **São Paulo (sa-east-1)**. Ela mostra 3 ou 4 registros (DKIM em
      `resend._domainkey`, MX e TXT/SPF em `send`); crie cada um no registro.br → o domínio → DNS → "Editar zona".
      Eles não mexem no site nem no e-mail que o domínio já tenha. Volte na Resend e clique "Verify" (leva de minutos
      a algumas horas).
- [ ] **SMTP no Supabase** (Authentication → Emails → SMTP Settings → Enable custom SMTP): host `smtp.resend.com`,
      porta `465`, usuário `resend`, senha = a chave da Resend; remetente `nao-responda@moda-triade.com.br`, nome
      "Controle de Obras". Sem isso o Supabase manda poucos e-mails por hora e só para o time do projeto.
- [ ] **Modelos no Supabase**: Authentication → Emails → Templates. Assunto e arquivo de cada aba em
      `supabase/templates/README.md` (cole o arquivo inteiro).
- [ ] **Site URL** = `https://moda-triade.com.br` (item "URLs de retorno" acima): os links dos e-mails e o logo saem dele.
- [ ] **Variáveis na Vercel** (Settings → Environment Variables, Production e Preview), depois "Redeploy":
      - `RESEND_API_KEY` = a mesma chave;
      - `EMAIL_REMETENTE` = `Controle de Obras <avisos@moda-triade.com.br>`;
      - `SUPABASE_SECRET_KEY` = Supabase → Project Settings → API Keys → Secret key (`sb_secret_...`). Só serve para
        mandar o convite de quem ainda não tem conta; sem ela, a pessoa precisa criar a conta antes.

## Alertas (05/11)

- [ ] **Resumo diário de alertas por e-mail**: depois dos e-mails acima, eu monto o envio agendado.
- [ ] **WhatsApp** (opcional, depois): exige conta comercial na Meta (WhatsApp Business Platform) em nome da empresa.
- [ ] Confirmar com o engenheiro os gatilhos: 25 pontos abaixo do ritmo, chuva ≥ 5 mm em 3 dias, material para menos de
      7 dias, medição em rascunho há mais de 5 dias.

## Para eu testar com dados reais

- [ ] **Conta de teste** como variáveis de ambiente `OBRAS_TESTE_EMAIL` e `OBRAS_TESTE_SENHA`
      (menu do ambiente → Edit → variáveis). Vale numa sessão nova. De preferência uma conta com uma
      obra e uma EAP de exemplo. Com ela eu capturo as telas logado e passo os fluxos de ponta a ponta.
- [ ] **Liberar na rede do ambiente** (Network access → Allowed domains), para testar as integrações
      ao vivo daqui: `brasilapi.com.br`, `api.open-meteo.com`, `archive-api.open-meteo.com`.
      Em produção (Vercel) elas já funcionam; hoje testo com respostas de exemplo.

## Login com Google (ficou para depois)

- [ ] Ativar o provedor Google no Supabase (Authentication → Providers → Google) com o Client ID e o
      segredo de um app OAuth do Google Cloud.
- [ ] No Google Cloud, cadastrar como "Authorized redirect URI" o callback do Supabase
      (`https://bxsaaabxbzlddpahdrto.supabase.co/auth/v1/callback`).
- [ ] As URLs de retorno das prévias (item do Supabase acima) valem também para o Google.

## Decisões de produto

- [ ] **Equipe mista** (própria + empreiteiras, custo por hora, diária ou produção): assumi isso no
      sprint 3. Se a equipe for só própria ou só de empreiteira, nada quebra; só sobra opção na tela.
- [ ] **Dias corridos ou dias úteis no cronograma?** Hoje é corrido. Com os feriados da BrasilAPI já
      no sistema, dá para passar a dias úteis (seg–sex ou seg–sáb) quando você quiser.
- [ ] **Diária rateada pelas horas** entre as tarefas do dia (6 h + 2 h de uma diária de R$ 180 =
      R$ 135 + R$ 45). Confirme se é assim que a obra apropria.
- [ ] **NF-e pela chave de acesso** (sem o XML): precisa de um serviço pago de consulta ou do
      certificado digital A1 da empresa. A leitura do **XML** já funciona (sprint 4) sem nada disso.
- [ ] **Quem vê preço de material?** Hoje, todos que veem a obra (inclusive mestre e "leitura") veem
      valores no almoxarifado; o custo de mão de obra continua só para engenheiro, financeiro e admin.
      Se quiser esconder os preços de material também, é uma regra no banco.
- [ ] **Estoque mínimo**: hoje é um número por item, que vale para cada obra. Se obras de tamanhos
      muito diferentes precisarem de mínimos diferentes, dá para ter o mínimo por obra.
- [ ] **Custo da NF-e**: lancei o custo da linha com frete, seguro, IPI e ICMS-ST, menos desconto
      (a construtora em geral não aproveita crédito de ICMS). Confirme com a contabilidade.
- [ ] **Regras do semáforo** (portfólio): comecei com amarelo a partir de 7 dias de atraso ou 5% de custo
      acima do que o serviço feito vale, e vermelho com 30 dias ou 10%. O admin muda na tela inicial.
- [ ] **Despesa e contrato sempre numa tarefa**: custo de administração da obra (vigia, água, luz) vai para uma
      tarefa "Administração local" na EAP. Confirme se é assim que vocês apropriam.
- [ ] Perguntas em aberto do PRD: produto interno ou SaaS; obra-piloto; de onde vem o orçamento hoje
      (planilha, OrçaFascio, Sienge…); integrar com ERP no MVP ou só exportar planilha.

## Almoxarifado (sprint 4)

- [ ] **Um XML de NF-e real** de um fornecedor da obra (pode mandar por aqui). Testei a leitura com uma
      nota de exemplo no layout 4.00; uma real confirma os campos do seu fornecedor.
- [ ] **Etiquetas**: papel adesivo A4 (tipo Pimaco, 3 colunas) serve; se preferir impressora térmica de
      etiquetas, me diga o modelo e o tamanho para eu ajustar a página de impressão.
- [ ] O leitor de QR dentro do app usa a câmera pelo navegador (Chrome no Android funciona; no iPhone,
      a câmera nativa abre o link da etiqueta direto). Teste num celular da obra quando puder.

## Câmeras (sprint 5)

Decidido (31/10): câmeras Intelbras, ligadas direto ou por um NVR. A foto chega por um **agente
na obra** (programa num computador da rede da obra) que pede a foto pela rede local e envia por
HTTPS. **Não precisa abrir porta** no roteador, e a câmera não fica exposta na internet. Sem VPS
por enquanto: a nuvem é o Supabase que já usamos.

- [ ] **Computador para o agente na obra-piloto**, ligado 24 h na mesma rede das câmeras:
      Raspberry Pi 4/5 (com fonte e cartão de 32 GB), mini PC ou o PC do escritório da obra.
      Nobreak ajuda (a câmera e o roteador também precisam).
- [ ] **Endereço local de cada câmera ou do NVR** (ex.: `192.168.1.108`) e, no NVR, o número do
      canal de cada câmera.
- [ ] **Usuário só de visualização** criado na câmera/NVR para a plataforma (não use o admin).
- [ ] Modelo exato quando comprar/instalar, para eu conferir o endereço de foto do modelo
      (`/cgi-bin/snapshot.cgi`) e o RTSP.
- [ ] Energia na obra-piloto (tomada fixa ou solar) e onde fixar: alta, fixa, mesma posição a obra toda.
- [ ] Aviso de câmera na obra (LGPD): placa "ambiente monitorado por câmeras".

## Feito

- [x] Liberar o Supabase na rede do ambiente (31/10).
- [x] Trocar o install da Vercel para `pnpm install --frozen-lockfile` (31/10).
- [x] Aprovar e publicar sprints 1, 2 e 3 (31/10).
- [x] Migração do almoxarifado aplicada no Supabase e sprint 4 publicado (31/10).
- [x] Câmeras: Intelbras, link dedicado, sem VPS por enquanto; agente na obra em vez de abrir portas (31/10).
- [x] Migrações `cameras` e `orcamento` e a função `agente-cameras` publicadas no Supabase pelo SQL Editor (01/11).
- [x] Revisão geral publicada: migração `revisao` no SQL Editor e função `agente-cameras` atualizada (01/11).
- [x] Obra de exemplo publicada: migração `obra_exemplo` no SQL Editor e app em produção (02/11).
- [x] Modelo de cronograma "Residência unifamiliar" (documento da engenharia) publicado no importador da EAP (03/11).
- [x] Medição publicada: migração `medicao` no SQL Editor (com a correção da obra de exemplo) e app em produção (05/11).
- [x] Alertas publicados: migrações `justificativa_atraso` e `revoga_padrao_supabase` no SQL Editor (05/11).
- [x] Conta da Resend e chave de API criadas (05/11).
- [x] Domínio próprio na produção (`moda-triade.com.br`): a equipe da obra entra sem conta na Vercel (05/11).
