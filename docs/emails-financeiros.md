# E-mails da assinatura semanal

## Mensagens

A identidade usa o modelo transacional existente: logo oficial sobre fundo preto, conteúdo branco e botão índigo para Minha assinatura. Não reutiliza o cabeçalho editorial com degradê. Há HTML e texto simples para ativação, renovação, pagamento pendente e cancelamento da renovação.

A ativação informa R$ 9,90/mês, renovação automática e preferência de recebimento das edições. Quando a renovação já foi cancelada antes do envio, a mensagem informa esse estado. O cancelamento preserva o período pago e explica que não solicita estorno. O aviso de pagamento pendente orienta a conferir a conta sem criar uma segunda assinatura. São mensagens financeiras, separadas do consentimento para receber edições.

## Fila e entrega

Aplicar `024_billing_mail.sql` e `025_billing_mail_attempts.sql` antes do código. A fila privada `billing_mail` é criada na mesma transação do pagamento confirmado ou da mudança de renovação. Inserções repetidas não duplicam avisos. A tabela e os procedimentos não estão disponíveis a usuários anônimos ou autenticados; somente a service role opera a fila.

Cobranças vencidas e eventos autenticados PAYMENT_CREDIT_CARD_CAPTURE_REFUSED com cobrança ainda PENDING são conferidos na API Asaas antes de enfileirar o aviso. Pagamentos já confirmados não geram aviso de falha. O webhook Asaas precisa incluir PAYMENT_OVERDUE e PAYMENT_CREDIT_CARD_CAPTURE_REFUSED, preservando os eventos existentes.

A função Netlify radar-billing-email agenda a rota autenticada `/api/jobs/billing-email` às 11h30–23h30 UTC, a cada hora (08h30–20h30 em São Paulo). Não cria cobranças. Processa até cinco mensagens por execução, com lock próprio e orçamento de tempo.

O envio exige EMAIL_SEND_ENABLED=true e BILLING_EMAIL_SEND_ENABLED=true, fora do modo demonstrativo, além de APP_URL HTTPS, EMAIL_FROM e RESEND_API_KEY. A flag é verificada tanto antes de criar trabalho em segundo plano quanto na rota. Previews devem permanecer sem envio habilitado.

O destinatário vem do cadastro de autenticação. Antes da primeira tentativa, o payload é congelado no banco. Retentativas usam o mesmo conteúdo e a mesma chave Resend `ventura-billing/{id}`. Após três tentativas sem confirmação, o aviso vai para review para não bloquear os próximos destinatários. Depois de 23 horas, o aviso vai para review; não deve ser reenviado antes de conferir o provedor. A janela de idempotência do Resend é de 24 horas.

Avisos de ativação/renovação cujo pagamento foi revogado são cancelados. Avisos de falha são cancelados quando a cobrança já foi paga ou a renovação encerrada. O agendamento não altera o gate do diário gratuito nem o envio das edições semanais.

## Validação e limites

Testes isolados cobrem migrações reais PostgreSQL, privacidade, atomicidade, ativação/renovação, deduplicação, autenticação da rota, gates, falha do provedor, payload congelado, janela de revisão e supressão de avisos resolvidos. Nenhum teste deve chamar Resend ou Asaas de produção. Os HTMLs de prévia podem ser gerados diretamente pela função billingEmail; a criação da fila não cria pedidos fictícios na produção.

A conferência visual automática dos arquivos locais foi bloqueada pela política do navegador. O layout reutiliza o modelo transacional já aprovado, mas a aparência das novas mensagens em Gmail/Outlook não foi homologada nesta etapa. Não foi feito pagamento real; o ciclo de produção permanece sem essa prova.

Referências: https://docs.asaas.com/docs/criar-cobran%C3%A7a-com-3ds e https://resend.com/changelog/idempotency-keys.
