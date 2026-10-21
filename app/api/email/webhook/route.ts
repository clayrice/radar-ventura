import {Resend} from 'resend';
import {adminDb,checked,isDemo} from '@/lib/db';
import {emailFeedback} from '@/lib/email-feedback-core';
export const runtime='nodejs';
export async function POST(req:Request){
 const secret=process.env.RESEND_WEBHOOK_SECRET||'';
 if(isDemo()||!secret||(process.env.UNSUBSCRIBE_SECRET||'').length<32||!process.env.EMAIL_FROM)return Response.json({error:'Indisponível'},{status:503});
 const id=req.headers.get('svix-id')||'',timestamp=req.headers.get('svix-timestamp')||'',signature=req.headers.get('svix-signature')||'';
 if(!id||id.length>200||!timestamp||!signature)return Response.json({error:'Não autorizado'},{status:401});
 const raw=await req.text();if(Buffer.byteLength(raw)>100000)return Response.json({error:'Evento muito grande'},{status:413});
 let event;try{event=new Resend('webhook-verification-only').webhooks.verify({payload:raw,headers:{id,timestamp,signature},webhookSecret:secret});}catch{return Response.json({error:'Não autorizado'},{status:401});}
 let feedback;try{feedback=emailFeedback(event);}catch{return Response.json({error:'Evento inválido'},{status:400});}
 if(!feedback)return Response.json({ok:true,ignored:true});
 try{checked(await adminDb().rpc('record_email_suppression',{recipient_fingerprint:feedback.fingerprint,suppression_reason:feedback.reason,event_key:id,provider_key:feedback.provider_id}));return Response.json({ok:true});}
 catch{return Response.json({error:'Registro pendente; repetir evento'},{status:503});}
}
