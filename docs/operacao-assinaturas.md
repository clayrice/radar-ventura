# Gestão da assinatura e fechamento diário

## Estado verificado em 19/10/2026

PR #15 integrado e publicado na Netlify em `70ebf4e`. Migrações 022 e 023 aplicadas no Supabase. Conciliação administrativa das edições de 16 a 19/10 confirmada, sem republicação. A página `/account/assinatura` foi conferida na conta autenticada: sem período pago ativo, coerente com a ausência de pedidos. A primeira navegação após o deploy manteve um 404 antigo em cache; uma nova navegação carregou a página correta. Isso não valida uma compra ou um cancelamento real.

## Agendamento do diário por e-mail

`radar-daily-email` chama a rota existente `/api/jobs/daily-email` por meio do worker autenticado. Executa às 09:45, 11:45, 12:45, 14:45, 17:45, 20:45 e 23:45 UTC (06:45 a 20:45 em São Paulo), depois das tentativas de coleta. O registro por assinante/data e a chave de idempotência existentes impedem a repetição de entregas já confirmadas. A rota aguarda exatamente três matérias publicadas, sem depender do horário de publicação no Instagram.

O disparador não cria trabalho em segundo plano enquanto `DAILY_EMAIL_SEND_ENABLED` e `EMAIL_SEND_ENABLED` não forem ambos `true`, ou em modo demonstrativo. A própria rota verifica essas permissões novamente. O diário geral permanece desativado nesta implantação. Antes de liberar: validar uma entrega autorizada, confirmar cadastro/cancelamento e supressões, revisar destinatários e monitorar o primeiro lote. Não executar manualmente o job com destinatários reais como teste de infraestrutura.

## Implantação

Aplicar, nesta ordem, `022_reconcile_daily_completion.sql` e `023_subscription_cancellation.sql` no Supabase do Radar antes de publicar a aplicação. As alterações acrescentam uma função restrita à service role e três colunas de controle da renovação. Não geram cobrança, publicação ou envio. A função de conciliação apenas marca uma edição concluída quando já existem três matérias, três fotos de origem e três posts confirmados da mesma conta e data. O trigger do banco continua conferindo a conclusão.

Depois da migração e do deploy, conferir `/account/assinatura`. Ela deve continuar acessível quando novas vendas estiverem temporariamente bloqueadas. Não executar um cancelamento de produção para testar; usar um ambiente de homologação ou uma assinatura de teste especificamente autorizada.

## Cancelamento

O cliente entra na conta, abre Minha assinatura e confirma “Sim, cancelar renovação”. A API exige login, origem do próprio site, confirmação explícita e um pedido pago do produto semanal pertencente à pessoa autenticada. O identificador da recorrência é obtido do banco; não é aceito do navegador.

Antes de chamar o Asaas, o pedido fica em `cancel_requested`. O resultado só muda para `cancelled` depois de o provedor confirmar a operação. Um lock por pedido reduz concorrência. Timeout ou erro mantém a indicação de análise e permite nova conferência. Uma repetição após o provedor já remover a recorrência verifica sua ausência antes de concluir o estado local.

A remoção da recorrência encerra novas cobranças e remove cobranças pendentes ou vencidas vinculadas, conforme a referência do Asaas. Não solicita estorno de pagamentos anteriores. O período pago e os registros financeiros permanecem preservados; o acesso termina pelo mecanismo de expiração já existente. O cancelamento de recebimento de e-mail continua separado.

A tela consulta a próxima data de cobrança no Asaas quando existe uma recorrência ativa. Se o provedor estiver indisponível, a tela mantém a consulta ao período pago e a opção de cancelamento.

A contratação não permite uma segunda assinatura semanal enquanto o período pago ainda estiver ativo. Após o término, um pedido com renovação já cancelada não bloqueia uma nova contratação. Pedidos ainda ativos ou em análise continuam exigindo resolução antes de uma nova cobrança.

## Rotina diária em duas hospedagens

A Netlify continua coletando e a Vercel continua publicando no Instagram. No início do coletor, a aplicação tenta conciliar o estado com os posts já confirmados. Depois da publicação, a rota do Instagram também concilia a edição. Nenhuma dessas consultas publica um novo post; a publicação permanece na rotina existente.

Para corrigir registros históricos pendentes, usar apenas a função de conciliação com as datas revisadas. Não executar o publicador de Instagram para corrigir um estado administrativo.

## Validação

79 testes passaram, incluindo integração SQL das migrações e conciliação, propriedades do pedido, origem, autenticação, confirmação, falha do provedor, repetição e preservação do acesso pago. Build e TypeScript aprovados após a implementação completa desta etapa. A implantação e a homologação contra um provedor real devem ser registradas separadamente.

Ainda pendentes desta frente: recibos transacionais de ativação/cancelamento financeiro, confirmação por webhook de cancelamento feito diretamente no Asaas, ciclo completo de uma compra real autorizada e painel operacional. A implantação desta etapa não ativa o diário geral nem altera os limites de geração.

Referência: https://docs.asaas.com/reference/remover-assinatura

## Cancelamento iniciado no Asaas

A rota de webhook trata `SUBSCRIPTION_DELETED` e localiza um pedido semanal pela recorrência armazenada no banco. Confere a remoção por consulta ao Asaas (`deleted=true` ou 404), usa o mesmo lock do cancelamento pela conta e atualiza somente renovação, data de cancelamento e erro. Não altera pagamento ou período de acesso. Também reconhece a recorrência se um estorno já tiver mudado o status financeiro do pedido.

Pedido ainda desconhecido, remoção não confirmada ou indisponibilidade do provedor mantêm o evento pendente e retornam 503 para nova tentativa. Eventos concluídos são deduplicados. Para receber esse tratamento, a configuração do webhook no Asaas precisa incluir SUBSCRIPTION_DELETED. A entrega externa deste evento deve ser validada separadamente; testes locais não comprovam o transporte Asaas → Netlify.

Referência: https://docs.asaas.com/docs/eventos-para-assinaturas
