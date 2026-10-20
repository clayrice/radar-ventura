import 'server-only';
import {randomUUID} from 'node:crypto';
import {adminDb,checked,isDemo} from './db';
import {billingEmail,type BillingMailKind} from './billing-email-template';
import {retryDelivery} from './pipeline-core';
import {safeUrl} from './validation';
export function billingMailEnabled(){return !isDemo()&&process.env.EMAIL_SEND_ENABLED==='true'&&process.env.BILLING_EMAIL_SEND_ENABLED==='true';}
export async function runBillingMail(deadline=Date.now()+30000){
 if(!billingMailEnabled())return {status:'disabled',sent:0};
 if(!process.env.RESEND_API_KEY||!process.env.EMAIL_FROM||!safeUrl(process.env.APP_URL||''))throw Error('Financial email configuration incomplete');
 const db=adminDb(),owner=randomUUID();
 if(!checked(await db.rpc('acquire_job',{lock_name:'billing-mail',lock_owner:owner})))return {status:'busy',sent:0};
 let sent=0,review=0,failures=0,cancelled=0;
 try{
 const rows=checked(await db.from('billing_mail').select('*').in('status',['pending','sending']).order('created_at').limit(5));
 for(const row of rows||[]){
  if(Date.now()>deadline-12000)break;
  if((row.attempts||0)>=3){checked(await db.from('billing_mail').update({status:'review',last_error:'Delivery attempts exhausted; reconcile before resending'}).eq('id',row.id));review++;continue;}
  if(!retryDelivery(row.started_at)){checked(await db.from('billing_mail').update({status:'review',last_error:'Provider reconciliation required before retry: idempotency window expired'}).eq('id',row.id));review++;continue;}
  try{
   checked(await db.from('billing_mail').update({attempts:(row.attempts||0)+1}).eq('id',row.id));
   // Recheck the payment before every attempt, including a frozen retry.
   if(row.payment_id){const payment=checked(await db.from('payments').select('status').eq('id',row.payment_id).eq('order_id',row.order_id).maybeSingle());
    if((row.kind==='payment_failed'&&payment?.status==='paid')||(row.kind!=='payment_failed'&&payment?.status!=='paid')){checked(await db.from('billing_mail').update({status:'cancelled',last_error:null}).eq('id',row.id));cancelled++;continue;}
   }
   const order=checked(await db.from('orders').select('renewal_status').eq('id',row.order_id).eq('user_id',row.user_id).eq('product','weekly').maybeSingle());if(!order)throw Error('Financial order unavailable');
   if(row.kind==='payment_failed'&&order.renewal_status==='cancelled'){checked(await db.from('billing_mail').update({status:'cancelled',last_error:null}).eq('id',row.id));cancelled++;continue;}
   let payload=row.payload as Record<string,unknown>|null;
   if(!payload){
    const {data,error}=await db.auth.admin.getUserById(row.user_id);if(error||!data.user?.email)throw Error('Financial recipient unavailable');
    const sub=checked(await db.from('subscriptions').select('expires_at').eq('user_id',row.user_id).maybeSingle());
    payload={from:process.env.EMAIL_FROM,to:[data.user.email],...billingEmail(row.kind as BillingMailKind,process.env.APP_URL!,sub?.expires_at||null,order.renewal_status==='active')};
    checked(await db.from('billing_mail').update({status:'sending',payload,started_at:new Date().toISOString()}).eq('id',row.id));
   }
   const response=await fetch('https://api.resend.com/emails',{method:'POST',signal:AbortSignal.timeout(8000),headers:{Authorization:`Bearer ${process.env.RESEND_API_KEY}`,'Content-Type':'application/json','Idempotency-Key':`ventura-billing/${row.id}`},body:JSON.stringify(payload)});
   const receipt=await response.json();if(!response.ok||typeof receipt.id!=='string')throw Error('Financial provider failure');
   checked(await db.from('billing_mail').update({status:'sent',sent_at:new Date().toISOString(),provider_id:receipt.id,last_error:null}).eq('id',row.id));sent++;
  }catch{failures++;checked(await db.from('billing_mail').update({last_error:'Financial delivery pending; retry or reconcile provider'}).eq('id',row.id));}
 }
 return {status:'processed',sent,review,failures,cancelled};
 }finally{checked(await db.rpc('release_job',{lock_name:'billing-mail',lock_owner:owner}));}
}
