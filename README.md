# Ventura AI · IA com rumo

MVP em Next.js para Vercel, com Supabase, OpenAI, Resend e integração Asaas preparada. A interface e o conteúdo gerado estão em português brasileiro.

## Estado da entrega

- Aplicação publicada em https://radar-ventura.vercel.app/ a partir de `clayrice/radar-ventura`.
- Marca oficial de ventura-ai.com no cabeçalho e rodapé. Paleta: índigo `#524FF5`, lima `#DBFF4F`, fundo `#F7F6EF`, texto `#15142F`. Fontes Space Grotesk, Instrument Serif e JetBrains Mono.
- Radar público com busca, categorias e links de origem.
- Login por email, perfil empresarial e arquivo privado de edições.
- Cadastro online de parceiros, seleção de plano e contatos públicos após ativação.
- Plano de Rota: questionário, três projetos, fases, critério de sucesso e parceiros Estratégico compatíveis.
- Esquema SQL com isolamento por usuário, credenciais apenas no servidor e cotas de geração.
- Asaas: checkout hospedado, pedidos persistentes, recepção autenticada de webhooks, confirmação financeira e ativação transacional. Cobrança desativada por padrão.
- Supabase conectado para autenticação por email; URL do site e redirecionamento configurados. O fluxo completo ainda depende de um teste com uma caixa de email real.
- A edição pública de 21/09 é editorial e identificada. O job automático, o envio semanal, o Google OAuth e a cobrança ainda aguardam credenciais e validação.

## Ofertas de lançamento

| Produto | Preço | Entrega |
|---|---:|---|
| Radar diário | Grátis | Notícias e links de origem |
| Ventura Semanal | R$ 9,90/mês | Edição personalizada com próximos passos e parceiros |
| Plano de Rota IA | R$ 149,90, compra única | Diagnóstico inicial e três opções de projeto |
| Parceiro Catálogo | R$ 49,90/mês | Perfil no catálogo |
| Parceiro Conexões | R$ 99,90/mês | Catálogo e elegibilidade para recomendações semanais |
| Parceiro Estratégico | R$ 199,90/mês | Catálogo, semanal e elegibilidade no Plano de Rota |

Os preços estão centralizados em `lib/products.ts`, em centavos. São uma decisão comercial de lançamento, não uma estimativa validada de disposição a pagar. O Plano de Rota desta oferta não inclui a consultoria de 45 minutos nem a implementação oferecidas em outras versões do site antigo. Não há garantia de volume de leads ou de recomendações para parceiros.

## Executar

Requisitos: Node 22+ e npm.

```sh
npm ci
cp .env.example .env.local
npm run dev
```

Acesse `http://localhost:3000`. Para uma demonstração, mantenha `DEMO_MODE=true`, `EMAIL_SEND_ENABLED=false` e `BILLING_ENABLED=false`. Não cadastre credenciais no navegador nem no Git.

```sh
npm run test
npm run typecheck
npm run build
```

O teste de banco usa PostgreSQL embutido via PGlite. Simula os papéis `anon`, `authenticated` e `service_role`, a função `auth.uid()` e dois usuários. Não substitui o teste de autenticação real com Supabase.

## Conectar o Supabase

1. Crie um projeto próprio para este MVP. Não reutilize tabelas de produção da Ventura antiga sem uma migração revisada.
2. Execute os arquivos em `supabase/migrations/`, na ordem numérica, e depois `supabase/seed.sql`.
3. Configure URL, chave pública e chave de serviço em `.env.local` e nas variáveis da Vercel. A chave de serviço nunca usa prefixo `NEXT_PUBLIC_`.
4. Em Auth, configure a URL do site e a URL de retorno `https://SEU-DOMINIO/auth/confirm`.
5. Para links de email que funcionem entre dispositivos, configure o modelo Magic Link com:

```html
<a href="{{ .RedirectTo }}&amp;token_hash={{ .TokenHash }}&amp;type=email">Entrar na Ventura</a>
```

O callback também aceita o fluxo PKCE padrão. Configure limites de envio e, para lançamento, SMTP de autenticação no Supabase.

6. Desative `DEMO_MODE`. Complete o perfil e ative um assinante piloto no painel privado, ou use o Asaas em sandbox para exercitar a compra.

```sql
insert into public.subscriptions(user_id,status,activated_at)
values ('UUID_DO_USUARIO','active',now())
on conflict(user_id) do update set status='active';
```

O usuário não pode modificar seu acesso diretamente. As edições são privadas por RLS. Os rascunhos de parceiros ficam em `partner_applications`; a função financeira publica o perfil automaticamente após a confirmação da assinatura.

## Fontes e publicação

`lib/source-registry.json` contém as 31 fontes discutidas. Dezessete feeds foram validados em 10/09/2026. Human in the Loop, AiDrops, AI Breakfast e outros sem RSS disponível continuam identificados como conectores pendentes. Não existe uma alegação de monitoramento ativo para esses nomes.

`npm run sources:verify` verifica páginas públicas e feeds, atualizando o registro. Depois de alterar o registro, atualize também os dados de `sources` via seed. As origens permitidas são compiladas a partir desse registro; a edição de uma URL apenas no banco não habilita downloads arbitrários.

- Reportagens e análises independentes geram candidatos editoriais. Anúncios de fornecedores ficam apenas como referência.
- Curadoria alimenta `discoveries`, com links primários encontrados. Sua resolução automática completa ainda não foi implementada; não é publicada como notícia original.
- A deduplicação cobre URL canônica e título normalizado. Agrupamento semântico de matérias diferentes sobre o mesmo evento fica para uma próxima versão.
- Somente trechos de feed com conteúdo suficiente são usados. Não há extração de artigos completos nem acesso a conteúdo pago.
- Saídas estruturadas passam por validação. Textos pouco fundamentados ou tentativas de instruir o modelo são rejeitados por instrução editorial; isso não substitui uma revisão factual humana.

## Jobs e custos

`vercel.json` agenda `/api/jobs/daily` às 09:00 UTC (06:00 em São Paulo). A execução exige `Authorization: Bearer CRON_SECRET`, com segredo de pelo menos 32 caracteres. Também é possível acionar esse mesmo endpoint autenticado para testes.

Uma execução faz:

1. Coleta os feeds validados, com no máximo quatro solicitações em paralelo, limite de 2 MB por feed e timeout de 12 segundos.
2. Tenta classificar até três notícias.
3. Prepara uma edição da semana, usando as notícias da semana anterior.
4. Prepara um Plano de Rota já pago.
5. Tenta enviar até três edições prontas.

Há um limite persistente de dez chamadas OpenAI por dia, inclusive em reexecuções manuais, e um bloqueio de concorrência com prazo de dez minutos. Respostas limitadas a 2.400 tokens. O modelo inicial configurável é `gpt-4.1-mini`; confirme disponibilidade na conta utilizada. Não há chamadas OpenAI na demonstração.

**Capacidade inicial:** esta configuração é para um piloto pequeno, de até cinco assinantes semanais. As edições são distribuídas ao longo da semana. Antes de abrir vendas ao público, aumente a capacidade de geração conforme a fila e a latência observadas. Não venda uma promessa de entrega simultânea toda segunda-feira com os limites atuais. Falhas e cotas podem atrasar a fila.

Inspecione `job_runs`, `sources.last_error`, `articles.last_error`, `editions` e `roadmaps` no painel privado. Não existe painel administrativo neste MVP. A fila precisa de acompanhamento operacional durante o piloto.

## Email pelo Resend

Configure domínio remetente, `RESEND_API_KEY`, `EMAIL_FROM`, `APP_URL` HTTPS e `UNSUBSCRIBE_SECRET` (32 caracteres ou mais). Ative `EMAIL_SEND_ENABLED=true` apenas depois de um teste com uma conta interna que autorizou receber email.

O envio verifica opt-in e acesso ativo. O payload fica congelado antes da primeira tentativa e a chave de idempotência é o ID da edição. O Resend retém essa chave por 24 horas; após 23 horas sem confirmação local, o registro passa para revisão para evitar duplicidade. Confira no provedor antes de reabrir a tentativa. `sent_at` indica aceitação pelo provedor, não entrega comprovada na caixa de entrada. Eventos de bounce e entrega ainda não estão conectados.

Cancelamento de email funciona por link assinado, confirmação no navegador ou one-click via POST. O conteúdo do email escapa HTML fornecido pelo modelo.

## Asaas: ativação em duas etapas

A integração está desativada. Configure `ASAAS_ENV=sandbox`, `ASAAS_API_KEY` e `ASAAS_WEBHOOK_TOKEN` (32 caracteres ou mais). O catálogo de preços é o mesmo usado pela interface e pelo checkout.

Configure o webhook em `/api/billing/webhook` com envio sequencial e eventos `CHECKOUT_PAID`, `CHECKOUT_CANCELED`, `CHECKOUT_EXPIRED`, `PAYMENT_CONFIRMED`, `PAYMENT_RECEIVED`, `PAYMENT_REFUNDED` e eventos de chargeback relevantes. O token chega no cabeçalho `asaas-access-token`.

O servidor busca a cobrança no Asaas e confere o valor antes de liberar o produto. Retorno de navegação nunca confirma pagamento. A função SQL é transacional e deduplica por ID da cobrança. Mensalidades estendem o período de acesso; estornos revogam o pagamento correspondente. Pedidos de checkout com resposta ambígua ficam em revisão, sem repetição automática.

Antes de habilitar vendas reais, valide no sandbox:

- compra, pagamento repetido, webhook repetido e webhook fora de ordem;
- renovação, atraso, cancelamento, estorno e chargeback;
- timeouts de criação e reconciliação de pedidos;
- vínculo entre checkout e assinatura nas respostas reais da conta;
- publicação automática de parceiro e criação de um único Plano de Rota por pedido;
- consentimento de email separado da compra;
- prazo de acesso e acesso após estorno.

**Limitações atuais:** cancelamento e troca de plano são atendidos pela Ventura; não há autosserviço dessas operações. O perfil de parceiro tem cadastro e edição online, mas a cobrança não está ativa. A conciliação no ambiente real ainda não foi testada. A renovação automática depende dos webhooks configurados. Não ativar `BILLING_ENABLED=true` em produção antes dessas verificações e do aumento da capacidade do piloto.

## Vercel

O projeto Next.js está publicado a partir da raiz do repositório `radar-ventura`. Em produção, `DEMO_MODE=false`, `EDITORIAL_PREVIEW=true`, `APP_URL=https://radar-ventura.vercel.app` e as variáveis públicas do Supabase estão configuradas. Não há chave de serviço, OpenAI, Resend ou Asaas na Vercel; o job retorna indisponível até receber `CRON_SECRET`. Confirme se o plano Vercel permite a duração de 300 segundos do job antes de ativá-lo.

## Referências de implementação

- Marca: https://ventura-ai.com/
- Supabase SSR: https://supabase.com/docs/guides/auth/server-side/creating-a-client
- OpenAI Structured Outputs: https://developers.openai.com/api/docs/guides/structured-outputs
- Resend idempotência: https://resend.com/docs/dashboard/emails/idempotency-keys
- Vercel cron: https://vercel.com/docs/cron-jobs/manage-cron-jobs
- Asaas checkout: https://docs.asaas.com/docs/checkout-asaas
- Asaas eventos: https://docs.asaas.com/docs/eventos-para-checkout

## Questionário da edição semanal

O nome da empresa é o único texto livre. Setor, porte, público atendido, objetivo principal e nível de uso de IA são seleções fechadas. O assinante marca de uma a três áreas de interesse. As escolhas alimentam diretamente a personalização. A migração `005_weekly_preferences.sql` preserva perfis antigos, sem atribuir respostas presumidas.

## Reaproveitamento do Plano de Rota original

Pendente de acesso ao repositório conectado ao Lovable. O questionário, as regras e os prompts desta implementação ainda são provisórios. Antes da migração, localizar formulários, tipos de resposta, funções de backend, prompts, critérios de priorização e testes no repositório original; adaptar esses componentes à autenticação e aos planos comerciais deste MVP. Não copiar credenciais, dados de clientes nem configurações do ambiente antigo.

## Direção editorial humana

O radar prioriza bastidores e debates, negócios e trabalho. Grandes lançamentos exigem importância excepcional e cobertura independente com contexto humano. Anúncios diretos de fornecedores não podem ser publicados isoladamente; o bloqueio existe no classificador e no banco (migração 006). A análise destacada precisa de um trecho literal de evidência presente no material recebido. Isso reduz opiniões inventadas, mas não substitui conferência factual.

A home alterna categorias e limita lançamentos. Declarações alarmantes, previsões e controvérsias são tratadas como falas atribuídas, sem converter especulação em fato. A fonte do link principal deve ser reportagem ou análise, e não o release do fornecedor.


### Login com Google (assinantes e parceiros)

O botão usa OAuth com PKCE pelo Supabase. Uma mesma conta pode ter perfil empresarial e perfil de parceiro. O login não concede assinatura nem ativa placements. O cadastro de parceiros retorna a `/account/parceiro`; o de assinantes, a `/account/profile`. O acesso por email continua disponível.

Para ativar:
1. Defina `APP_URL` com a origem real da aplicação e configure as variáveis públicas do Supabase. Desative `DEMO_MODE` depois da configuração.
2. No Google Cloud, crie um cliente OAuth do tipo aplicação Web. Configure a tela de consentimento, os domínios e apenas os escopos básicos de identidade (openid, email, profile).
3. Cadastre a origem da aplicação e, como URI de redirecionamento no Google, o callback exibido pelo Supabase (`https://SEU-PROJETO.supabase.co/auth/v1/callback`).
4. Em Supabase → Authentication → Providers → Google, habilite o provedor e salve o Client ID e o Client Secret. O segredo fica no Supabase, nunca no frontend.
5. Em URL Configuration, cadastre a Site URL e permita a URL da aplicação `https://SEU-DOMINIO/auth/confirm**` (incluindo a query de destino). Em desenvolvimento, use a mesma origem em `APP_URL` e no navegador, por exemplo `http://127.0.0.1:3000`, e permita esse callback. Não misture localhost com 127.0.0.1: o PKCE depende dos cookies.
6. Se personalizar o template de email, use o template acima: `.RedirectTo` já inclui `?next=...`, preservando o destino.

Validação pendente com credenciais reais: cadastro Google novo para cada destino, retorno de conta existente, cancelamento no Google, link de email expirado e saída da conta. A prévia apresenta o botão e informa que a conexão ainda não está ativa. Referência: https://supabase.com/docs/guides/auth/social-login/auth-google

### Vitrine dos parceiros

Cada parceiro tem um carrossel no card do catálogo e na página de detalhes. O cadastro, em “Sua vitrine no catálogo”, permite enviar, ordenar, descrever e remover até seis materiais. Um vídeo opcional ocupa a capa; os demais itens são imagens. A primeira imagem serve como pôster do vídeo. A reprodução depende de clique e tem controles nativos. Os perfis patrocinados continuam identificados.

- Imagens JPG/PNG/WebP: até 5 MiB cada. Vídeo MP4/WebM: até 40 MiB, no máximo um. Slides de Canva, PowerPoint ou PDF devem ser exportados como imagens. Não há conversão de apresentações, transcodificação ou geração automática de legendas nesta versão.
- Aplique `007_partner_showcases.sql` no Supabase antes de usar o recurso. Ela cria o bucket público `partner-media`, os limites de formato/tamanho, as políticas de acesso e a tabela `partner_showcases`.
- O envio vai diretamente do navegador ao Storage, evitando transportar vídeos pelas funções da Vercel. Arquivos grandes usam o envio padrão; se a conexão falhar, o usuário tenta novamente. Upload retomável é uma evolução possível.
- Apenas contas com cadastro de parceiro salvo podem enviar arquivos. Cada conta tem seis caminhos fixos, limitando a ocupação máxima a 240 MiB por parceiro. O servidor verifica propriedade, existência, tipo, tamanho e composição do carrossel antes de salvar o manifesto. O manifesto só fica visível publicamente enquanto o perfil estiver ativo. Arquivos do bucket são públicos por URL, inclusive antes da ativação; o formulário informa isso.
- Remover um item e salvar limpa seus arquivos não utilizados. Para substituir materiais quando todos os slots estão ocupados, salve as remoções primeiro. Arquivos de um envio abandonado ficam limitados aos seis slots e são reutilizados ou removidos no próximo salvamento. A exclusão de uma conta exige também limpar sua pasta no Storage.
- Na demonstração, os slides do catálogo são ilustrativos e o upload usa somente uma prévia local em memória. Os materiais selecionados não são enviados nem persistidos ao sair da página.

Validação: testes de limites/formatos/ordenação e de isolamento SQL entre dois usuários, proteção contra alterações de outro parceiro e suspensão de visibilidade após cancelamento. Ainda falta validar um upload real e a reprodução de vídeo em dispositivos móveis com o Supabase configurado.

### Radar real e conexão inicial (11/09/2026)

`npm run radar:collect` consulta os feeds habilitados e grava `data/radar/collection.json`, com horário, status por fonte e candidatos dos últimos sete dias. A coleta de 11/09 retornou 105 itens de 17 feeds. Coletar não publica automaticamente. Os conectores pendentes continuam pendentes.

`data/radar/edition.json` contém a edição editorial revisada de 21/09, com quatro matérias reais consultadas na web (Axios e AP), datas e links de origem e três parágrafos de notícia por texto. A reflexão para o empresário brasileiro fica separada em “E a gente com isso?”. A edição é uma publicação manual, identificada pela data; não representa atualização automática. A geração automática exige três ou quatro parágrafos e rejeita textos sem material suficiente.

Supabase e Vercel já têm projetos dedicados. Para ativar o piloto ainda faltam: validar um login por email; configurar a chave de serviço do Supabase e um segredo do job apenas no servidor; criar um projeto OpenAI API com limite de gasto e testar uma chamada curta. Resend precisa de domínio remetente e teste de entrega para a edição semanal. Google OAuth e Asaas exigem suas respectivas contas e testes separados. Nunca versionar nem enviar chaves pelo chat.

`npm run connections:check` informa somente variáveis ausentes, sem exibir segredos. Presença de variável não comprova uma conexão. Depois de configurar: testar banco e RLS, fazer uma chamada curta ao modelo, testar o job autenticado, verificar uma notícia publicada e só então mudar `EDITORIAL_PREVIEW` para `false`.

A seção “E a gente com isso?” usa o campo `brazil_impact`, separado da reportagem e identificado como Leitura Ventura. A edição local tem uma reflexão específica por pauta, voltada ao empreendedor brasileiro. A geração automática exige esse campo para publicar.

### Imagens de capa

`009_article_covers.sql` acrescenta URL, legenda e crédito. A capa e a legenda levam à matéria original. O job reconhece anexos de imagem e `media:content` do RSS; não inventa autoria nem usa imagens geradas. Quando a imagem externa falha ou não foi autorizada, uma capa gráfica da Ventura aparece com o título e o link para a reportagem.

Na edição de 21/09, as quatro capas são gráficas da Ventura: as imagens externas da Axios não carregaram no site publicado, e as condições de reutilização das fotos da Axios e da AP ainda não foram confirmadas. Legenda e crédito não substituem licença de uso. O link da capa leva ao artigo com a imagem original.
