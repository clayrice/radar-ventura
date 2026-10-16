# Automação diária do Radar Ventura

A coleta diária roda na Netlify às 06h de São Paulo (09h UTC), com recuperações às 08h, 09h, 11h, 14h, 17h e 20h, conforme `netlify.toml`. A fila semanal também roda na Netlify. O Instagram permanece na Vercel; `INSTAGRAM_PUBLISH_ENABLED=false` na Netlify evita que essa hospedagem publique.

A Vercel chama `/api/jobs/instagram` às 10h UTC (07h de São Paulo). Chamadas de recuperação estão configuradas às 11h30, 12h30, 14h30, 17h30, 20h30 e 23h30 UTC (08h30, 09h30, 11h30, 14h30, 17h30 e 20h30 de São Paulo). Cada entrada cron executa uma vez por dia, compatível com o plano Hobby. Esse plano tem janela flexível de até 59 minutos; os horários não garantem publicação no minuto indicado.

As chamadas retomam os posts pendentes da data atual de São Paulo. A rotina exige exatamente três matérias publicadas com fotos da fonte, preserva o bloqueio de concorrência e nunca repete automaticamente `media_publish` quando uma tentativa ficou sem confirmação. Uma edição antiga não substitui a edição atual. A conclusão só ocorre após confirmar três matérias com imagens e três posts publicados.

## Imagens das matérias

O coletor usa imagens associadas ao item do feed ou lê `og:image`/`twitter:image` da própria página da reportagem. O sistema guarda a URL e a origem (`feed` ou `article`) no banco. Para o Instagram, busca a foto no servidor, aplica o template aprovado pela Ventura AI e envia a arte pronta ao armazenamento do Supabase. Nada precisa ser baixado ou salvo no computador da Clarice.

Imagem ausente, inacessível ou de origem não confirmada impede a publicação. O sistema tenta recuperar a imagem em execuções posteriores. Depois de três falhas para um candidato, ele é descartado para que outra matéria possa ocupar a vaga. Não há arte tipográfica ou imagem gerada como substituta. O template mantém a foto da matéria em tela cheia, marca Ventura AI, data do Radar, categoria, título, fonte vertical e rodapé `@ventura_ai` / `Leia no Radar · link na bio ↗`.

## Instagram e conclusão

Uma vez configurados o identificador da conta, token e permissões de publicação da Meta, o fluxo diário publica automaticamente sem aprovação individual. `INSTAGRAM_PUBLISH_ENABLED=false` é apenas um interruptor de emergência; na produção Vercel, deve permanecer `true`; na Netlify permanece `false` enquanto o Instagram for operado pela Vercel. A publicação exige correspondência entre a imagem de fonte do artigo e a capa do post. Falhas ficam pendentes para retry e nunca contam como post confirmado.

Aplicar as migrações `011_instagram.sql`, `014_daily_completion.sql`, `015_image_completion.sql` e `016_source_images_required.sql` antes do deploy. `016` registra a origem das imagens, impede que matérias atuais sejam publicadas sem imagem da fonte e exige três imagens válidas e três posts confirmados na conclusão. A restrição histórica permanece preservada.

`job_runs` registra cada tentativa e `radar_editions` mantém status, próxima tentativa e métricas. Um erro de coleta, imagem, geração, API ou publicação deixa a edição como `pending` ou `blocked`; ela não é marcada concluída. O limite de chamadas de IA é independente das outras rotinas do produto.

## Horário

A Vercel executa expressões cron em UTC. Para publicar no minuto das 06h de São Paulo, o projeto precisa de plano Pro ou Enterprise, que tem precisão por minuto. No plano Hobby, a rotina diária pode iniciar em qualquer momento dentro da hora programada, até 59 minutos depois. A Vercel também exige novo deploy para registrar alterações de cron. Referências: [precisão e limites da Vercel Cron](https://vercel.com/docs/cron-jobs/usage-and-pricing) e [gerenciamento das tarefas](https://vercel.com/docs/cron-jobs/manage-cron-jobs).

O horário configurado representa o início do processamento. Coleta, redação, geração da arte e confirmação pela Meta levam tempo, então o sistema não promete que os três canais estejam visíveis exatamente às 06h.

## Conferência após implantação

1. Confirmar que o deploy de produção Vercel registrou as sete entradas de `/api/jobs/instagram` de `vercel.json`.
2. Confirmar as credenciais da Meta e `INSTAGRAM_PUBLISH_ENABLED=true` na Vercel. A Netlify mantém a publicação desativada.
3. Consultar `job_runs` e `instagram_posts` após uma execução natural. Não acionar a rota para testar em produção: ela publica conteúdo real.
4. Conferir três posts confirmados da data editorial, sem duplicatas, e a próxima execução diária para reconciliar a conclusão da edição.

## Incidente de 16/10/2026

Às 07h39 de São Paulo, o Instagram registrou `waiting_for_three_articles` com zero matérias. A coleta registrou interrupções e só alcançou três matérias às 11h01. As execuções seguintes da Netlify retornaram `instagram: disabled`; havia apenas uma chamada diária de Instagram na Vercel. Nenhum registro de post existia para a data durante o diagnóstico.

A correção adiciona seis oportunidades diárias de recuperação na Vercel, sem alterar credenciais, habilitar publicação na Netlify ou executar publicações de teste. O atraso da coleta continua sendo um limite separado; os novos horários permitem retomar a edição quando ela estiver pronta.
