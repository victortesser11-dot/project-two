# Pendências que dependem do Victor

Lista viva, atualizada a cada sprint. Nada aqui trava o desenvolvimento: o código segue e
cada item libera algo em produção ou um teste ao vivo. Marque `[x]` quando fizer.

## Para a equipe da obra usar a produção

- [ ] **Abrir a produção para quem não está no time da Vercel.** Hoje a proteção do projeto
      `controle-de-obras` está em "todos exceto domínios próprios": `controle-de-obras-vtesser.vercel.app`
      só abre para quem está logado na Vercel. Duas saídas:
      1. ligar um domínio próprio (ex.: `app.suaempresa.com.br`) em Settings → Domains; ou
      2. em Settings → Deployment Protection, deixar a proteção só nas prévias ("Standard Protection").
- [ ] **URLs de retorno do login no Supabase.** Authentication → URL Configuration:
      - Site URL: o endereço de produção;
      - Redirect URLs: o de produção + `https://controle-de-obras-*-vtesser.vercel.app/**` (prévias).
      Sem isso, o link de confirmação de cadastro por e-mail não volta para o app.
- [ ] **Proteção contra senhas vazadas** (recomendado): Authentication → Policies →
      "Leaked password protection" (plano Pro). Recusa senhas que aparecem no HaveIBeenPwned.

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

- [ ] Modelo exato da câmera Intelbras (e se a obra tem gravador NVR).
- [ ] Internet e energia na obra-piloto (fibra, 4G, rádio; tomada ou solar).
- [ ] Qual VPS usar (ou peça uma recomendação).
- [ ] Uma câmera na sua rede para testar o endereço de foto (`/cgi-bin/snapshot.cgi`) do modelo.

## Feito

- [x] Liberar o Supabase na rede do ambiente (31/10).
- [x] Trocar o install da Vercel para `pnpm install --frozen-lockfile` (31/10).
- [x] Aprovar e publicar sprints 1, 2 e 3 (31/10).
- [x] Migração do almoxarifado aplicada no Supabase (31/10).
