import {adminDb,checked,isDemo} from '@/lib/db';
import {validDailyToken} from '@/lib/daily-email-core';
import {confirmationTestAllowed,dailyEnabled,sendDailyTest,sendDailyPreview,sendCancellationReceipt} from '@/lib/daily-mail';
import {radarPage as page} from '@/lib/radar-design';
export const dynamic='force-dynamic';
export const runtime='nodejs';
export const maxDuration=60;
async function handle(req:Request,context:{params:Promise<{action:string}>},mutate:boolean){
 const {action}=await context.params;const url=new URL(req.url),id=url.searchParams.get('id')||'',token=url.searchParams.get('token')||'';
 if(isDemo()||!['confirm','unsubscribe','test','preview'].includes(action)||! /^[a-f0-9-]{36}$/.test(id))return page('Link inválido','<p>Solicite um novo cadastro na homepage.</p>',400);
 try{const db=adminDb(),row=checked(await db.from('daily_subscribers').select('*').eq('id',id).maybeSingle());
 const purpose=action==='unsubscribe'?'unsubscribe':'confirm';
 if(!row||!validDailyToken(purpose,id,row.nonce,token,process.env.UNSUBSCRIBE_SECRET||'')||(purpose==='confirm'&&(row.status==='unsubscribed'||Date.now()-new Date(row.requested_at).getTime()>86400000)))return page('Link inválido ou expirado','<p>Este link não pode mais ser usado. Solicite um novo cadastro na homepage para receber outro.</p>',400);
 if(action==='test'||action==='preview'){
 if(!confirmationTestAllowed(row.email)||row.status!=='active')return page('Teste indisponível','<p>Este teste está restrito ao endereço autorizado e exige uma inscrição confirmada.</p>',403);
 if(!mutate)return page('Conferir sua edição','<p>Envie a edição de hoje apenas para o seu endereço de teste. Ela terá três notícias e o link para cancelar a inscrição.</p><form method="post"><button>Receber edição de teste</button></form>');
 const result=await (action==='preview'?sendDailyPreview(id,token):sendDailyTest(id,token));
 if(result.status==='sent'||result.status==='already_sent')return page('Edição de teste enviada','<p>Confira sua caixa de entrada. A edição tem três notícias com links para o Radar e o cancelamento no rodapé.</p><p class="notice">O envio automático para a base continua desativado.</p>');
 if(result.status==='waiting_for_three_articles')return page('A edição ainda está em preparação','<p>O Radar precisa ter exatamente três notícias publicadas hoje antes de enviar esta edição.</p>',409);
 return page('Teste indisponível','<p>Não foi feito um novo envio. A inscrição pode estar cancelada ou uma tentativa anterior pode precisar de revisão.</p>',409);
 }
 if(!mutate)return page(action==='confirm'?'Confirme seu Radar Diário':'Cancelar o Radar Diário?',action==='confirm'?'<p>Confirme que deseja receber o Radar Diário gratuito neste endereço.</p><form method="post"><button>Confirmar inscrição gratuita</button></form>':'<p>Ao confirmar, você deixa de receber o Radar Diário neste endereço. Pode se cadastrar novamente quando quiser.</p><form method="post"><button>Cancelar inscrição</button></form>');
 checked(await db.from('daily_subscribers').update(action==='confirm'?{status:'active',confirmed_at:new Date().toISOString()}:{status:'unsubscribed'}).eq('id',id).eq('nonce',row.nonce));
 if(action==='unsubscribe'&&row.status!=='unsubscribed'){
  try{await sendCancellationReceipt(row);}catch{console.warn('daily_cancellation_receipt_failed');}
 }
 return page(action==='confirm'?'Inscrição confirmada':'Inscrição cancelada',action==='confirm'?`<p>Seu cadastro no Radar Diário gratuito foi confirmado.</p>${dailyEnabled()?'<p>Você receberá as próximas edições neste endereço.</p>':'<p class="notice">O envio diário está em validação. Avisaremos quando as edições automáticas estiverem disponíveis.</p>'}`:'<p>Você deixou de receber o Radar Diário. Para voltar, basta fazer um novo cadastro na homepage.</p><p class="notice">A assinatura semanal é gerenciada separadamente.</p>');
 }catch{return page('Tente novamente','<p>Não foi possível concluir esta ação agora. Aguarde alguns minutos e tente novamente.</p>',503);}
}
export const GET=(req:Request,context:{params:Promise<{action:string}>})=>handle(req,context,false);
export const POST=(req:Request,context:{params:Promise<{action:string}>})=>handle(req,context,true);
