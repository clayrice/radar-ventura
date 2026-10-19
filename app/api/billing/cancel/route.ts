import {z} from 'zod';
import {isDemo,sessionDb} from '@/lib/db';
import {cancelWeeklyRenewal} from '@/lib/subscription-management';
export const runtime='nodejs';export const maxDuration=60;
export async function POST(req:Request){
 if(isDemo())return Response.json({message:'O cancelamento não está disponível na demonstração.'},{status:503});
 const origin=process.env.APP_URL;
 if(!origin||req.headers.get('origin')!==new URL(origin).origin)return Response.json({message:'Origem inválida.'},{status:403});
 const db=await sessionDb();const {data:{user}}=await db.auth.getUser();
 if(!user)return Response.json({message:'Entre na sua conta para continuar.'},{status:401});
 const input=z.object({orderId:z.uuid(),confirm:z.literal(true)}).strict().safeParse(await req.json().catch(()=>null));
 if(!input.success)return Response.json({message:'Confirme o cancelamento da renovação.'},{status:400});
 try{await cancelWeeklyRenewal(user.id,input.data.orderId);return Response.json({message:'Renovação cancelada. Seu acesso continua até o fim do período pago.'});}
 catch{return Response.json({message:'Não foi possível confirmar o cancelamento. Confira novamente nesta página ou fale com hello@ventura-ai.com. Não faça uma nova assinatura enquanto o pedido estiver em análise.'},{status:502});}
}
