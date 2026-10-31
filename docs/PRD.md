> Documento vivo: https://claude.ai/artifact/3uY9y6BRrimuezDunTcBid (fonte da verdade).
> Esta cópia é exportada para o Claude Code ler o contexto. Os diagramas ficam só no documento.

# PRD — Plataforma de Controle de Obras

Oct 30, 2026 · @Victor

## Resumo executivo

Vamos construir uma plataforma que une, num só lugar, o que a obra **mostra** (foto diária das câmeras), o que ela **consome** (materiais, ferramentas e equipe) e o que ela **custa** (orçamento e fiscal), para que o engenheiro saiba todo dia se está no prazo e no orçamento.

**Problema.** Hoje o engenheiro descobre atrasos e estouros tarde: o cronograma vive numa planilha ou no MS Project, o almoxarifado num caderno ou ERP, a equipe no grupo de WhatsApp, e o avanço físico só é visto quando alguém vai à obra. Nenhuma dessas fontes conversa com as outras.

**Proposta.** Um app web + mobile com cinco módulos integrados: (1) câmeras com snapshot diário e linha do tempo visual; (2) almoxarifado de materiais e ferramentas; (3) tarefas e cronograma; (4) equipe de campo (quem trabalhou, onde, quantas horas); (5) orçamento e planejamento físico-financeiro e fiscal; mais um painel com alertas. Tudo amarrado a uma mesma EAP (estrutura analítica do projeto), de modo que cada tarefa saiba quanto material, quantas pessoas e quanto dinheiro consome.

**Diferencial.** As ferramentas de fora resolvem bem uma fatia cada (câmera, ferramentas, tarefas ou custos) e cobram em dólar. Nosso foco é a obra de pequeno e médio porte, com uma IA que lê a foto do dia e compara com o planejado, e um painel único de prazo × custo × consumo.

## Pesquisa de mercado internacional

O mercado lá fora é maduro, mas fatiado: cada produto resolve bem uma parte (câmera, ferramenta, tarefa, ponto ou custo) e quem junta tudo (Procore) cobra de cinco a seis dígitos em dólar por ano. Preços em USD; onde o fornecedor não publica, o valor é estimativa de terceiros.

| Categoria | Produto | O que faz bem | Preço | O que falta para o nosso caso |
| --- | --- | --- | --- | --- |
| Câmera e time-lapse | [TrueLook](https://www.truelook.com/features/construction-time-lapse) | Time-lapse diário, sobrepõe duas fotos para ver a mudança; IA conta pessoas, veículos e EPI ([TrueAI](https://www.truelook.com/trueai)) | \~99–199/mês por câmera ([estimativa](https://timelapse-portal-ci2.pages.dev/blog/best-construction-timelapse-cameras-canada-2026-buyers-guide)) | Não sabe o que estava planejado para o dia |
| Câmera e time-lapse | [OxBlue](https://www.oxblue.com/get-a-quote) (Hexagon) | Serviço gerenciado, 51 mil obras; time-lapse do dia/semana/mês com um clique; [IA de atividade e equipamentos](https://www.oxblue.com/solutions/project-analytics) | Sob cotação, paga por dia transmitido ([preços](https://oxblue.com/pricing)) | Idem; hardware próprio |
| Câmera e time-lapse | [EarthCam](https://www.sourceforge.net/software/product/EarthCam) | Pioneira (1996), 4K, 360°, IA de equipamentos e proximidade | \~300–600+/mês ([estimativa](https://timelapse-portal-ci2.pages.dev/blog/best-construction-timelapse-cameras-canada-2026-buyers-guide)) | Foco enterprise e marketing |
| Câmera e time-lapse | [Sensera](https://senserasystems.com/product-fixed-position-cameras) | IA compara fotos semana a semana e escreve um resumo do que mudou; busca objetos nas imagens | Sob cotação | Resumo solto, sem vínculo com tarefas e custo |
| IA de progresso | [OpenSpace](https://b2bsalestools-com.pages.dev/tools/openspace/) | Caminhada com câmera 360° localizada na planta | Contato comercial | Exige caminhada; enterprise |
| IA de progresso | [Buildots](https://b2bsalestools-com.pages.dev/tools/buildots/) | 360° no capacete, progresso × cronograma + inteligência de mão de obra | Contato comercial | Grandes construtoras (Turner, Intel) |
| IA de progresso | [Doxel](https://b2bsalestools-com.pages.dev/tools/doxel/) | % concluído por visão computacional contra a linha de base | Contato comercial | Idem; depende de BIM |
| Ferramentas e ativos | [Hilti ON!Track](https://www.getapp.ca/software/111465/on-track-asset-management) | Ativos, manutenção, custo por obra; tags e gateways | Modular (software + hardware + serviço) | Amarrado ao ecossistema Hilti |
| Ferramentas e ativos | [ShareMyToolbox](https://www.sharemytoolbox.com/compare/sharemytoolbox-vs-hilti-ontrack-which-tool-tracking-system-fits-best/) | Pequenas ferramentas, mobile, empréstimo entre equipes | Assinatura | Só ferramentas |
| Ferramentas e materiais | [Align / ToolWatch](https://www.softwareadvice.com.au/compare/70085/70101/ontrack/vs/toolwatch-enterprise) | Ferramentas, equipamentos e materiais entre obras e depósito; inclui ponto (busybusy) | Sob cotação | Pesado de implantar |
| Materiais e compras | [Kojo](https://research.contrary.com/company/kojo) | Cotação, pedido de campo pelo celular, almoxarifado, ferramentas, conferência de nota | Sob cotação | Focado em subempreiteiros dos EUA |
| Tarefas e campo | [Fieldwire](https://www.fieldwire.com/au/pricing/) (Hilti) | Plantas, tarefas, checklists, punch list | Grátis até 5 usuários; 39–89/usuário/mês ([Capterra](https://www.capterra.com/p/142801/Fieldwire/pricing/)) | Sem orçamento nem almoxarifado |
| Diário de obra | [Raken](https://erpresearch.com/erp-add-ons/construction/raken) | Diário de obra, cartão de ponto, produção, segurança | Por usuário, sob cotação | [Sem orçamento nem cronograma](https://www.ingenious.build/blog-posts/raken-construction-software-alternatives) |
| Equipe | [busybusy](https://us.fitgap.com/products/012484/busybusy) | Ponto com GPS, custo por obra; plano grátis com usuários ilimitados | 0 a \~10/usuário/mês | Só mão de obra |
| Equipe | [Bridgit Bench](https://constructionjunkie.com/blog/2020/10/13/bridgit-bench-helps-you-optimize-construction-workforce-management-in-the-cloud) | Alocação de pessoas por obra, visão de 12 meses à frente | Sob cotação | Médias e grandes construtoras |
| Plataforma completa | [Procore](https://erpresearch.com/erp-add-ons/construction/procore/pricing) | Tudo, usuários ilimitados, cobra por volume anual de obra | \~4,5 mil a 200 mil+/ano ([estimativa](https://www.technbrains.com/construction-software-development/procore-alternatives/)) | Caro, longo de implantar |
| Plataforma completa | [Buildertrend](https://costbench.com/software/construction-management/buildertrend/) | Residencial: cronograma, orçamento, portal do cliente | \~339–829/mês (estimativa) | Orçamento só nos planos maiores |

**Lacunas que encontramos**

- **Nada conversa com nada.** As ferramentas de IA de progresso [não compartilham um modelo de dados](https://theneuralbase.com/ai-for-real-estate/learn/advanced/tools-buildots-doxel-openspace/); câmeras integram via Procore/Autodesk, que são a parte cara.
- **IA de progresso séria é enterprise.** Buildots, Doxel e OpenSpace exigem caminhada 360° ou BIM e vendem para grandes construtoras. A câmera fixa barata com IA (Sensera, TrueAI) só descreve a cena; não compara com a tarefa planejada.
- **Cobrança punitiva para obra pequena.** Por usuário (Fieldwire, Raken) ou por volume de obra (Procore), sempre em dólar.
- **Nenhum produto pesquisado trata a realidade brasileira**: NF-e de entrada, INSS da obra (CNO), cronograma físico-financeiro e equipes de empreiteiros informais.

## Oportunidade e posicionamento

A aposta: **câmera fixa barata + IA que lê a foto do dia contra as tarefas planejadas + almoxarifado e equipe na mesma base de dados**. É o que Buildots e Doxel fazem para grandes construtoras, montado com o hardware que tivermos (ex.: câmeras Intelbras) e encaixes sob medida.

**Para quem:** construtoras e incorporadoras de pequeno e médio porte (1 a 15 obras simultâneas), engenheiros residentes e gestores de obra de empresas que constroem para si (ex.: institutos, indústrias, redes de varejo).

**O que construímos que eles não têm juntos:**

1. **Foto do dia × tarefa do dia.** A IA recebe o snapshot e a lista de tarefas previstas e responde: o que avançou, o que não aparece, quantas pessoas e máquinas estavam na área.
2. **Consumo amarrado à EAP.** Cada saída do almoxarifado e cada hora de equipe cai numa tarefa, então o custo real aparece por etapa, não só no fim do mês.
3. **Prazo × custo num painel só.** Curva S física e financeira lado a lado, com alerta quando uma diverge da outra.
4. **Feito para o Brasil.** Importação de NF-e de entrada, cronograma físico-financeiro, apontamento de empreiteiro por diária ou produção, WhatsApp como canal de aviso.

**Modelo de preço sugerido:** por obra ativa por mês, usuários ilimitados, câmera opcional (cliente compra a própria ou aluga conosco). Evita a dor de pagar por usuário que a pesquisa apontou.

## Personas e jobs-to-be-done

| Persona | Onde trabalha | O que precisa resolver | Como usa o produto |
| --- | --- | --- | --- |
| **Engenheiro(a) residente** | Na obra, celular e notebook | Saber hoje o que atrasou, quem veio, o que falta de material para amanhã | Cria o projeto, lança orçamento e movimentos de material, ajusta o cronograma, confere a leitura da IA |
| **Gestor(a) de obras / diretor técnico** | Escritório, várias obras | Ver todas as obras num relance: prazo, custo, risco | Portfólio, curva S, alertas, time-lapse semanal |
| **Mestre de obras / encarregado** | Campo, só celular, às vezes sem sinal | Registrar quem trabalhou, o que fez, pedir material | App offline: chamada da equipe, tarefas do dia, pedido ao almoxarifado |
| **Almoxarife** | Container da obra ou depósito central | Controlar entrada (NF), saída por tarefa, empréstimo de ferramenta | Opcional: em obras sem almoxarife, o engenheiro faz esses lançamentos |
| **Financeiro / controladoria** | Escritório | Orçado × realizado, medições, obrigações fiscais da obra | Relatórios por centro de custo, exportação para ERP |
| **Cliente / investidor** (leitura) | Remoto | Confiança de que a obra anda | Link com time-lapse e % concluído |

**Jobs principais**

- Quando chego à obra de manhã, quero ver o que mudou ontem e o que está previsto hoje, para distribuir a equipe sem reunião longa.
- Quando uma etapa atrasa, quero saber se foi falta de gente, de material ou de ferramenta, para atacar a causa certa.
- Quando fecho o mês, quero o custo real por etapa sem montar planilha, para saber se a margem se mantém.
- Quando uma ferramenta some, quero saber com quem ela estava por último.

## Estrutura da plataforma: tudo dentro do projeto

O engenheiro cria um **projeto** para cada obra, e é dentro dele que vivem o cronograma, as câmeras, o almoxarifado, a equipe, o orçamento e o diário. Acima dos projetos fica só o que é da empresa (usuários, catálogo, fornecedores) e o portfólio que compara todos.

&#91;embedded content: estrutura · empresa, projeto e 7 módulos\]

O engenheiro é quem lança orçamento e materiais; mestre e almoxarife entram como usuários opcionais do mesmo projeto.

**Fluxo de criação de um projeto**

1. Dados básicos: nome, endereço, datas, orçamento total, responsável.
2. EAP e cronograma: montar na tela, importar planilha ou MS Project, ou partir de um modelo da empresa.
3. Orçamento por etapa: digitar ou importar planilha.
4. Câmeras: cadastrar cada câmera fixa (ou body cam), testar a foto, definir horários e desenhar as zonas ligadas às tarefas.
5. Almoxarifado: saldo inicial de materiais e ferramentas do projeto.
6. Equipe: pessoas e empreiteiras que vão trabalhar ali.
7. Convites: quem mais acessa o projeto e com qual papel.

A navegação segue a mesma lógica: ao abrir um projeto, as abas são Painel, Cronograma, Câmeras, Almoxarifado, Equipe, Orçamento e Diário.

## Escopo dos módulos

Seis módulos sobre uma base comum: **Obra → EAP (etapas e tarefas) → recursos (pessoas, materiais, ferramentas, dinheiro)**. Tudo que acontece na obra aponta para uma tarefa da EAP; é isso que permite cruzar prazo, consumo e custo.

| Módulo | MVP (fase 1) | Fase 2 | Fase 3 |
| --- | --- | --- | --- |
| **0. Base (obras, EAP, usuários)** | Cadastro de obra, EAP em árvore, importação de orçamento e cronograma por planilha (CSV/XLSX) e MS Project (XML), papéis e permissões | Modelos de EAP reutilizáveis, multiempresa | Importação de Primavera P6 e IFC/BIM |
| **1. Câmeras e snapshots** | Cadastro de câmeras, captura agendada (1 a 4 fotos/dia), galeria por data, comparação lado a lado e sobreposição, time-lapse semanal gerado | **IA diária**: resumo do que mudou, contagem de pessoas e máquinas, vínculo com tarefas previstas | Zonas desenhadas na imagem por frente de serviço, % estimado por zona, alerta de segurança (EPI) |
| **2. Tarefas e cronograma** | Gantt com dependências, linha de base, % físico por tarefa, quadro "tarefas de hoje" para o mestre, diário de obra (clima, ocorrências, fotos) | Planejamento de curto prazo (lookahead de 2 a 6 semanas, estilo Last Planner), restrições por tarefa | Replanejamento sugerido pela IA |
| **3. Equipe de campo** | Cadastro de pessoas e empreiteiros, chamada diária (presença por tarefa), horas e diárias, custo de mão de obra por tarefa | Ponto com GPS/geocerca e foto, produtividade (quantidade feita / homem-hora), documentos e treinamentos (NRs, ASO) com vencimento | Previsão de equipe necessária nas próximas semanas |
| **4. Almoxarifado (materiais e ferramentas)** | Catálogo de itens, entradas, saídas por tarefa, saldo por obra, estoque mínimo, ferramentas com QR code (empréstimo e devolução com responsável) | Recebimento por chave/XML da NF-e, transferência entre obras, inventário cíclico, requisição de compra | Previsão de consumo a partir do cronograma; integração com ERP de compras |
| **5. Orçamento e planejamento físico-financeiro e fiscal** | Orçamento por etapa (composição tipo SINAPI ou própria), cronograma físico-financeiro, orçado × comprometido × realizado, curva S física e financeira | Medições de empreiteiros, fluxo de caixa projetado, impostos e encargos da obra (CNO, INSS da obra, retenções em notas de serviço) | Valor agregado (EVM: IDP, IDC), projeção de custo final |
| **6. Painel e alertas** | Painel da obra (prazo, custo, equipe hoje, última foto), portfólio de obras | Alertas por e-mail e WhatsApp (atraso, estoque mínimo, ferramenta não devolvida, desvio de custo) | Relatório semanal gerado pela IA para cliente/diretoria |

**Fora do escopo do MVP:** caminhada 360°, drones, BIM, folha de pagamento, emissão de notas, contabilidade. A plataforma exporta dados para o ERP em vez de substituí-lo.

**Sobre "fiscal":** confirmado que são os dois: cronograma físico-financeiro (MVP) e obrigações fiscais próprias da obra (fase 2).

## Requisitos funcionais

Requisitos do MVP e da fase 2, numerados para virarem issues no GitHub. Cada um tem a história de usuário e o critério que o teste automatizado deve verificar.

### 0. Base

| ID | História | Critério de aceite | Fase |
| --- | --- | --- | --- |
| RF-001 | Como gestor, quero cadastrar uma obra com endereço, datas, orçamento total e responsável | Obra criada aparece no portfólio; datas e valor validados (fim ≥ início, valor > 0) | 1 |
| RF-002 | Como engenheiro, quero montar a EAP em árvore (etapa → subetapa → tarefa) | Arrastar para reordenar; até 6 níveis; código hierárquico automático (1.2.3) | 1 |
| RF-003 | Como engenheiro, quero importar orçamento e cronograma de planilha ou MS Project XML | Pré-visualização com mapeamento de colunas; erros por linha; nada é gravado até confirmar | 1 |
| RF-004 | Como admin, quero convidar usuários com papel por obra (admin, engenheiro, mestre, almoxarife, financeiro, leitura) | Usuário só vê obras em que tem papel; ações negadas retornam 403 e ficam no log | 1 |

### 1. Câmeras e snapshots

| ID | História | Critério de aceite | Fase |
| --- | --- | --- | --- |
| RF-101 | Como admin, quero cadastrar uma câmera por URL de snapshot (HTTP/ONVIF), envio por FTP ou upload manual | Teste de conexão mostra a foto antes de salvar; credenciais guardadas cifradas | 1 |
| RF-102 | Como engenheiro, quero definir horários de captura (ex.: 7h, 12h, 17h) | Snapshot salvo com data, hora e câmera; falha de captura gera alerta após 2 tentativas | 1 |
| RF-103 | Como engenheiro, quero ver a galeria por calendário e comparar dois dias lado a lado ou sobrepostos | Seletor de datas; controle deslizante de sobreposição; zoom sincronizado | 1 |
| RF-104 | Como gestor, quero um time-lapse semanal e um da obra inteira | Vídeo MP4 gerado automaticamente no domingo; link compartilhável com expiração | 1 |
| RF-105 | Como engenheiro, quero que a IA descreva o que mudou desde ontem e compare com as tarefas previstas para a área da câmera | Texto com: avanços vistos, tarefas previstas sem evidência, contagem de pessoas e máquinas; engenheiro confirma ou corrige cada item | 2 |
| RF-106 | Como engenheiro, quero vincular uma câmera a tarefas e zonas da imagem | Polígonos desenhados na foto, cada um ligado a tarefas da EAP | 2 |

### 2. Tarefas e cronograma

| ID | História | Critério de aceite | Fase |
| --- | --- | --- | --- |
| RF-201 | Como engenheiro, quero um Gantt com dependências (TI, II, TT) e linha de base | Mudar uma data recalcula sucessoras; linha de base fica congelada e visível | 1 |
| RF-202 | Como mestre, quero ver no celular as tarefas de hoje e marcar o avanço (%) ou a quantidade feita | Funciona offline; sincroniza ao voltar o sinal sem perder dados | 1 |
| RF-203 | Como engenheiro, quero preencher o diário de obra (clima, equipe, ocorrências, fotos) | Clima puxado automaticamente; equipe vem da chamada; gera PDF assinado | 1 |
| RF-204 | Como engenheiro, quero um lookahead de 2 a 6 semanas com restrições (material, equipe, projeto) | Tarefa com restrição aberta não pode ir para "pronta para executar" | 2 |

### 3. Equipe de campo

| ID | História | Critério de aceite | Fase |
| --- | --- | --- | --- |
| RF-301 | Como admin, quero cadastrar trabalhadores, funções, empreiteiras e custo (hora, diária ou produção) | CPF validado e mascarado na tela; histórico de custo com vigência | 1 |
| RF-302 | Como mestre, quero fazer a chamada do dia e alocar cada pessoa a uma tarefa | Chamada em menos de 2 minutos para 30 pessoas; permite dividir o dia entre tarefas | 1 |
| RF-303 | Como engenheiro, quero o custo de mão de obra por tarefa e por dia | Soma horas × custo vigente; bate com a chamada | 1 |
| RF-304 | Como encarregado, quero que o trabalhador registre ponto com geocerca e foto | Registro fora da geocerca fica marcado para revisão | 2 |
| RF-305 | Como segurança do trabalho, quero alertas de NR, ASO e treinamentos vencendo | Aviso 30 dias antes; pessoa com documento vencido aparece em vermelho na chamada | 2 |

### 4. Almoxarifado

| ID | História | Critério de aceite | Fase |
| --- | --- | --- | --- |
| RF-401 | Como almoxarife, quero cadastrar materiais (unidade, categoria, estoque mínimo) e ferramentas (patrimônio, QR code) | Etiqueta QR impressa em PDF; código único por empresa | 1 |
| RF-402 | Como almoxarife, quero registrar entradas com fornecedor, nota e valor | Saldo e custo médio atualizados na hora | 1 |
| RF-403 | Como almoxarife, quero registrar saídas para uma tarefa e um responsável | Saída sem tarefa é bloqueada; saldo negativo é bloqueado | 1 |
| RF-404 | Como almoxarife, quero emprestar e receber ferramentas lendo o QR | Mostra com quem está cada ferramenta e há quantos dias; alerta após prazo | 1 |
| RF-405 | Como engenheiro, quero alerta de estoque mínimo considerando o consumo previsto no cronograma | Alerta quando o saldo não cobre as próximas N semanas de tarefas | 2 |
| RF-406 | Como almoxarife, quero dar entrada lendo a chave ou o XML da NF-e | Itens da nota pré-casados com o catálogo; divergências destacadas | 2 |

### 5. Orçamento, físico-financeiro e fiscal

| ID | História | Critério de aceite | Fase |
| --- | --- | --- | --- |
| RF-501 | Como engenheiro, quero o orçamento por etapa com custo de material, mão de obra e equipamento | Totais sobem na árvore da EAP; versões de orçamento com data | 1 |
| RF-502 | Como gestor, quero o cronograma físico-financeiro mensal | Distribui o custo de cada tarefa pelos meses de execução; exporta XLSX | 1 |
| RF-503 | Como gestor, quero orçado × comprometido × realizado por etapa | Realizado = saídas do almoxarifado + mão de obra apontada + despesas lançadas | 1 |
| RF-504 | Como gestor, quero a curva S física e financeira planejada × real | Gráfico com as duas curvas e a linha de base | 1 |
| RF-505 | Como financeiro, quero lançar medições de empreiteiros e retenções | Medição vinculada a tarefas e % medido; retenções calculadas por regra configurável | 2 |
| RF-506 | Como financeiro, quero o fluxo de caixa projetado da obra | Projeção mensal a partir do cronograma e dos compromissos | 2 |
| RF-507 | Como financeiro, quero controlar dados fiscais da obra (CNO, CEI, regime, notas de serviço com retenção) | Cadastro por obra; relatório mensal das retenções; regras validadas com contador antes de liberar | 2 |

### 6. Painel e alertas

| ID | História | Critério de aceite | Fase |
| --- | --- | --- | --- |
| RF-601 | Como engenheiro, quero o painel da obra: % físico × previsto, custo × orçado, equipe hoje, última foto | Carrega em menos de 2 s; dados de no máximo 5 min atrás | 1 |
| RF-602 | Como diretor, quero o portfólio com semáforo por obra | Verde, amarelo ou vermelho por regras de desvio configuráveis | 1 |
| RF-603 | Como usuário, quero escolher que alertas recebo e por qual canal (app, e-mail, WhatsApp) | Preferência por tipo de alerta; resumo diário opcional | 2 |
| RF-604 | Como gestor, quero um relatório semanal escrito pela IA com fotos | Rascunho revisável antes de enviar; cita os números do período | 2 |

## Requisitos não funcionais

| Tema | Requisito |
| --- | --- |
| Offline no campo | App do mestre e do almoxarife funciona sem sinal por até 3 dias; fila local com sincronização e resolução de conflito (última edição vence, com histórico) |
| Desempenho | Telas principais em até 2 s em 4G; Gantt fluido até 2.000 tarefas |
| Armazenamento de imagens | Original em armazenamento de objetos; miniatura e versão web geradas no upload; retenção configurável (padrão: obra inteira + 5 anos) |
| Custo de IA | Análise diária limitada a 1 a 3 imagens por câmera; orçamento mensal de IA por obra com corte automático |
| Segurança | Isolamento por empresa no banco (row-level security); credenciais de câmera cifradas; SSO Google e Microsoft; MFA para admin |
| LGPD | CPF e fotos de trabalhadores são dados pessoais: base legal registrada, aviso de câmera na obra, desfoque opcional de rostos no time-lapse público, exportação e exclusão por titular |
| Auditoria | Toda alteração de estoque, custo, cronograma e medição fica em log imutável (quem, quando, antes e depois) |
| Disponibilidade | 99,5% mensal; backup diário com teste de restauração mensal |
| Acessibilidade e idioma | Português do Brasil; WCAG 2.1 AA nas telas web; botões grandes no app de campo (uso com luva e sol) |
| Integrações | API REST documentada (OpenAPI) e webhooks para ERP, BI e WhatsApp |

## Implantação: hardware, hospedagem e IA

Não é produto de prateleira: vamos montar a solução com o hardware e os serviços que tivermos e fazer os encaixes. A regra é manter cada peça trocável: câmera, hospedagem e modelo de IA mudam por configuração, não por reescrita.

### Câmeras Intelbras

- As câmeras IP Intelbras costumam oferecer foto instantânea por HTTP (`/cgi-bin/snapshot.cgi`), vídeo RTSP (`/cam/realmonitor`) e ONVIF. Esses endereços vêm de bases colaborativas e variam por modelo ([iSpyConnect](https://www.Ispyconnect.com/camera/intelbras), [Camlytics](https://camlytics.com/camera/intelbras/2)); testar o modelo escolhido em bancada na Fase 0.
- Preferir as linhas IP profissionais (que expõem snapshot e RTSP na rede local) a câmeras domésticas que só funcionam pelo app da marca.
- Instalação: alta, fixa e sempre na mesma posição durante a obra inteira; a comparação diária e o time-lapse dependem disso. Uma câmera por frente de serviço relevante.
- Kit por obra: câmera(s), roteador 4G ou fibra, nobreak (ou energia solar), caixa hermética e, de preferência, o agente local.

**Fixas primeiro, body cam depois.** Câmeras fixas são o padrão do MVP pelo custo menor. Body cams ou câmeras de capacete podem entrar depois como mais uma fonte: o vídeo sobe no fim do dia, a plataforma extrai quadros e eles passam pela mesma análise. O modelo de dados já guarda a origem de cada imagem para isso.

### Como a foto chega à plataforma

| Modo | Como funciona | Quando usar |
| --- | --- | --- |
| **A. Agente local (padrão recomendado)** | Mini PC ou Raspberry na rede da obra pede o snapshot HTTP ou extrai um quadro do RTSP e envia por HTTPS; guarda fila se a internet cair | 4G, várias câmeras, NVR já instalado, modelos diferentes |
| **B. Câmera envia sozinha** | Câmera configurada para mandar JPEG por FTP/SFTP para a VPS nos horários definidos | Obra pequena, internet estável, modelo com FTP agendado |
| **C. VPN** | WireGuard ou Tailscale entre o roteador da obra e a VPS; a VPS busca a foto direto | Roteador da obra já suporta VPN |

A nuvem não consegue chamar uma câmera que está atrás de 4G (CGNAT) sem VPN ou agente. Por isso a captura não pode depender só da Vercel, e a câmera nunca deve ficar exposta direto na internet.

### Hospedagem

| Parte | Onde | Por quê |
| --- | --- | --- |
| Dashboard web e app de campo | Vercel | Deploy a cada PR, CDN, custo baixo no início |
| Banco, login e imagens | Supabase gerenciado (ou Postgres na VPS) | Row-level security e backups prontos |
| Recebimento das fotos (endpoint do agente, FTP), FFmpeg, jobs de captura e de IA | VPS com Docker | A Vercel não recebe FTP nem roda processos longos; time-lapse precisa de CPU |

Alternativa: tudo na VPS com Docker Compose. Sai mais barato, mas a equipe passa a cuidar de backup, atualização e segurança. Decidir no fim da Fase 0.

### IA plugável

- **Uma interface, vários provedores.** O código chama `analisarFoto(fotoHoje, fotoOntem, tarefasPrevistas)` e recebe sempre o mesmo JSON. Gemini Flash, Claude ou outro modelo são configuração por obra.
- **Roteamento.** Modelo rápido e barato (família Gemini Flash) na rotina diária; modelo maior quando a confiança vier baixa, no relatório semanal ou quando o engenheiro pedir reanálise.
- **Custo não é o gargalo.** Com 3 fotos por câmera por dia (cerca de 6 mil tokens de entrada e 1 mil de saída por análise), uma câmera custa na ordem de US$ 0,50 por mês aos preços atuais de Flash, de US$ 0,75 a 1,50 por milhão de tokens de entrada ([preços Gemini](https://techjacksolutions.com/ai-tools/google-gemini/gemini-3-8-flash/)). É estimativa; mesmo um modelo dez vezes mais caro fica em poucos dólares.
- **Escolher com dados.** Desde o piloto, montar um conjunto de \~100 pares de fotos com a resposta certa dada pelo engenheiro e rodar os modelos candidatos nele antes de decidir.
- **Pré-processar antes da IA.** Recortar as zonas, reduzir a resolução, descartar fotos noturnas ou com chuva. Opcional: um detector local (tipo YOLO) para contar pessoas e máquinas, deixando o modelo de linguagem só para interpretar.

### Qual IA para ler a evolução da obra

Recomendação inicial: **Gemini**, com Flash na leitura diária e Pro na leitura semanal da evolução, porque processa muitas imagens e vídeo de uma vez. Os rankings, porém, trocam de líder conforme o benchmark e o mês; a escolha final sai do teste com as fotos do piloto, rodando os três candidatos nas mesmas imagens.

| Modelo | Ponto forte para obra | Papel sugerido |
| --- | --- | --- |
| Gemini Pro (família 3.x) | Liderava a compreensão multimodal no [BenchLM](https://www.benchlm.ai/best/multimodal) em julho/2026; lê sequências longas de fotos e vídeo nativamente | Leitura semanal: as 7 fotos da semana ou o time-lapse, comparadas ao cronograma |
| Gemini Flash | Gemini 3.7 Flash aparece com 89,0% no MMMU em setembro/2026, perto dos modelos maiores ([ranking](https://anotherwrapper.com/tools/llm-pricing/leaderboards/vision)) | Leitura diária de cada câmera |
| Claude Opus | 1º no mesmo ranking MMMU (89,9%) em setembro/2026; bom em cruzar imagem com documentos | Candidato no teste; relatório semanal que junta foto, cronograma e custo |
| GPT-5.x | Forte em visão somada a raciocínio geral | Candidato no teste |

**O que faz a IA ler bem a evolução** (pesa mais que a escolha do modelo)

- Câmera fixa no mesmo enquadramento a obra inteira.
- Enviar sequência, não foto isolada: ontem e hoje no diário, os 7 dias na análise semanal.
- Dar contexto: tarefas previstas, zonas desenhadas na imagem e uma foto de referência de cada etapa concluída.
- Perguntar de forma fechada e em JSON ("a laje do 3º pavimento está concretada: sim, não ou não visível") em vez de pedir uma descrição livre.
- Manter o engenheiro confirmando. Um [estudo de campo com 1.186 fotos de 17 obras](https://www.citedrive.com/en/discovery/multimodal-generative-ai-for-construction-site-management-and-monitoring-a-field-based-evaluation/) concluiu que esses modelos vão bem no que é descritivo e visível, e pior quando a tarefa exige julgamento de engenharia.

### Percepções

1. **O maior risco é o lançamento diário, não a câmera nem a IA.** Como é o engenheiro quem lança orçamento e material, lançar precisa caber no dia dele: importação de planilha e de XML de NF-e, saída de material em poucos toques no celular e a IA sugerindo lançamentos a partir da foto. Se der trabalho, custo e cronograma ficam sem base.
2. **A internet da obra decide a arquitetura.** Fazer visita técnica antes de comprar hardware: tipo de internet, energia, onde fixar. O agente local resolve CGNAT, queda de rede e mistura de modelos de câmera.
3. **Câmera fixa não vê o interno.** Ela cobre estrutura, fachada e área externa. Para acabamento e instalações, as fotos de celular do diário de obra entram na mesma análise.
4. **IA é sugestão auditável, não medição.** O % físico continua sendo do engenheiro; a IA aponta divergências e economiza a volta pela obra.
5. **Hardware próprio exige operação.** Alguém precisa reiniciar câmera, recarregar o chip 4G, limpar a lente. O painel deve mostrar a saúde de cada câmera (última foto recebida) e ter um responsável por obra.
6. **Segurança das câmeras.** Trocar senha padrão, atualizar firmware e nunca abrir porta da câmera para a internet; sempre via agente ou VPN.
7. **Começar pequeno.** Uma obra, uma ou duas câmeras, Gemini Flash, Vercel mais VPS. Trocar peças só com dados do piloto.

## Arquitetura técnica, modelo de dados e integrações

Stack pensada para um time pequeno desenvolvendo com Claude Code: **Next.js** (web e app de campo como PWA) + **Supabase** (Postgres, autenticação, storage, funções e agendamento) + **IA plugável** para ler as fotos, com provedor trocável (Gemini Flash ou um modelo maior). Web na Vercel e captura na VPS. É a mesma base do Lovable, então telas podem ser prototipadas lá e o código evoluído no GitHub com Claude Code.

&#91;embedded content: arquitetura · 3 zonas, 12 componentes\]

Câmeras e app de campo escrevem na mesma base; jobs agendados capturam as fotos, geram o time-lapse, chamam a IA e disparam os alertas.

### Stack

| Camada | Escolha | Por quê |
| --- | --- | --- |
| Web e app de campo | Next.js + TypeScript; PWA com IndexedDB para offline | Um só código; instala no celular sem loja de apps |
| Banco e login | Supabase Postgres com row-level security; login Google e Microsoft | Multiempresa seguro e SQL completo para relatórios |
| Imagens | Supabase Storage (ou S3/R2) + geração de miniaturas no upload | Barato; links assinados com validade |
| Agendamento | pg\_cron + worker Node em Docker na VPS (captura, FFmpeg, IA) | Time-lapse precisa de CPU e tempo de execução longo |
| IA | Camada de IA plugável: Gemini Flash na rotina, modelo maior para casos difíceis e relatórios; resposta em JSON validada por schema | Descreve a foto e cruza com as tarefas previstas |
| Gantt e gráficos | Biblioteca de Gantt pronta + Recharts | Não reinventar o que já existe |
| Testes | Vitest, Playwright e testes de permissão (RLS) em SQL | Claude Code roda tudo a cada mudança |
| Infra | Web na Vercel; recebimento de fotos, FTP e jobs na VPS; Supabase gerenciado; GitHub Actions | Deploy automático a cada PR aprovado |

### Modelo de dados (núcleo)

Toda tabela leva `empresa_id` para o isolamento por empresa.

| Entidade | Campos principais | Liga com |
| --- | --- | --- |
| obra | nome, endereço, CNO, datas, orçamento, status | empresa |
| eap\_item | código, nome, tipo (etapa ou tarefa), início e fim previstos e de base, % físico, quantidade, unidade | obra, eap\_item pai |
| dependencia | predecessora, sucessora, tipo, defasagem | eap\_item |
| orcamento\_item | insumo, tipo (material, mão de obra, equipamento), quantidade, custo unitário, versão | eap\_item, item |
| pessoa | nome, CPF, função, empreiteira, custo com vigência, documentos | empresa |
| apontamento | data, horas ou diária, quantidade produzida | obra, pessoa, eap\_item |
| item | código, nome, unidade, tipo (material ou ferramenta), estoque mínimo | empresa |
| movimento\_estoque | tipo (entrada, saída, transferência, ajuste), quantidade, valor, nota, responsável | obra, item, eap\_item |
| emprestimo\_ferramenta | saída, devolução prevista e real | item, pessoa |
| camera | tipo de conexão, URL ou FTP, credencial cifrada, horários, zonas | obra |
| snapshot | data e hora, origem (câmera fixa, body cam, celular), caminho da imagem, miniatura | camera |
| analise\_ia | resumo, contagens, evidência por tarefa, confirmado por, correções | snapshot, eap\_item |
| despesa e medicao | valor, data, fornecedor ou empreiteira, retenções | obra, eap\_item |
| diario\_obra | data, clima, ocorrências, fotos, assinatura | obra |
| audit\_log | tabela, registro, antes, depois, usuário, data | todas |

### Integrações

- **Câmeras**, Intelbras via agente local (padrão), envio por FTP direto à VPS ou VPN; upload manual pelo celular como reserva. Detalhes na seção de implantação.
- **IA diária**: um job por câmera envia a foto de hoje, a de ontem e a lista de tarefas previstas para as zonas da câmera. A resposta volta em JSON (avanços, tarefas sem evidência, pessoas, máquinas, observações) e espera a confirmação do engenheiro.
- **NF-e**: importação do XML na fase 2; consulta por chave exige serviço terceiro ou certificado digital.
- **ERP**: exportação CSV/XLSX no MVP; API e webhooks depois.
- **WhatsApp**: API oficial da Meta (Cloud API) para alertas na fase 2.

## Roadmap e plano de execução com Claude Code

O MVP sai em cerca de 14 semanas (2 de fundação + 6 sprints de 2 semanas) e vai para uma obra-piloto; a IA de leitura das fotos só entra quando o campo já estiver registrando equipe e materiais, porque sem isso ela não tem com o que comparar. Prazos estimados para 1 dev com Claude Code; ajustar após a Fase 0.

&#91;embedded content: roadmap · 4 fases, 2 portões\]

Os dois portões usam as metas da seção de métricas; sem passar o primeiro, a Fase 2 não começa.

### Sprints do MVP

| Sprint | Semanas | Entrega | Requisitos |
| --- | --- | --- | --- |
| 0 | 1–2 | Monorepo, CLAUDE.md, CI, login, empresas, RLS testada, dados de exemplo; bancada com 1 câmera Intelbras enviando foto à VPS | RF-004 |
| 1 | 3–4 | Obras, EAP em árvore, importador de planilha e MS Project | RF-001 a 003 |
| 2 | 5–6 | Gantt com dependências e linha de base; tarefas de hoje no PWA offline; diário de obra | RF-201 a 203 |
| 3 | 7–8 | Pessoas e empreiteiras, chamada diária, custo de mão de obra por tarefa | RF-301 a 303 |
| 4 | 9–10 | Catálogo, entradas, saídas por tarefa, ferramentas com QR | RF-401 a 404 |
| 5 | 11–12 | Câmeras, captura agendada, galeria, comparação, time-lapse semanal | RF-101 a 104 |
| 6 | 13–14 | Orçamento, físico-financeiro, orçado × realizado, curva S, painel e portfólio | RF-501 a 504, RF-601 e 602 |

### Como trabalhar com Claude Code

1. **Estrutura do repositório**: `apps/web` (Next.js), `supabase/` (migrações, seed, testes de RLS), `workers/timelapse` (FFmpeg), `packages/shared` (tipos e schemas Zod usados no front, na API e na resposta da IA).
2. **CLAUDE.md na raiz** com: stack, comandos (`pnpm test`, `supabase db reset`), regras inegociáveis e um glossário de obra em português (EAP, curva S, medição, físico-financeiro, almoxarifado) para o modelo usar os termos certos.
3. **Regras inegociáveis no CLAUDE.md**: toda tabela nova tem `empresa_id`, política RLS e teste; toda alteração de estoque e custo passa por função no banco e gera `audit_log`; nada de cálculo de custo só no front.
4. **Um requisito por vez**: cada RF vira uma issue; Claude Code começa em modo de planejamento, propõe migração → API → tela → testes, e só implementa depois da aprovação. PR pequeno, CI verde, revisão humana.
5. **Seed realista desde o dia 1**: uma obra de exemplo com \~150 tarefas, 30 pessoas, 200 itens e uma semana de fotos, para demonstrar e testar curvas e alertas.
6. **Protótipo opcional no Lovable**: telas podem nascer no Lovable (que sincroniza com o GitHub) e depois Claude Code assume o mesmo repositório para a lógica pesada (RLS, jobs, IA, offline).

**Prompt inicial sugerido para a Fase 0**

```text
Leia o PRD em docs/PRD.md. Crie o monorepo descrito na seção de arquitetura
(Next.js + Supabase + pnpm workspaces), o CLAUDE.md com as regras inegociáveis,
CI no GitHub Actions rodando lint, testes unitários e testes de RLS, e as
migrações das tabelas empresa, usuario_papel e obra com RLS e testes.
Antes de escrever código, apresente o plano e espere minha aprovação.
```

## Métricas, riscos e perguntas em aberto

**Métricas de sucesso (medidas na obra-piloto, 3 meses)**

| Métrica | Meta |
| --- | --- |
| Dias com chamada de equipe registrada | ≥ 90% dos dias úteis |
| Saídas de almoxarifado vinculadas a uma tarefa | ≥ 95% |
| Snapshots capturados com sucesso | ≥ 98% dos horários agendados |
| Itens do resumo da IA confirmados pelo engenheiro sem correção | ≥ 70% (fase 2) |
| Atrasos detectados pelo sistema antes da reunião semanal | ≥ 1 por semana com causa apontada |
| Diferença entre custo realizado no sistema e no ERP no fechamento | ≤ 2% |
| Tempo do engenheiro para montar o relatório semanal | de horas para menos de 15 min |

**Riscos e como reduzir**

| Risco | Mitigação |
| --- | --- |
| Campo não adota (mestre não preenche) | App mínimo: chamada e tarefas do dia em 3 toques; offline; piloto acompanhado de perto |
| Internet ruim na obra | Fila offline; câmeras com 4G ou envio por FTP para um agente local que reenvia |
| IA erra a leitura da foto | Sempre como sugestão confirmada pelo engenheiro; registrar as correções para medir a taxa de acerto |
| Custo de IA e armazenamento cresce com as câmeras | Limite de imagens analisadas por dia; compressão; arquivamento frio após a obra |
| Regras fiscais mal implementadas | Fase 2, validada com contador; começar só com cadastro e relatório, sem cálculo automático de guia |
| LGPD com imagens de trabalhadores | Aviso na obra, desfoque em links públicos, retenção definida, DPO consultado |
| Escopo grande demais para o MVP | Fase 1 fecha em câmera simples + tarefas + chamada + almoxarifado + orçado × realizado; IA só na fase 2 |

**Perguntas em aberto**

- [ ] Resolvido: "planejamento fiscal" cobre o físico-financeiro (MVP) e as obrigações fiscais da obra (fase 2).
- [ ] Produto interno (uma empresa, ex.: obras do Caldeira) ou SaaS para vender a construtoras? Muda multiempresa, cobrança e onboarding.
- [ ] Qual obra será o piloto, quais modelos Intelbras e que internet e energia existem no local (fibra, 4G, rádio)?
- [ ] Orçamento hoje sai de qual ferramenta (planilha, OrcaFascio, Sienge, outro)? Define o primeiro importador.
- [ ] Integrar com ERP no MVP (ex.: NetSuite) ou só exportar planilha?
- [ ] Equipe é própria, empreiteira ou mista? Muda o modelo de custo da mão de obra.

## Fontes

Pesquisa feita em 30/10/2026. Preços marcados como estimativa vêm de sites de comparação, não dos fornecedores.

- Câmeras: [TrueLook time-lapse](https://www.truelook.com/features/construction-time-lapse) · [TrueLook TrueAI](https://www.truelook.com/trueai) · [OxBlue preços](https://oxblue.com/pricing) · [OxBlue IA](https://www.oxblue.com/solutions/project-analytics) · [OxBlue cotação](https://www.oxblue.com/get-a-quote) · [Sensera câmeras fixas](https://senserasystems.com/product-fixed-position-cameras) · [EarthCam (SourceForge)](https://www.sourceforge.net/software/product/EarthCam) · [Guia de preços de câmeras 2026](https://timelapse-portal-ci2.pages.dev/blog/best-construction-timelapse-cameras-canada-2026-buyers-guide)
- IA de progresso: [OpenSpace](https://b2bsalestools-com.pages.dev/tools/openspace/) · [Buildots](https://b2bsalestools-com.pages.dev/tools/buildots/) · [Doxel](https://b2bsalestools-com.pages.dev/tools/doxel/) · [Buildots, rodada Série D](https://geo.sig.ai/brands/buildots.md) · [Integração entre Buildots, Doxel e OpenSpace](https://theneuralbase.com/ai-for-real-estate/learn/advanced/tools-buildots-doxel-openspace/) · [Roboflow, visão computacional para obras](https://roboflow.com/ai/construction-progress-monitoring)
- Ferramentas e materiais: [Hilti ON!Track (GetApp)](https://www.getapp.ca/software/111465/on-track-asset-management) · [ShareMyToolbox × ON!Track](https://www.sharemytoolbox.com/compare/sharemytoolbox-vs-hilti-ontrack-which-tool-tracking-system-fits-best/) · [ON!Track × ToolWatch](https://www.softwareadvice.com.au/compare/70085/70101/ontrack/vs/toolwatch-enterprise) · [Kojo (Contrary Research)](https://research.contrary.com/company/kojo)
- Tarefas, campo e equipe: [Fieldwire preços](https://www.fieldwire.com/au/pricing/) · [Fieldwire (Capterra)](https://www.capterra.com/p/142801/Fieldwire/pricing/) · [Raken (ERP Research)](https://erpresearch.com/erp-add-ons/construction/raken) · [Raken, limitações](https://www.ingenious.build/blog-posts/raken-construction-software-alternatives) · [busybusy (FitGap)](https://us.fitgap.com/products/012484/busybusy) · [Bridgit Bench](https://constructionjunkie.com/blog/2020/10/13/bridgit-bench-helps-you-optimize-construction-workforce-management-in-the-cloud)
- Plataformas completas: [Procore preços (ERP Research)](https://erpresearch.com/erp-add-ons/construction/procore/pricing) · [Alternativas ao Procore 2026](https://www.technbrains.com/construction-software-development/procore-alternatives/) · [Buildertrend (CostBench)](https://costbench.com/software/construction-management/buildertrend/)

* Implantação: [URLs de câmeras Intelbras (iSpyConnect)](https://www.Ispyconnect.com/camera/intelbras) · [URLs de câmeras Intelbras (Camlytics)](https://camlytics.com/camera/intelbras/2) · [Preços Gemini Flash 2026](https://techjacksolutions.com/ai-tools/google-gemini/gemini-3-8-flash/)

- Modelos de IA: [BenchLM, melhores multimodais](https://www.benchlm.ai/best/multimodal) · [Ranking de visão (MMMU)](https://anotherwrapper.com/tools/llm-pricing/leaderboards/vision) · [Estudo de campo: IA generativa em 17 obras](https://www.citedrive.com/en/discovery/multimodal-generative-ai-for-construction-site-management-and-monitoring-a-field-based-evaluation/)
