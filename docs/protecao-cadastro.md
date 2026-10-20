# Proteção do cadastro gratuito

O cadastro mantém consentimento obrigatório, campo de detecção de preenchimento automatizado, respostas sem revelar se o endereço já existe e intervalo de dez minutos por e-mail. A migração 027 acrescenta limite atômico de seis tentativas por janela de dez minutos e trinta por ciclo diário de origem. O consumo do limite ocorre antes de criar/alterar o cadastro ou solicitar o envio.

## Origem e privacidade

Configurar `SIGNUP_TRUSTED_PROXY=netlify` somente na produção que usa a Netlify. A ação usa apenas o cabeçalho da conexão `x-nf-client-connection-ip`, recomendado pela plataforma para funções. Não aceita X-Forwarded-For, listas, portas, valores inválidos ou ausência de configuração. Sem origem válida ou segredo disponível, não cria cadastro e não envia confirmação. A identificação deve ser revisada ao mudar a hospedagem ou colocar outro proxy à frente.

O servidor cria um HMAC SHA-256 usando o segredo já existente, domínio de uso específico, data UTC e origem normalizada. O banco de limites recebe apenas o resultado criptográfico, contadores e horários; não recebe o IP em texto ou o e-mail. IPv6 é normalizado antes do cálculo. O identificador muda a cada data UTC (21h de Brasília). Os registros expiram em dois dias e são removidos na próxima tentativa de cadastro. A tabela e o procedimento só podem ser acessados pela service role.

Origens compartilhadas, como escritórios, compartilham o limite. Isso reduz abuso simples, mas não substitui proteção contra ataques distribuídos. Não há CAPTCHA ou nova conta de serviço nesta etapa.

## Implantação e validação

Aplicar `027_daily_signup_limits.sql` e configurar SIGNUP_TRUSTED_PROXY antes de publicar. Manter DAILY_EMAIL_SEND_ENABLED desligado até a homologação operacional. O painel restrito mostra se a configuração e a identificação de origem estão disponíveis, sem exibir o endereço de rede ou gravar uma tentativa.

Testes isolados verificam permissões SQL, limites, janela, expiração, normalização, rotação de identificador, rejeição de cabeçalhos alternativos, ausência de cadastro/envio ao bloquear e falha do banco. A publicação desta proteção não comprova uma entrega real nem altera o consentimento de assinantes existentes.

Referência oficial da plataforma: https://answers.netlify.com/t/x-forwarded-host/7104 (orientação da equipe Netlify sobre o cabeçalho de conexão em funções). API de contexto: https://docs.netlify.com/build/functions/api/.
