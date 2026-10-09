import {adminDb,checked,isDemo} from '@/lib/db';
import {validDailyToken} from '@/lib/daily-email-core';
import {escapeHtml as h} from '@/lib/validation';
export const dynamic='force-dynamic';
function page(title:string,body:string,status=200){return new Response(`<!doctype html><html lang="pt-BR"><head><meta name="viewport" content="width=device-width,initial-scale=1"><title>${h(title)}</title></head><body style="font:18px/1.6 Arial;max-width:600px;margin:60px auto;padding:24px"><h1>${h(title)}</h1>${body}<p><a href="/">Voltar ao Radar</a></p></body></html>`,{status,headers:{'Content-Type':'text/html; charset=utf-8','Cache-Control':'no-store','Referrer-Policy':'no-referrer','X-Robots-Tag':'noindex'}});}
async function handle(req:Request,context:{params:Promise<{action:string}>},mutate:boolean){
 const {action}=await context.params;const url=new URL(req.url),id=url.searchParams.get('id')||'',token=url.searchParams.get('token')||'';
 if(isDemo()||!['confirm','unsubscribe'].includes(action)||! /^[a-f0-9-]{36}$/.test(id))return page('Link inválido','<p>Solicite um novo cadastro na homepage.</p>',400);
 try{const db=adminDb(),row=checked(await db.from('daily_subscribers').select('*').eq('id',id).maybeSingle());
 if(!row||!validDailyToken(action as 'confirm'|'unsubscribe',id,row.nonce,token,process.env.UNSUBSCRIBE_SECRET||'')||(action==='confirm'&&(row.status==='unsubscribed'||Date.now()-new Date(row.requested_at).getTime()>86400000)))return page('Link inválido ou expirado','<p>Solicite um novo cadastro na homepage.</p>',400);
 if(!mutate)return page(action==='confirm'?'Confirmar Radar Diário?':'Cancelar Radar Diário?',`<form method="post"><button>${action==='confirm'?'Confirmar inscrição gratuita':'Cancelar inscrição'}</button></form>`);
 checked(await db.from('daily_subscribers').update(action==='confirm'?{status:'active',confirmed_at:new Date().toISOString()}:{status:'unsubscribed'}).eq('id',id).eq('nonce',row.nonce));
 return page(action==='confirm'?'Inscrição confirmada':'Inscrição cancelada',action==='confirm'?'<p>Você receberá as próximas edições do Radar Diário gratuito.</p>':'<p>Você não receberá mais o Radar Diário. A assinatura semanal é gerenciada separadamente.</p>');
 }catch{return page('Tente novamente','<p>Não foi possível atualizar sua inscrição.</p>',503);}
}
export const GET=(req:Request,context:{params:Promise<{action:string}>})=>handle(req,context,false);
export const POST=(req:Request,context:{params:Promise<{action:string}>})=>handle(req,context,true);
