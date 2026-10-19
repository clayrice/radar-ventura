# Gestão da assinatura e fechamento diário

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
