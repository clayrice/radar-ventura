"use server";
import {randomUUID} from 'node:crypto';
import {isDemo,sessionDb,adminDb,checked} from '@/lib/db';
import {generate} from '@/lib/ai';
import {editionSchema,weekStart} from '@/lib/validation';
import {validateEdition,matchPartners} from '@/lib/pipeline-core';
import {weeklyInstructions} from '@/lib/weekly-instructions';
import type {Article,Edition,Partner,Profile} from '@/lib/types';
export type PreviewState={message:string;edition?:Edition};
export async function previewWeekly(_:PreviewState):Promise<PreviewState>{
 if(isDemo())return {message:'A prévia personalizada exige login e conexão com as notícias reais.'};
 const session=await sessionDb();const {data:{user}}=await session.auth.getUser();
 if(!user)return {message:'Entre na sua conta para gerar a prévia.'};
 try{
 const profile=checked(await session.from('profiles').select('*').eq('user_id',user.id).maybeSingle()) as Profile|null;
 if(!profile)return {message:'Preencha o perfil da empresa antes de gerar a prévia.'};
 const db=adminDb();
 const articles=checked(await db.from('articles').select('id,title,summary,brazil_impact,source_name,source_url,published_at,category,sectors').eq('status','published').gte('published_at',new Date(Date.now()-7*86400000).toISOString()).order('published_at',{ascending:false}).limit(24)) as Article[];
 if(!articles.length)return {message:'Ainda não há matérias publicadas nos últimos sete dias para preparar a prévia.'};
 // Leave the ten-minute lease in place to throttle each authenticated user.
 if(!checked(await db.rpc('acquire_job',{lock_name:`weekly-preview:${user.id}`,lock_owner:randomUUID()})))return {message:'Aguarde dez minutos entre as prévias. Se já gerou uma, confira o resultado abaixo.'};
 const raw=await generate(editionSchema,'weekly_briefing',weeklyInstructions,{profile:{sector:profile.sector,size:profile.size,objective:profile.objective||profile.goals,interests:profile.interests||[],business_model:profile.business_model,ai_level:profile.ai_level,preferences:profile.preferences||null},articles});
 const content=validateEdition(raw,articles);
 const partners=matchPartners(checked(await db.from('partners').select('*').eq('active',true).eq('placement','newsletter')) as Partner[],profile.sector,content);
 return {message:'Prévia gerada por IA com seu perfil e matérias dos últimos sete dias. Não foi enviada por email e não ativa assinatura.',edition:{id:'preview',week_start:weekStart(),status:'preview',sent_at:null,content,articles,partners}};
 }catch{return {message:'Não foi possível gerar a prévia. Confira a disponibilidade da IA e tente novamente em dez minutos.'};}
}
