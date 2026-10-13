import 'server-only';
import {randomUUID} from 'node:crypto';
import {adminDb,checked,isDemo} from './db';
import {dailyToken,dailyEmail,validDailyToken} from './daily-email-core';
import {radarDate} from './radar-dates';
import {retryDelivery} from './pipeline-core';
import {safeUrl} from './validation';
import type {Article,Partner} from './types';
import {cancellationEmail} from './radar-design';
export function dailyEnabled(){return !isDemo()&&process.env.EMAIL_SEND_ENABLED==='true'&&process.env.DAILY_EMAIL_SEND_ENABLED==='true';}
export function confirmationTestAllowed(email:string){return !isDemo()&&process.env.DAILY_CONFIRMATION_TEST_ENABLED==='true'&&email.trim().toLowerCase()===(process.env.DAILY_CONFIRMATION_TEST_EMAIL||'').trim().toLowerCase();}
export function confirmationEnabled(email:string){return dailyEnabled()||confirmationTestAllowed(email);}
export function dailyConfig(){if(!safeUrl(process.env.APP_URL||'')||!process.env.EMAIL_FROM||!process.env.RESEND_API_KEY||(process.env.UNSUBSCRIBE_SECRET||'').length<32)throw Error('Daily email configuration incomplete');}
export function dailyLink(action:'confirm'|'unsubscribe',row:{id:string;nonce:string}){const url=new URL(`/radar-diario/${action}`,process.env.APP_URL);url.searchParams.set('id',row.id);url.searchParams.set('token',dailyToken(action,row.id,row.nonce,process.env.UNSUBSCRIBE_SECRET!));return url.toString();}
export async function sendDailyPayload(payload:Record<string,unknown>,key:string){
 if(!dailyEnabled())throw Error('Daily delivery disabled');return sendPayload(payload,key);
}
export async function sendConfirmationPayload(email:string,payload:Record<string,unknown>,key:string){
 if(!confirmationEnabled(email))throw Error('Confirmation delivery disabled');
 if(JSON.stringify(payload.to)!==JSON.stringify([email]))throw Error('Confirmation recipient mismatch');
 return sendPayload(payload,key);
}
export async function sendCancellationReceipt(row:{email:string;nonce:string}){
 if(!confirmationEnabled(row.email))return;
 return sendConfirmationPayload(row.email,{from:process.env.EMAIL_FROM,to:[row.email],...cancellationEmail(process.env.APP_URL!)},`ventura-daily-cancel/${row.nonce}`);
}
async function sendPayload(payload:Record<string,unknown>,key:string){
 dailyConfig();
 const response=await fetch('https://api.resend.com/emails',{method:'POST',signal:AbortSignal.timeout(10000),headers:{Authorization:`Bearer ${process.env.RESEND_API_KEY}`,'Content-Type':'application/json','Idempotency-Key':key},body:JSON.stringify(payload)});
 const receipt=await response.json();if(!response.ok||!receipt.id)throw Error('Daily email provider failure');return receipt.id as string;
}
// Manual validation uses the existing recipient allowlist and a confirmation token.
// It never opens the production delivery gates or runs from the cron endpoint.
export async function sendDailyTest(id:string,token:string){
 if(isDemo()||! /^[a-f0-9-]{36}$/.test(id))return {status:'disabled'};
 const db=adminDb(),owner=randomUUID(),date=radarDate();
 const row=checked(await db.from('daily_subscribers').select('*').eq('id',id).maybeSingle());
 if(!row||!confirmationTestAllowed(row.email)||row.status!=='active'||Date.now()-new Date(row.requested_at).getTime()>86400000||!validDailyToken('confirm',id,row.nonce,token,process.env.UNSUBSCRIBE_SECRET||''))return {status:'disabled'};
 dailyConfig();
 if(!checked(await db.rpc('acquire_job',{lock_name:'daily-email',lock_owner:owner})))return {status:'busy'};
 try{
 const articles=checked(await db.from('articles').select('*').eq('status','published').eq('radar_date',date).order('id').limit(4)) as Article[];
 if(articles.length!==3)return {status:'waiting_for_three_articles'};
 let delivery=checked(await db.from('daily_deliveries').select('*').eq('subscriber_id',id).eq('radar_date',date).maybeSingle());
 if(delivery&&delivery.status!=='sending')return {status:delivery.status==='sent'?'already_sent':delivery.status};
 if(delivery&&!retryDelivery(delivery.started_at)){
  checked(await db.from('daily_deliveries').update({status:'review'}).eq('subscriber_id',id).eq('radar_date',date));
  return {status:'review'};
 }
 if(!delivery){
 const partners=checked(await db.from('partners').select('*').eq('active',true).eq('placement','newsletter').or(`expires_at.is.null,expires_at.gt.${new Date().toISOString()}`).order('id').limit(1)) as Partner[];
 const unsubscribe=dailyLink('unsubscribe',row);
 const payload={from:process.env.EMAIL_FROM,to:[row.email],...dailyEmail(date,articles,partners[0]||null,process.env.APP_URL!,unsubscribe),headers:{'List-Unsubscribe':`<${unsubscribe}>`,'List-Unsubscribe-Post':'List-Unsubscribe=One-Click'}};
 delivery=checked(await db.from('daily_deliveries').insert({subscriber_id:id,radar_date:date,payload}).select('*').single());
 }
 const current=checked(await db.from('daily_subscribers').select('*').eq('id',id).single());
 if(current?.status!=='active'||current.nonce!==row.nonce||!confirmationTestAllowed(current.email)){
 checked(await db.from('daily_deliveries').update({status:'cancelled'}).eq('subscriber_id',id).eq('radar_date',date));return {status:'cancelled'};
 }
 if(JSON.stringify(delivery.payload.to)!==JSON.stringify([current.email]))throw Error('Test recipient mismatch');
 const receipt=await sendConfirmationPayload(current.email,delivery.payload,`ventura-daily/${date}/${id}`);
 checked(await db.from('daily_deliveries').update({status:'sent',provider_id:receipt}).eq('subscriber_id',id).eq('radar_date',date));
 return {status:'sent'};
 }finally{checked(await db.rpc('release_job',{lock_name:'daily-email',lock_owner:owner}));}
}
export async function runDailyMail(){
 if(!dailyEnabled())return {status:'disabled',sent:0};dailyConfig();
 const db=adminDb(),owner=randomUUID(),date=radarDate(),deadline=Date.now()+45000;
 if(!checked(await db.rpc('acquire_job',{lock_name:'daily-email',lock_owner:owner})))return {status:'busy',sent:0};
 try{
 const articles=checked(await db.from('articles').select('*').eq('status','published').eq('radar_date',date).order('id').limit(4)) as Article[];
 if(articles.length!==3)return {status:'waiting_for_three_articles',sent:0};
 const partners=checked(await db.from('partners').select('*').eq('active',true).eq('placement','newsletter').or(`expires_at.is.null,expires_at.gt.${new Date().toISOString()}`).order('id').limit(1)) as Partner[];
 let sent=0,review=0,failures=0;
 for(let offset=0;Date.now()<deadline;offset+=100){
 const rows=checked(await db.from('daily_subscribers').select('*').eq('status','active').order('id').range(offset,offset+99))||[];
 if(!rows.length)break;
 for(const subscriber of rows){if(Date.now()>deadline)break;
 let delivery=checked(await db.from('daily_deliveries').select('*').eq('subscriber_id',subscriber.id).eq('radar_date',date).maybeSingle());
 if(delivery&&delivery.status!=='sending')continue;
 if(delivery&&!retryDelivery(delivery.started_at)){checked(await db.from('daily_deliveries').update({status:'review'}).eq('subscriber_id',subscriber.id).eq('radar_date',date));review++;continue;}
 if(!delivery){const unsubscribe=dailyLink('unsubscribe',subscriber);const payload={from:process.env.EMAIL_FROM,to:[subscriber.email],...dailyEmail(date,articles,partners[0]||null,process.env.APP_URL!,unsubscribe),headers:{'List-Unsubscribe':`<${unsubscribe}>`,'List-Unsubscribe-Post':'List-Unsubscribe=One-Click'}};delivery=checked(await db.from('daily_deliveries').insert({subscriber_id:subscriber.id,radar_date:date,payload}).select('*').single());}
 const current=checked(await db.from('daily_subscribers').select('status').eq('id',subscriber.id).single());
 if(current?.status!=='active'){checked(await db.from('daily_deliveries').update({status:'cancelled'}).eq('subscriber_id',subscriber.id).eq('radar_date',date));continue;}
 try{const id=await sendDailyPayload(delivery.payload,`ventura-daily/${date}/${subscriber.id}`);checked(await db.from('daily_deliveries').update({status:'sent',provider_id:id}).eq('subscriber_id',subscriber.id).eq('radar_date',date));sent++;}catch{failures++;/* Preserve frozen payload and retry only inside the provider idempotency window. */}
 }
 if(rows.length<100)break;
 }
 return {status:'processed',sent,review,failures};
 }finally{checked(await db.rpc('release_job',{lock_name:'daily-email',lock_owner:owner}));}
}
