# Radar Diário gratuito — validação pendente

Implementado na branch feature/daily-radar-signup. Não houve migração remota, deploy, ativação de envio ou alteração de pagamentos.

## Configuração

- Aplicar a migração 018_daily_subscribers.sql no Supabase do radar-ventura após revisão. As tabelas têm RLS e acesso exclusivo da service role; não usam usuários nem assinaturas pagas.
- Configurar NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY e SUPABASE_SERVICE_ROLE_KEY. DEMO_MODE=false no ambiente de validação conectado.
- Configurar APP_URL com HTTPS público, RESEND_API_KEY, EMAIL_FROM com domínio verificado e UNSUBSCRIBE_SECRET aleatório de pelo menos 32 caracteres. Manter o segredo estável para preservar links.
- Manter EMAIL_SEND_ENABLED=false e DAILY_EMAIL_SEND_ENABLED=false até validação autorizada. O formulário não salva nem envia quando os gates estão fechados. BILLING_ENABLED=false continua obrigatório durante validação.
- Preparar cron autenticado por CRON_SECRET (32+ caracteres) para GET /api/jobs/daily-email. Recomenda-se executar depois de /api/jobs/daily e repetir em intervalos de cinco minutos para retomar lotes. Não foi adicionado ao vercel.json, para não ativar rotina real. Horários do cron são UTC; o dia editorial é America/Sao_Paulo.
- Cadastrar ao menos um parceiro ativo com placement=newsletter e autorização editorial/comercial para destaque. Sem parceiro elegível, o e-mail mostra link ao diretório; nunca inventa patrocínio.
- Configurar rate limiting no provedor/WAF para o cadastro e monitorar abuso antes de exposição pública. A aplicação inclui honeypot e cooldown de dez minutos por endereço, mas isso não limita ataques distribuídos com endereços diferentes.

## Comportamento

Cadastro independente da assinatura semanal. O link de confirmação vale 24 horas, exige POST explícito e não é consumido por scanners de e-mail. Reinscrição rotaciona o nonce e exige nova confirmação. GET de cancelamento apenas mostra confirmação; POST cancela e suporta List-Unsubscribe=One-Click. Não há inscrição automática por login nem pagamento.

O job envia somente assinantes ativos e exatamente três notícias publicadas do dia. Links levam ao arquivo com âncoras por notícia; fontes originais permanecem nas matérias. Um lock de banco impede concorrência do job. Payloads ficam congelados e há chave única por assinante/dia e idempotency key no Resend. Retries com mais de 23 horas entram em review e exigem reconciliação no provedor antes de qualquer ação manual. Falhas são contabilizadas, sem expor e-mails ou tokens em respostas. Cancelamento é rechecado antes do envio; requisições já aceitas pelo provedor não podem ser retiradas.

## Checklist antes da ativação

Validar com destinatários de teste autorizados: cadastro, cooldown, link expirado, confirmação, reinscrição, cancelamento manual e one-click. Validar domínio/DNS no Resend, entrega e spam, renderização em clientes de e-mail e homepage em desktop/mobile. Confirmar cron/retries compatíveis com o plano de hospedagem. Revisar privacidade, retenção e monitoramento de bounces/complaints; webhook de supressão automática ainda não foi implementado. A leitura pagina assinantes em grupos de 100; cada execução tem orçamento de 45 segundos. Monitorar a duração e aumentar a frequência do cron conforme o tamanho da base.

Os testes locais usam providers simulados e PostgreSQL embarcado. Não comprovam conectividade ou entregabilidade de serviços reais.

## Verificação desta implementação

Em 09/10/2026: `npm test` (49 testes aprovados), `npm run typecheck` e `npm run build` aprovados. O comando de testes usa `node --import tsx` para evitar a dependência do socket IPC do launcher tsx em ambientes restritos. Inclui execução do fluxo real de entrega com banco/provedor simulados: gates fechados, lock, ausência de três notícias, apenas destinatários confirmados, payload preservado após timeout, prevenção de envio duplicado, cancelamento e revisão após expiração da janela de idempotência.

Não houve teste visual em navegador nem envio real. A validação de e-mail e homepage descrita no checklist permanece pendente.
