import {createHmac} from 'node:crypto';
import {z} from 'zod';
const address=z.email().max(254);
export function emailFingerprint(value:string,secret=process.env.UNSUBSCRIBE_SECRET||''){
 if(secret.length<32)throw Error('Email protection configuration incomplete');
 const email=address.parse(value.trim().toLowerCase());
 return createHmac('sha256',secret).update(`email-suppression/v1/${email}`).digest('hex');
}
function mailbox(value:string){return address.safeParse((value.match(/<([^<>]+)>$/)?.[1]||value).trim().toLowerCase());}
export function emailFeedback(event:unknown,sender=process.env.EMAIL_FROM||''){
 const envelope=z.object({type:z.string(),data:z.object({from:z.string(),to:z.array(z.string()).min(1).max(50),email_id:z.string().min(1).max(200),bounce:z.object({type:z.string()}).optional()})}).safeParse(event);
 if(!envelope.success)throw Error('Invalid email event');
 const {type,data}=envelope.data,expected=mailbox(sender),actual=mailbox(data.from);
 if(!expected.success)throw Error('Email sender configuration incomplete');
 if(!actual.success||actual.data!==expected.data)return null;
 if(type!=='email.complained'&&!(type==='email.bounced'&&data.bounce?.type==='Permanent'))return null;
 // Every Radar email has exactly one recipient. Never suppress a whole recipient list.
 if(data.to.length!==1||!address.safeParse(data.to[0]).success)throw Error('Invalid email recipient');
 return {fingerprint:emailFingerprint(data.to[0]),reason:type==='email.complained'?'complaint':'hard_bounce',provider_id:data.email_id};
}
