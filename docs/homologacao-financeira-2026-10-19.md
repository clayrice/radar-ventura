# Homologação financeira em 19/10/2026

## Ambiente e alcance

Asaas Sandbox autenticado pela responsável. Credencial temporária “Radar Ventura — homologação 19-10”, sem saque, com expiração em 20/10 às 23:59. O checkout foi criado pela função `createCheckout` do Radar, com o valor de R$ 9,90 e ciclo mensal. Foi utilizado cadastro fictício, endereço/cartão de exemplo e o e-mail de teste autorizado.

A persistência usou PostgreSQL local (PGlite), carregando todas as migrações do repositório, inclusive 022 e 023. Um adaptador local substituiu somente o transporte do cliente Supabase; as funções da aplicação e os procedimentos SQL foram executados. As chamadas externas do teste foram restritas ao domínio api-sandbox.asaas.com. Não houve acesso ao banco de produção, envio de edição, publicação no Instagram ou cobrança real.

## Resultados confirmados

- Checkout com recorrência mensal criado pela aplicação e concluído na interface do Sandbox. Interface exibiu “Pagamento confirmado”.
- Cobrança confirmada no provedor por R$ 9,90, vinculada ao checkout e à recorrência.
- Evento de pagamento entregue diretamente à função da rota de webhook em ambiente local, com autenticação, consulta à API real do Sandbox e aplicação da função SQL `confirm_payment`.
- Pedido marcado como pago e acesso ativo no banco isolado. Mesmo evento processado novamente sem duplicar o pagamento ou estender o período de acesso.
- Edição semanal enfileirada uma vez pelo procedimento SQL; nenhuma geração ou entrega por e-mail foi executada nesta homologação.
- Consulta do provedor confirmou recorrência MONTHLY, valor R$ 9,90 e próxima cobrança prevista para 19/11/2026, antes do cancelamento.
- `cancelWeeklyRenewal` removeu a recorrência no Sandbox. Uma repetição não criou nova operação. Estado local cancelled e período pago preservado integralmente.
- Estorno do pagamento fictício confirmado pela API. Conciliação da aplicação revogou o acesso no banco local conforme a regra existente.

## Proteção ajustada

A conclusão do cancelamento agora exige `deleted === true`. Uma resposta 200 sem esse campo mantém o pedido em análise, assim como uma rejeição explícita. A recuperação de um DELETE que já foi efetivado continua exigindo confirmação de exclusão/ausência em consulta posterior. O teste de cancelamento cobre a resposta ambígua e preserva o acesso pago.

## Limites e próximas validações

Esta prova não equivale a uma compra completa de produção. O evento foi entregue diretamente à função local, não por um webhook externo do Asaas atravessando a Netlify. A configuração de recorrência foi conferida, mas não ocorreu uma segunda cobrança mensal. Renovação efetiva, recusa de cartão, reenvio externo do webhook, geração semanal automática e entrega para o assinante pago ainda precisam de provas próprias.

Ainda pendentes: recibos financeiros transacionais; tratamento de cancelamento iniciado diretamente no painel Asaas; alerta para eventos não conciliados; observação da primeira entrega automática para um assinante pago. O diário geral permanece desativado.

Referências oficiais consultadas: [assinaturas com cartão](https://docs.asaas.com/docs/criando-assinatura-com-cartao-de-credito), [recursos de teste](https://docs.asaas.com/docs/o-que-pode-ser-testado) e [remoção da assinatura](https://docs.asaas.com/reference/remover-assinatura).
