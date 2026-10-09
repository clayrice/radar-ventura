import {timingSafeEqual} from 'node:crypto';
import {runInstagram} from '@/lib/instagram';
export const runtime='nodejs';
export const maxDuration=60;
export const dynamic='force-dynamic';
export async function GET(req:Request){
 const secret=process.env.CRON_SECRET;
 if(!secret||secret.length<32)return Response.json({error:'Job unavailable'},{status:503});
 const supplied=req.headers.get('authorization')||'';const expected=`Bearer ${secret}`;
 if(Buffer.byteLength(supplied)!==Buffer.byteLength(expected)||!timingSafeEqual(Buffer.from(supplied),Buffer.from(expected)))return Response.json({error:'Unauthorized'},{status:401});
 try{const result=await runInstagram(Date.now()+45000);return Response.json(result,{status:result.instagram==='completed'?200:202});}
 catch{return Response.json({error:'Instagram job failed; inspect private job_runs'},{status:500});}
}
