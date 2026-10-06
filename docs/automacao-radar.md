# Execução diária do Radar Ventura

A edição só fica `completed` quando há exatamente três artigos publicados e três posts correspondentes confirmados no Instagram. A resposta HTTP é 200 apenas nesse estado. Pendências retornam 202; falhas inesperadas retornam 500. O banco impede uma quarta notícia na mesma data, inclusive em escritas concorrentes. Edições históricas são preservadas.

`radar_editions` guarda a data, etapa da busca, tentativas, próxima tentativa, métricas e motivo de parada. `radar_candidates` vincula os candidatos à edição. `job_runs` registra cada tentativa. Uma interrupção não marca sucesso; a próxima chamada identifica o job interrompido e retoma. As datas usam São Paulo. Edições pendentes alternam por próxima tentativa para não impedir a edição seguinte.

A coleta usa fontes independentes verificadas e habilitadas. A janela cresce de 1 para 3, 7 e 14 dias, e a profundidade de cada feed cresce de 15 para 30, 60 e 100 itens. Fontes desabilitadas continuam desabilitadas. A busca não supera 14 dias: na ausência de três matérias seguras, a edição permanece pendente, com motivo explícito. Nunca se reduz a exigência editorial para cumprir a meta.

A aprovação exige `publish=true`, relevância, reflexão brasileira, três ou quatro parágrafos e evidência literal presente no trecho da fonte. Rejeições por evidência não são promovidas por um fallback. Erros de formato e falhas de geração podem ter até três tentativas por artigo, com espera crescente. Leituras de feed têm duas tentativas. O orçamento de notícias permite até 40 chamadas de IA por dia em São Paulo, separado das dez chamadas existentes para outros produtos. Cada chamada, inclusive uma que falhe, consome orçamento.

As métricas incluem `collected` (candidatos únicos vinculados), `rejected`, `pending`, `errors`, `published`, `source_errors`, `feed_items_skipped`, `classification_failures`, `instagram_published`, `instagram_pending` e `reason`. Os contadores de candidatos são persistentes; erros de fonte e chamadas falhas descrevem a tentativa atual. `errors` pode sobrepor `pending` quando há retry agendado. Descartes brutos do feed são separados de rejeições editoriais. Motivos por artigo ficam em `articles.last_error` e por fonte em `sources.last_error`.

O agendamento da Vercel tem oito chamadas diárias: 06h, 07h, 08h, 09h, 11h, 14h, 17h e 20h de São Paulo. Cada entrada roda uma vez por dia, conforme o plano Hobby. O provedor pode atrasar a chamada dentro da hora. As duas rotas retomam o mesmo fluxo com bloqueio compartilhado. `next_attempt_at` é o horário mínimo para retomar, não uma promessa de chamada naquele instante. Chamadas adicionais autenticadas também são idempotentes. Referência: https://vercel.com/docs/cron-jobs/usage-and-pricing

## Instagram

Aplicar `011_instagram.sql` e `014_daily_completion.sql` antes do deploy. Configurar em produção `INSTAGRAM_ACCOUNT_ID`, `INSTAGRAM_ACCESS_TOKEN`, `INSTAGRAM_API_VERSION` e `INSTAGRAM_PUBLISH_ENABLED=true` depois da autorização Meta. O app usa Instagram Login; confirmar `instagram_business_basic` e `instagram_business_content_publish` e a identidade `ventura_ai`. Não usar sessão web como token da API.

A fila tem três slots por conta/data e unicidade por artigo. As capas usam logo, fontes e cores existentes. O total publicado inclui tentativas anteriores. Posts de outras datas não preenchem a meta. Leituras da Meta têm até três tentativas para rede/429/5xx. Uma criação de contêiner interrompida pode ser repetida, pois criar não publica. `media_publish` nunca é repetido após retorno ambíguo: a rotina consulta o estado do contêiner e confirma `PUBLISHED`, ou deixa em revisão. Isso evita duplicação após timeout. Contêiner recusado/expirado antes da publicação pode ser recriado até o limite de tentativas.

Se uma legenda não cabe, o erro fica no job, sem truncar fatos ou inventar conteúdo. Conta errada, credenciais ausentes, rejeição do provedor e publicação desativada impedem a conclusão da edição. Credenciais e permissão reais precisam ser testadas na conta Meta; testes locais não substituem essa validação.

## Conferência após implantação

1. Acionar `/api/jobs/daily` pela Vercel, com o segredo do cron no cabeçalho.
2. Conferir três artigos válidos na data da edição e três linhas `published` correspondentes em `instagram_posts`.
3. Conferir os posts em @ventura_ai e registrar seus identificadores.
4. Acionar novamente: os totais permanecem três, sem uma quarta notícia ou post.
5. Verificar `job_runs.metrics` e `radar_editions`: somente depois dessas confirmações a edição pode constar como concluída.

Diagnóstico de 06/10/2026 antes da alteração: uma notícia publicada; job diário marcado completed; tabela instagram_posts e variáveis Instagram ausentes em produção. A conta Meta acessível não tinha apps cadastrados. A ativação real depende da criação/autorização desse app.
