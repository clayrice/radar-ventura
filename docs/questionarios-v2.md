# Questionários Ventura: revisão de 5 de outubro de 2026

Referência analisada: https://ventura-ai.com/plano-de-rota-IA. A leitura foi feita a partir da interface e do código público entregue pelo site, sem alterar o repositório ventura-ai-connect. Não foi acessada a lógica privada de geração da aplicação original.

## Plano de Rota

Mantém seis etapas: sua empresa, modelo de negócio, funcionamento operacional, fricções e gargalos, objetivo estratégico e maturidade em IA. Aproveita perguntas sobre receita, atividades recorrentes, dependência de pessoas, sistemas, horas, erros, atrasos, dados disponíveis e capacidade de adoção.

Amplia o diagnóstico com ambições de crescimento, novas ofertas, decisões, personalização e conhecimento da equipe. Pergunta o que a empresa gostaria de conseguir fazer e ainda não consegue. Acrescenta orçamento, prazo e medida de sucesso. Horas desconhecidas são armazenadas como nulas, sem confundir falta de informação com ausência de esforço.

A geração considera essas respostas e ordena três alternativas por prioridade. Cada alternativa preserva problema, solução, primeiro passo, métrica, esforço e três fases. Deve explicar a capacidade de IA útil ao projeto e validar hipóteses. Não estima retorno, economia ou integrações sem evidência. Parceiros são associados após a seleção editorial dos projetos.

## Ventura Semanal

Preserva setor, porte, público, objetivo, maturidade e até três áreas. Acrescenta escolhas sobre ambição, papel na empresa, tempo para testar e principal limitação. As respostas orientam a seleção das matérias e sugestões de ação. Cadastros anteriores continuam válidos; preferências ausentes não são inventadas.

## Publicação

Antes de publicar a revisão, aplicar `supabase/migrations/012_profile_preferences.sql` no projeto exclusivo Radar Ventura. A migração acrescenta uma coluna opcional e não apaga dados. O Plano de Rota utiliza os campos JSON existentes. Em seguida, publicar o aplicativo e conferir o salvamento autenticado dos dois formulários e a geração de uma edição e um plano de teste. Esta revisão não ativa envios recorrentes de email nem publicações no Instagram.
