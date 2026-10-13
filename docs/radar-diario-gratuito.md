# Radar Diário gratuito — validação pendente

Implementado na branch feature/daily-radar-signup e publicado após aprovação. Em 13/10/2026, a migração 020 foi aplicada no Supabase do Radar. Cadastro, entrega da confirmação na caixa de entrada e confirmação por POST foram validados com um único endereço autorizado. Envios automáticos e pagamentos permanecem desativados.

## Configuração

- Aplicar a migração 020_daily_subscribers.sql no Supabase do radar-ventura após revisão. As tabelas têm RLS e acesso exclusivo da service role; não usam usuários nem assinaturas pagas.
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

## Teste restrito de confirmação

Para validar somente o e-mail de confirmação: manter EMAIL_SEND_ENABLED=false, DAILY_EMAIL_SEND_ENABLED=false e BILLING_ENABLED=false. Configurar DAILY_CONFIRMATION_TEST_ENABLED=true e DAILY_CONFIRMATION_TEST_EMAIL com o único endereço autorizado para teste. Esse modo permite cadastro e confirmação apenas para esse endereço; não habilita o digest diário. Exige a migração 020 e todas as credenciais normais do Supabase/Resend. Após validar confirmação e cancelamento, retornar DAILY_CONFIRMATION_TEST_ENABLED=false e remover o endereço de teste. Não versionar credenciais ou endereços pessoais.

## Validação manual da edição e identidade visual

As mensagens de confirmação e as edições diária e semanal usam a logo oficial fornecida no projeto, sem recriação tipográfica. As páginas de confirmação, cancelamento, erro e teste seguem o cabeçalho preto e as cores dos sites Ventura AI e Radar. O template usa tabelas e estilos inline, com fontes de apoio e fundo sólido quando o cliente não suporta gradientes. As páginas web são responsivas. Ainda é necessário conferir a renderização em clientes reais de e-mail.

Para testar a edição com a newsletter automática bloqueada, use o link da confirmação recebida, substituindo apenas o caminho /radar-diario/confirm por /radar-diario/test. GET mostra a confirmação de envio; POST envia exclusivamente ao assinante ativo cuja identidade corresponde a DAILY_CONFIRMATION_TEST_EMAIL, com a flag DAILY_CONFIRMATION_TEST_ENABLED=true. Exige o token válido da confirmação, com validade de 24 horas. Não aceita destinatários fornecidos na requisição. O cron não executa esse modo. A edição exige exatamente três artigos publicados na data de Brasília, usa os mesmos links e seleção de parceiro da rotina diária e inclui o cancelamento assinado.

O teste compartilha lock, payload congelado e registro de entrega com a rotina diária. Assim, a execução repetida não reenvia a mesma edição. Confere o status e nonce do assinante antes de enviar. Uma entrega com mais de 23 horas em tentativa vai para revisão. Após validar a edição e o cancelamento, desativar DAILY_CONFIRMATION_TEST_ENABLED. Ativação pública, cron e pagamentos exigem validação e autorização próprias. Se não existir parceiro elegível, mostrar o diretório, sem inventar patrocínio.

O cancelamento confirmado também gera um recibo transacional com o mesmo design, quando o envio está autorizado pela configuração de produção ou pelo endereço de teste. GET não cancela nem envia recibo. POST repetido não repete o recibo; a chave de idempotência é vinculada ao nonce. Falha no recibo não impede o cancelamento, e o log não expõe dados pessoais.
