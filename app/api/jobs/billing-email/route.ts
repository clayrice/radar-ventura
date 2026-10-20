import {timingSafeEqual} from 'node:crypto';
import {runBillingMail} from '@/lib/billing-mail';
export const runtime='nodejs';export const maxDuration=60;export const dynamic='force-dynamic';
export async function GET(req:Request){const secret=process.env.CRON_SECRET||'',supplied=req.headers.get('authorization')||'',expected=`Bearer ${secret}`;if(secret.length<32)return Response.json({error:'Unavailable'},{status:503});if(Buffer.byteLength(supplied)!==Buffer.byteLength(expected)||!timingSafeEqual(Buffer.from(supplied),Buffer.from(expected)))return Response.json({error:'Unauthorized'},{status:401});try{return Response.json(await runBillingMail());}catch{return Response.json({error:'Financial email failed'},{status:500});}}
