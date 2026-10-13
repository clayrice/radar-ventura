"use server";
import {z} from 'zod';
import {adminDb,checked} from '@/lib/db';
import {confirmationEnabled,dailyConfig,dailyLink,sendConfirmationPayload} from '@/lib/daily-mail';
import {confirmationEmail} from '@/lib/radar-design';
export async function dailySignup(_: {message:string},form:FormData){
 const email=z.email().max(254).safeParse(String(form.get('email')||'').trim().toLowerCase());
 if(!email.success||form.get('consent')!=='on')return {message:'Informe um e-mail válido e autorize o recebimento.'};
 if(form.get('website'))return {message:'Se o cadastro puder ser realizado, você receberá um e-mail de confirmação.'};
 if(!confirmationEnabled(email.data))return {message:'O cadastro está em validação. Nenhum e-mail foi enviado. Volte em breve.'};
 try{dailyConfig();const rows=checked(await adminDb().rpc('request_daily_signup',{address:email.data}));const row=rows?.[0];
 if(row){const confirm=dailyLink('confirm',row),unsubscribe=dailyLink('unsubscribe',row);await sendConfirmationPayload(email.data,{from:process.env.EMAIL_FROM,to:[email.data],...confirmationEmail(confirm,unsubscribe,process.env.APP_URL!)},`ventura-daily-confirm/${row.nonce}`);}
 return {message:'Se o cadastro puder ser realizado, você receberá um e-mail de confirmação. Confira também o spam.'};
 }catch{return {message:'Não foi possível concluir o cadastro. Tente novamente em dez minutos.'};}
}
