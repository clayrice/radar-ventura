# Ativação da Ventura Semanal

Plano mensal de R$ 9,90, com edição semanal personalizada pelo perfil da empresa: setor, porte, objetivo, áreas de interesse, nível de uso de IA, ambição, papel, tempo para experimentar e limites de adoção. O checkout exige login e perfil salvo. A compra não marca o consentimento de e-mail automaticamente.

## Preparação em 14/10/2026

A cobrança foi separada por produto. `BILLING_PRODUCTS=weekly` permite somente o plano semanal, sem habilitar parceiros ou Plano de Rota. A ativação exige `BILLING_ENABLED=true`, chave Asaas, ambiente sandbox ou production, token de webhook de pelo menos 32 caracteres e APP_URL HTTPS. Antes de ativar, conferir as demais credenciais e o webhook. Retorno do checkout não comprova pagamento; somente a conciliação autenticada libera acesso.

Aplicar `021_weekly_account_delivery.sql` após revisão. A edição de quem pagou fica disponível na conta mesmo sem consentimento de e-mail. Assinaturas expiradas não entram na fila. O envio continua exigindo consentimento e assinatura ativa.

`/api/jobs/weekly` tem lock próprio, autorização CRON_SECRET, registro de execução e orçamento separado do coletor de notícias. O cron tenta processar um assinante por execução, diariamente a partir de 08h15 de Brasília, sem repetir a edição da mesma semana. A tentativa de configurar execução horária foi recusada pela Vercel; o cron diário é compatível com o plano atual. Isso limita o piloto a um processamento garantido por dia. Ampliar o plano de hospedagem ou configurar um agendador adequado antes de ampliar a base; a rota aceita reexecuções autenticadas e a rotina diária pode processar trabalho adicional quando houver tempo. `WEEKLY_JOB_ENABLED=false` mantém a rotina sem geração ou envio; ativar somente após validação. `EMAIL_SEND_ENABLED` controla a entrega semanal. `DAILY_EMAIL_SEND_ENABLED=false` continua bloqueando o digest diário. A cota atual de IA é dez chamadas por dia compartilhadas com as prévias e Plano de Rota; acompanhar a demanda e rever antes de ampliar vendas.

## Pendências externas verificadas

A conta Asaas da Ventura está autenticada e o cadastro aparece aprovado. A geração da chave foi liberada pela proprietária e autorizada para o Radar. A chave foi preparada sem permissão de saque. O Asaas exige validação por SMS; a criação aguarda essa etapa diretamente no painel. Não houve checkout real ou cobrança.

Após liberar a API: configurar a chave no ambiente seguro da Vercel, obter acesso sandbox e testar checkout, pagamento, renovação, eventos repetidos e fora de ordem, estorno e assinatura associada à cobrança. Configurar webhook sequencial para `/api/billing/webhook`, com os eventos de checkout e pagamento documentados no README. Verificar as migrações já aplicadas antes de configurar produção. Validar geração com dois perfis de empresa e entrega a destinatário autorizado. Somente então ativar os três gates de cobrança, geração e envio semanal.

Cancelamento de assinatura e troca de plano ainda são atendidos pela Ventura; o cancelamento de recebimento de e-mail não encerra a cobrança. O atendimento e esse texto precisam estar claros para compradores antes de abrir vendas.

Validação local: 67 testes da suíte passaram, além do teste adicional de autorização da rotina semanal. O build passou. Os testes de banco incluem pagamento idempotente, acesso isolado, edição na conta sem consentimento de e-mail e exclusão de assinaturas expiradas da fila. Os testes não substituem a homologação no Asaas.

## Homologação em 15/10/2026

Chaves de produção e sandbox criadas com autorização da proprietária, ambas sem permissão de saque. A chave de produção foi salva apenas em Production e a do sandbox apenas em Preview na Vercel. A migração 021 foi aplicada no banco do Radar. O webhook de produção foi salvo com API v3, token e envio sequencial, inicialmente desativado.

O sandbox aceitou o checkout recorrente de R$ 9,90 e confirmou o pagamento com cartão fictício. O cliente fictício tinha notificações desativadas. A cobrança retornou vínculo com o checkout e a assinatura mensal. O código real de conciliação foi executado contra a API sandbox, com o banco substituído por um simulador: confirmou valor, assinatura e prazo até 15/11/2026. O estorno foi confirmado no sandbox e o código solicitou revogação de acesso no simulador. Nenhum desses testes alterou assinaturas de produção.

Foi observada uma diferença na API: o filtro checkoutSession não retornou a cobrança recorrente, enquanto o filtro por cliente a retornou com checkoutSession correto. A conciliação usa fallback por cliente e aceita somente cobranças cujo vínculo com o checkout é exato. Se ainda não houver cobrança identificada no evento CHECKOUT_PAID, mantém o evento pendente e libera a fila para os eventos financeiros seguintes. A ausência de conciliação nunca ativa acesso.

Login por link foi validado. A prévia da conta foi gerada com o perfil fictício de varejo já cadastrado e adaptou a leitura para vendas e conquista de clientes. O envio manual de prévia semanal usa o mesmo único endereço de teste configurado, exige login e consentimento, tem limitação de geração e não ativa assinatura. A mensagem é identificada como prévia e aponta à conta, sem link para edição inexistente. Confirmar a entrega real após publicar essa ação.

## Hospedagem gratuita solicitada em 15/10/2026

A proprietária descartou a contratação do Vercel Pro e exige hospedagem sem mensalidade. A migração está preparada para Netlify Free, que permite projetos comerciais e inclui 300 créditos mensais com limite rígido. Ao esgotar a franquia, os sites da equipe pausam até o próximo ciclo; não ativar upgrade, recarga ou complemento pago. Deploy de produção consome 15 créditos; tráfego, transferência e processamento compartilham o saldo. Isso exige acompanhar o uso antes de ampliar a base. A gratuidade da hospedagem não elimina tarifas do Asaas nem consumo de OpenAI e Resend conforme suas contas existentes.

`netlify.toml` usa o adaptador Next.js automático, Node 22 e as funções em `netlify/functions`. O coletor mantém seus sete horários; o Instagram mantém seu horário atual. A fila semanal pode executar a cada hora, entre 08h15 e 20h15 de Brasília. Cada execução continua limitada a um assinante e à cota de IA compartilhada de dez chamadas por dia. O cron da Netlify tem limite de 30 segundos: ele apenas agenda um worker em background, que chama a rota Next autenticada de até 60 segundos. Os destinos são fixos, usam o domínio próprio do deploy fornecido pela Netlify (`URL`) e não seguem redirecionamentos. O segredo nunca é enviado a destinos fornecidos pelo chamador. Falhas continuam visíveis nos logs e em job_runs.

Antes de mudar a URL pública: concluir o cadastro gratuito e conectar exclusivamente clayrice/radar-ventura; configurar as variáveis no ambiente seguro; validar login, imagens, edição, checkout sandbox e webhooks no novo domínio; atualizar APP_URL, redirecionamentos do Supabase e webhook Asaas. Desativar os crons antigos antes de ativar o novo agendamento para evitar duas hospedagens executando as mesmas rotinas. Manter BILLING_ENABLED=false, WEEKLY_JOB_ENABLED=false, EMAIL_SEND_ENABLED=false e DAILY_EMAIL_SEND_ENABLED=false durante a migração. Chaves de produção não devem ser disponibilizadas a previews de contribuições externas.

Validação local da preparação: 73 testes passaram e a verificação TypeScript passou. O adaptador e os horários ainda precisam ser verificados em um deploy real da Netlify. O recebimento da prévia semanal por e-mail continua pendente da publicação.

O primeiro deploy passou, mas o deploy com as variáveis protegidas encontrou falso positivo no scanner para três configurações públicas: BILLING_PRODUCTS, OPENAI_MODEL e ASAAS_ENV. A exceção em netlify.toml limita-se a esses três nomes. A varredura continua ativa para todas as credenciais e tokens. O projeto foi renomeado para radar-ventura.netlify.app; a produção está pública e os previews permanecem privados. As conexões das novas chaves com Supabase, Asaas e OpenAI retornaram HTTP 200. O webhook Asaas foi atualizado para o domínio Netlify e segue desativado. O callback de login da Netlify foi acrescentado à lista permitida do Supabase, preservando o retorno antigo durante a transição.

Referências oficiais: https://www.netlify.com/blog/introducing-netlify-free-plan/ ; https://docs.netlify.com/manage/accounts-and-billing/billing/billing-for-credit-based-plans/credit-based-pricing-plans/ ; https://docs.netlify.com/build/frameworks/framework-setup-guides/nextjs/overview/ ; https://docs.netlify.com/build/functions/scheduled-functions/ .

## Revisão da prévia semanal na Netlify

O login por e-mail retornou corretamente a radar-ventura.netlify.app. Uma prévia de teste foi recebida no endereço autorizado em 15/10/2026, com SPF, DKIM e DMARC aprovados. A revisão encontrou uma atribuição de nacionalidade sem apoio no material fornecido. O resumo factual da edição semanal agora reutiliza integralmente o texto editorial das notícias selecionadas; o modelo escolhe a relevância e propõe a análise e os passos personalizados. Parágrafos são preservados na conta e no e-mail, e a instrução explicita que o contexto brasileiro do leitor não determina a origem das empresas nas matérias. A alteração impede a reescrita factual observada na seção de notícias; a análise gerada continua exigindo acompanhamento editorial.

Validação da correção: 74 testes e build passaram. Confirmar nova prévia após publicar. Cobranças, webhook e envios automáticos seguem desativados durante esses testes.

## Acesso por e-mail em 16/10/2026

SMTP próprio do Resend conectado ao Supabase, com autorização da proprietária: smtp.resend.com:465, usuário resend, remetente Ventura AI <acesso@news.ventura-ai.com>. A credencial existente foi salva somente no painel seguro. A entrega ao endereço autorizado foi confirmada no Gmail, com SPF, DKIM e DMARC aprovados. Os modelos de acesso e confirmação foram substituídos integralmente pelos arquivos em supabase/templates, gerados por `node --import tsx scripts/build-auth-emails.mts`. Usam as variáveis oficiais SiteURL e ConfirmationURL. Não incluir o modelo padrão anterior ao colar no editor. A segunda entrega, após remover o texto padrão em inglês, ainda precisa ser conferida.

Produção da Netlify confirmada na versão 57c2b2b (PR #10), deploy 6ad15bf79121a0b075eb7e32. A prévia corrigida ainda precisa ser recebida e revisada.

O vercel.json mantém somente o Instagram na hospedagem anterior. Após publicar esta alteração na Vercel, conferir a remoção dos agendamentos daily e weekly, que passam a ser responsabilidade da Netlify. O Instagram permanece na Vercel enquanto suas credenciais não forem migradas. Na Netlify, INSTAGRAM_PUBLISH_ENABLED=false evita duplicação.

Estado de liberação: BILLING_ENABLED, WEEKLY_JOB_ENABLED, EMAIL_SEND_ENABLED e DAILY_EMAIL_SEND_ENABLED permanecem false; webhook Asaas permanece desativado. A conexão SMTP não ativa cobranças nem campanhas.
