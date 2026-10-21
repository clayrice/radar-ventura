import 'server-only';
import {adminDb,checked} from './db';
import {assertEmailAllowed,EmailSuppressedError} from './email-suppression';
import {retryDelivery} from './pipeline-core';
import {editionEmail} from './email-template';
import {unsubscribeToken} from './unsubscribe';
import type {Edition} from './types';
const err=(e:unknown)=>e instanceof Error?e.message.slice(0,300):'Unknown failure';
export async function deliverWeekly(db:ReturnType<typeof adminDb>,deadline:number){if(process.env.EMAIL_SEND_ENABLED!=='true')return {sent:0,delivery:'disabled'};
 if(!process.env.RESEND_API_KEY||!process.env.EMAIL_FROM||!process.env.APP_URL)throw new Error('Email configuration incomplete');
 let sent=0;let review=0;
 const pending=checked(await db.from('editions').select('*').in('status',['ready','sending']).order('week_start').limit(3));
 for(const row of pending||[]){if(Date.now()>deadline)break;const e=row as Edition & {user_id:string;send_started_at:string|null;delivery_payload:Record<string,unknown>|null};
 const profile=checked(await db.from('profiles').select('email_opt_in').eq('user_id',e.user_id).maybeSingle());const sub=checked(await db.from('subscriptions').select('status').eq('user_id',e.user_id).maybeSingle());
 if(sub?.status!=='active'){checked(await db.from('editions').update({status:'cancelled'}).eq('id',e.id));continue;}
 if(!profile?.email_opt_in){checked(await db.from('editions').update({status:'available'}).eq('id',e.id));continue;}
 // Resend retains idempotency keys for 24h. After 23h, stop and require provider reconciliation.
 if(!retryDelivery(e.send_started_at)){review++;checked(await db.from('editions').update({status:'review',last_error:'Reconcile provider delivery before retrying: idempotency window expired'}).eq('id',e.id));continue;}
 try{
 let payload=e.delivery_payload;
 if(!payload){const {data,error}=await db.auth.admin.getUserById(e.user_id);if(error||!data.user?.email)throw new Error('Recipient not available');const unsubscribeUrl=new URL('/unsubscribe',process.env.APP_URL);unsubscribeUrl.searchParams.set('user',e.user_id);unsubscribeUrl.searchParams.set('token',unsubscribeToken(e.user_id));const body=editionEmail(e,process.env.APP_URL,unsubscribeUrl.toString());
 payload={from:process.env.EMAIL_FROM,to:[data.user.email],...body,headers:{'List-Unsubscribe':`<${unsubscribeUrl}>`,'List-Unsubscribe-Post':'List-Unsubscribe=One-Click'}};
 // Freeze the exact provider payload before the first request so retries cannot change recipient or content.
 checked(await db.from('editions').update({status:'sending',delivery_payload:payload,send_started_at:new Date().toISOString()}).eq('id',e.id));
 }
 await assertEmailAllowed(payload);
 const response=await fetch('https://api.resend.com/emails',{method:'POST',signal:AbortSignal.timeout(15000),headers:{Authorization:`Bearer ${process.env.RESEND_API_KEY}`,'Content-Type':'application/json','Idempotency-Key':`ventura-weekly/${e.id}`},body:JSON.stringify(payload)});
 const receipt=await response.json() as {id?:string};if(!response.ok||!receipt.id)throw new Error(`Email provider HTTP ${response.status}; delivery requires retry or reconciliation`);
 checked(await db.from('editions').update({status:'sent',sent_at:new Date().toISOString(),provider_id:receipt.id,last_error:null}).eq('id',e.id));sent++;
 }catch(error){if(error instanceof EmailSuppressedError){checked(await db.from('editions').update({status:'available',last_error:'Email blocked after permanent bounce or spam complaint; edition remains available on the site'}).eq('id',e.id));continue;}checked(await db.from('editions').update({last_error:err(error)}).eq('id',e.id));}}
 return {sent,delivery_review:review};
}
