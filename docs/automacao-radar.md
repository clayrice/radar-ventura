# Automação diária do Radar Ventura

A execução principal está configurada para 06h de São Paulo (09h UTC). A conta Vercel deste projeto está no plano Hobby, que pode iniciar o cron em qualquer minuto entre 06h e 06h59 e limita cada função a 60 segundos; para garantir o minuto exato e uma janela de execução maior, é necessário o plano Pro. A execução prepara exatamente três matérias com imagens da própria reportagem, publica no Radar e, no mesmo fluxo, cria e publica três posts no Instagram. As chamadas posteriores do dia retomam falhas e pendências da mesma edição, sem criar uma edição extra. A rotina só termina como `completed` após confirmar três matérias no Radar, três imagens de fonte e três posts do Instagram com arte.

O agendamento da Vercel usa UTC. Os horários posteriores configurados em `vercel.json` servem para recuperação: 08h, 09h, 11h, 14h, 17h e 20h em São Paulo. A edição selecionada é sempre a data atual de São Paulo; uma pendência antiga não toma o lugar das notícias do dia.

## Imagens das matérias

O coletor usa imagens associadas ao item do feed ou lê `og:image`/`twitter:image` da própria página da reportagem. O sistema guarda a URL e a origem (`feed` ou `article`) no banco. Para o Instagram, busca a foto no servidor, aplica o template aprovado pela Ventura AI e envia a arte pronta ao armazenamento do Supabase. Nada precisa ser baixado ou salvo no computador da Clarice.

Imagem ausente, inacessível ou de origem não confirmada impede a publicação. O sistema tenta recuperar a imagem em execuções posteriores. Depois de três falhas para um candidato, ele é descartado para que outra matéria possa ocupar a vaga. Não há arte tipográfica ou imagem gerada como substituta. O template mantém a foto da matéria em tela cheia, marca Ventura AI, data do Radar, categoria, título, fonte vertical e rodapé `@ventura_ai` / `Leia no Radar · link na bio ↗`.

## Instagram e conclusão

Uma vez configurados o identificador da conta, token e permissões de publicação da Meta, o fluxo diário publica automaticamente sem aprovação individual. `INSTAGRAM_PUBLISH_ENABLED=false` é apenas um interruptor de emergência; em produção, deve permanecer `true`. A publicação exige correspondência entre a imagem de fonte do artigo e a capa do post. Falhas ficam pendentes para retry e nunca contam como post confirmado.

Aplicar as migrações `011_instagram.sql`, `014_daily_completion.sql`, `015_image_completion.sql` e `016_source_images_required.sql` antes do deploy. `016` registra a origem das imagens, impede que matérias atuais sejam publicadas sem imagem da fonte e exige três imagens válidas e três posts confirmados na conclusão. A restrição histórica permanece preservada.

`job_runs` registra cada tentativa e `radar_editions` mantém status, próxima tentativa e métricas. Um erro de coleta, imagem, geração, API ou publicação deixa a edição como `pending` ou `blocked`; ela não é marcada concluída. O limite de chamadas de IA é independente das outras rotinas do produto.

## Horário

A Vercel executa expressões cron em UTC. Para publicar no minuto das 06h de São Paulo, o projeto precisa de plano Pro ou Enterprise, que tem precisão por minuto. No plano Hobby, a rotina diária pode iniciar em qualquer momento dentro da hora programada, até 59 minutos depois. A Vercel também exige novo deploy para registrar alterações de cron. Referências: [precisão e limites da Vercel Cron](https://vercel.com/docs/cron-jobs/usage-and-pricing) e [gerenciamento das tarefas](https://vercel.com/docs/cron-jobs/manage-cron-jobs).

O horário configurado representa o início do processamento. Coleta, redação, geração da arte e confirmação pela Meta levam tempo, então o sistema não promete que os três canais estejam visíveis exatamente às 06h.

## Conferência após implantação

1. Confirmar em Vercel que o cron diário `/api/jobs/daily` está ativo às 09:00 UTC e que o plano permite essa precisão.
2. Confirmar em produção as credenciais oficiais da Meta e `INSTAGRAM_PUBLISH_ENABLED=true`.
3. Executar a rota uma vez e conferir três artigos, cada um com `cover_origin` `feed` ou `article`, e três posts publicados com imagem no Instagram.
4. Repetir a execução: deve manter os mesmos três artigos e posts, sem duplicatas.
5. Verificar `radar_editions.status='completed'` apenas depois das confirmações nos dois canais.
