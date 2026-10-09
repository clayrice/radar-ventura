"use server";
import {z} from 'zod';
import {adminDb,checked} from '@/lib/db';
import {dailyEnabled,dailyConfig,dailyLink,sendDailyPayload} from '@/lib/daily-mail';
import {escapeHtml} from '@/lib/validation';
export async function dailySignup(_: {message:string},form:FormData){
 const email=z.email().max(254).safeParse(String(form.get('email')||'').trim().toLowerCase());
 if(!email.success||form.get('consent')!=='on')return {message:'Informe um e-mail válido e autorize o recebimento.'};
 if(form.get('website'))return {message:'Se o cadastro puder ser realizado, você receberá um e-mail de confirmação.'};
 if(!dailyEnabled())return {message:'O cadastro está em validação. Nenhum e-mail foi enviado. Volte em breve.'};
 try{dailyConfig();const rows=checked(await adminDb().rpc('request_daily_signup',{address:email.data}));const row=rows?.[0];
 if(row){const url=dailyLink('confirm',row);await sendDailyPayload({from:process.env.EMAIL_FROM,to:[email.data],subject:'Confirme seu Radar Diário gratuito',html:`<p>Confirme o recebimento do Radar Diário gratuito da Ventura.</p><p><a href="${escapeHtml(url)}">Confirmar inscrição</a></p><p>Este link vale por 24 horas. Se não pediu este cadastro, ignore este e-mail.</p>`,text:`Confirme sua inscrição (link válido por 24 horas): ${url}`},`ventura-daily-confirm/${row.nonce}`);}
 return {message:'Se o cadastro puder ser realizado, você receberá um e-mail de confirmação. Confira também o spam.'};
 }catch{return {message:'Não foi possível concluir o cadastro. Tente novamente em dez minutos.'};}
}
