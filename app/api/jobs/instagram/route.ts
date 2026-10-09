import {timingSafeEqual} from 'node:crypto';
import {runInstagram} from '@/lib/instagram';
import {radarDate} from '@/lib/radar-dates';
export const runtime='nodejs';
export const maxDuration=60;
export const dynamic='force-dynamic';
export async function GET(req:Request){
 const secret=process.env.CRON_SECRET;
 if(!secret||secret.length<32)return Response.json({error:'Job unavailable'},{status:503});
 const supplied=req.headers.get('authorization')||'';const expected=`Bearer ${secret}`;
 if(Buffer.byteLength(supplied)!==Buffer.byteLength(expected)||!timingSafeEqual(Buffer.from(supplied),Buffer.from(expected)))return Response.json({error:'Unauthorized'},{status:401});
 const today=radarDate();const date=new URL(req.url).searchParams.get('date')||today;
 const days=Math.floor((Date.parse(`${today}T00:00:00Z`)-Date.parse(`${date}T00:00:00Z`))/86400000);
 if(!/^\d{4}-\d{2}-\d{2}$/.test(date)||!Number.isInteger(days)||days<0||days>14)return Response.json({error:'Invalid editorial date'},{status:400});
 try{const result=await runInstagram(Date.now()+54000,date);return Response.json(result,{status:result.instagram==='completed'?200:202});}
 catch{return Response.json({error:'Instagram job failed; inspect private job_runs'},{status:500});}
}
