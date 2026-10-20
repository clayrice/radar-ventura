import {emailButton,emailFrame} from './radar-design';
import {escapeHtml as h,safeUrl} from './validation';
export type BillingMailKind='activated'|'renewed'|'payment_failed'|'cancelled';
export function billingEmail(kind:BillingMailKind,appUrl:string,paidUntil:string|null,autoRenew=true){
 if(!safeUrl(appUrl))throw Error('Public HTTPS APP_URL required');
 const account=new URL('/account/assinatura',appUrl).toString();
 const expiry=paidUntil?new Date(paidUntil):null;
 const active=!!expiry&&Number.isFinite(expiry.getTime())&&expiry.getTime()>Date.now();
 const date=active?expiry!.toLocaleDateString('pt-BR',{timeZone:'America/Sao_Paulo'}):null;
 const period=date?`Seu acesso ao período pago continua disponível até ${date}.`:'Consulte na sua conta a situação do seu acesso.';
 const messages:Record<BillingMailKind,{subject:string;title:string;paragraphs:string[]}>={
  activated:{subject:'Sua assinatura Ventura Semanal está ativa',title:'Bem-vindo ao Ventura Semanal.',paragraphs:['Seu pagamento de R$ 9,90 foi confirmado. Sua assinatura mensal está ativa.','Você receberá uma edição semanal de IA com análises e próximos passos para o seu negócio. Confira o perfil da empresa para personalizar o conteúdo.','As edições ficam disponíveis na sua conta. O recebimento por e-mail segue a preferência escolhida no perfil.',period,autoRenew?'O plano tem renovação mensal automática. Você pode cancelar a renovação em Minha assinatura.':'A renovação mensal já está cancelada. Seu período pago permanece disponível.']},
  renewed:{subject:'Pagamento confirmado: Ventura Semanal',title:'Sua assinatura foi renovada.',paragraphs:['Confirmamos o pagamento de R$ 9,90 referente ao novo período da sua assinatura mensal.',period,'Suas edições e as opções de renovação continuam disponíveis na conta.']},
  payment_failed:{subject:'Confira o pagamento do Ventura Semanal',title:'O pagamento precisa da sua atenção.',paragraphs:['Ainda não foi possível confirmar o pagamento da sua assinatura. Se você acabou de pagar, a atualização pode levar algum tempo.',period,'Abra Minha assinatura para conferir a situação ou fale com hello@ventura-ai.com. Evite criar uma segunda assinatura enquanto o pagamento estiver pendente.']},
  cancelled:{subject:'Renovação cancelada: Ventura Semanal',title:'Renovação cancelada.',paragraphs:['O cancelamento da renovação mensal foi confirmado. Não haverá novas cobranças desta recorrência.',period,'O cancelamento da renovação não solicita estorno de pagamentos anteriores. Para tratar de um pagamento, fale com hello@ventura-ai.com.']},
 };
 const message=messages[kind];if(!message)throw Error('Unknown financial message');
 const text=`${message.paragraphs.join('\n\n')}\n\nMinha assinatura: ${account}\n\nEsta é uma mensagem sobre sua assinatura. Ela não altera suas preferências de recebimento do Radar.\nVentura AI · IA com rumo.`;
 return {subject:message.subject,text,html:emailFrame(message.subject,message.paragraphs[0],`<p style="margin:0 0 12px;color:#524FF5;font:12px/18px Arial,sans-serif;letter-spacing:1px">VENTURA SEMANAL · SUA ASSINATURA</p><h1 style="margin:0 0 24px;font:600 28px/34px Arial,sans-serif">${h(message.title)}</h1>${message.paragraphs.map(p=>`<p style="margin:0 0 20px">${h(p)}</p>`).join('')}${emailButton('Minha assinatura',account)}`,`<p style="margin:0">Esta é uma mensagem sobre sua assinatura. Ela não altera suas preferências de recebimento do Radar.</p><p style="margin:12px 0 0">Precisa de ajuda? <a href="mailto:hello@ventura-ai.com" style="color:#DBFF4F">hello@ventura-ai.com</a></p>`,appUrl)};
}
