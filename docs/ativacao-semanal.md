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
