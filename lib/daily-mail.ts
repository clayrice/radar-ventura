import 'server-only';
import {randomUUID} from 'node:crypto';
import {adminDb,checked,isDemo} from './db';
import {dailyToken,dailyEmail} from './daily-email-core';
import {radarDate} from './radar-dates';
import {retryDelivery} from './pipeline-core';
import {safeUrl} from './validation';
import type {Article,Partner} from './types';
export function dailyEnabled(){return !isDemo()&&process.env.EMAIL_SEND_ENABLED==='true'&&process.env.DAILY_EMAIL_SEND_ENABLED==='true';}
export function dailyConfig(){if(!safeUrl(process.env.APP_URL||'')||!process.env.EMAIL_FROM||!process.env.RESEND_API_KEY||(process.env.UNSUBSCRIBE_SECRET||'').length<32)throw Error('Daily email configuration incomplete');}
export function dailyLink(action:'confirm'|'unsubscribe',row:{id:string;nonce:string}){const url=new URL(`/radar-diario/${action}`,process.env.APP_URL);url.searchParams.set('id',row.id);url.searchParams.set('token',dailyToken(action,row.id,row.nonce,process.env.UNSUBSCRIBE_SECRET!));return url.toString();}
export async function sendDailyPayload(payload:Record<string,unknown>,key:string){
 if(!dailyEnabled())throw Error('Daily delivery disabled');dailyConfig();
 const response=await fetch('https://api.resend.com/emails',{method:'POST',signal:AbortSignal.timeout(10000),headers:{Authorization:`Bearer ${process.env.RESEND_API_KEY}`,'Content-Type':'application/json','Idempotency-Key':key},body:JSON.stringify(payload)});
 const receipt=await response.json();if(!response.ok||!receipt.id)throw Error('Daily email provider failure');return receipt.id as string;
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
