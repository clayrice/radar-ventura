# Devoluções permanentes e reclamações

A aplicação recebe `email.bounced` com `bounce.type=Permanent` e `email.complained` em `/api/email/webhook`. Usa o SDK Resend já instalado para conferir a assinatura sobre o corpo original, os três cabeçalhos Svix e a validade temporal. Sem assinatura válida, não acessa o banco. Falhas ao persistir retornam 503 para solicitar nova tentativa ao provedor.

Só processa o endereço de remetente configurado em EMAIL_FROM e mensagens com exatamente um destinatário. Outros remetentes são ignorados, incluindo o SMTP de acesso do Supabase. O remetente do Radar deve ser exclusivo deste projeto dentro da conta Resend. Eventos de entrega, atrasos e devoluções temporárias não removem bloqueios.

## Dados e comportamento

A tabela privada email_suppressions guarda HMAC do endereço normalizado, motivo, referências do evento/provedor e horários. Não guarda endereço em texto, assunto ou conteúdo. Somente a service role tem acesso. Repetições não duplicam registros; uma devolução posterior não rebaixa uma reclamação de spam.

O HMAC usa UNSUBSCRIBE_SECRET com domínio de uso específico e sem rotação diária. Trocar esse segredo requer reconciliar previamente os bloqueios, pois os identificadores mudarão. Não há remoção automática, botão de reativação ou reativação por novo cadastro. Não adicionar um fluxo de desbloqueio sem conferir a situação no provedor e a autorização do titular.

Todos os envios da aplicação consultam a tabela imediatamente antes de chamar Resend, inclusive quando o payload já estava congelado para reenvio. A consulta não modifica esse payload nem a chave de idempotência. Falha de banco impede o envio.

- Diário: entrega bloqueada fica cancelada. Consentimento e cadastro existentes são preservados.
- Semanal: edição fica disponível no site, sem nova tentativa de envio automático dessa edição.
- Financeiro: aviso bloqueado fica em revisão. Não cancela pagamento, renovação ou período de acesso.
- Confirmação, cancelamento gratuito e prévias: não enviam ao endereço bloqueado.

O painel restrito mostra somente o total de endereços bloqueados e um aviso. “Retorno de e-mails” indica a presença do segredo na configuração; não comprova que o webhook está cadastrado ou que houve entrega externa.

## Implantação

1. Aplicar `028_email_suppressions.sql` antes da publicação, pois os remetentes passam a consultar a tabela.
2. Publicar o código e confirmar que a rota sem assinatura responde 401 depois de configurada (503 enquanto não configurada).
3. No Resend, criar um webhook do Radar com a URL formada por APP_URL e o caminho `/api/email/webhook`, somente com `email.bounced` e `email.complained`.
4. Salvar o segredo de assinatura desse endpoint como RESEND_WEBHOOK_SECRET apenas na produção da Netlify. Não usar a chave da API como segredo de assinatura. Publicar novamente para carregar a variável.
5. Conferir a conexão sem inserir endereços fictícios na produção nem executar disparos gerais. Eventos reais anteriores à criação não são importados automaticamente; a conferência histórica e um eventual replay precisam ser tratados separadamente no provedor.

Esta proteção cobre envios feitos pela aplicação. O SMTP de autenticação do Supabase é uma integração separada e continua sujeito aos controles do próprio Resend. Um evento pode chegar durante um envio já em andamento; a consulta impede as próximas tentativas, sem prometer recolher uma mensagem já aceita pelo provedor.

Os gates de envio diário geral e avisos financeiros não são habilitados por esta implantação. Não envolve cobrança real ou upgrade de hospedagem.

## Referências e validação

[Verificação de assinatura](https://resend.com/docs/webhooks/verify-webhooks-requests), [devolução permanente](https://resend.com/docs/webhooks/emails/bounced) e [reclamação](https://resend.com/docs/webhooks/emails/complained), documentação oficial Resend.

Testes usam eventos assinados localmente e transporte simulado, sem chamar o provedor. Conferem corpo alterado, assinatura expirada, remetente diferente, múltiplos destinatários, falha de banco, bloqueio antes do provedor, conteúdo congelado, idempotência SQL, precedência da reclamação e permissões de acesso. Não equivalem à homologação de um retorno externo real.
