# Painel de operação

A página `/account/operacao` mostra dados agregados de conteúdo, assinaturas, filas, pagamentos, parceiros e cotas. É somente de consulta: não cobra, publica, executa rotinas ou reenvia mensagens.

## Acesso

Definir `OPS_ADMIN_EMAILS` somente no ambiente de produção, com os endereços verificados dos responsáveis, separados por vírgula. Vazio bloqueia todas as contas. Não usar variável NEXT_PUBLIC. A aplicação exige uma sessão confirmada por `auth.getUser`, endereço confirmado e presença exata na lista. Não consulta privilégios em user_metadata. O link de navegação só aparece às contas autorizadas e a consulta privilegiada tem sua própria verificação antes de criar a conexão administrativa. Previews devem permanecer sem essa lista.

Aplicar `026_operations_snapshot.sql` antes da publicação. A função só pode ser executada pela service role. Retorna contagens e histórico limitado; não retorna dados de pessoas, identificadores financeiros, payloads ou erros brutos do provedor. As permissões dos assinantes permanecem inalteradas.

## Leitura dos indicadores

O estado concluído da edição vem do registro conciliado, não do total isolado de posts. Os totais de hoje usam o horário de São Paulo. O histórico mostra sete edições e até doze execuções nos últimos sete dias. Uma execução concluída com fila vazia não é apresentada como entrega de e-mail.

Pendências incluem entregas em revisão/falha, pedidos em análise ou pendentes há mais de uma hora, eventos financeiros pendentes há mais de quinze minutos e execuções sem encerramento há mais de quinze minutos. Contadores de parceiros e de cotas ajudam a detectar ausência de recomendações e interrupção de novas gerações.

As flags mostram a configuração habilitada, separada dos números de entrega. Se a consulta falhar, a página informa indisponibilidade, sem substituir os valores por zero. As cotas exibidas refletem os limites atuais do código: dez chamadas de personalização e quarenta de notícias por ciclo diário. Isso não representa o saldo financeiro da hospedagem ou dos provedores.

O painel não envia alertas por e-mail. Pessoas responsáveis devem consultar a página e conferir o provedor antes de repetir uma operação financeira ou entrega em revisão. Não há botão para contornar o limite de idempotência.
