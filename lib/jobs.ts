import {weeklyInstructions} from './weekly-instructions';
import 'server-only';
import {pageCover} from './news-images';
import {randomUUID} from 'node:crypto';
import {adminDb,checked,isDemo} from './db';
import {generate} from './ai';
import {editionSchema,weekStart} from './validation';
import {feedAllowlist,validateEdition,matchPartners,retryDelivery} from './pipeline-core';
import {editionEmail} from './email-template';
import {unsubscribeToken} from './unsubscribe';
import {roadmapOutput,roadmapInput} from './roadmap-schema';
import {radarDate} from './radar-dates';
import type {Article,Edition,Partner,Profile} from './types';
import {runInstagram} from './instagram';
import {fillRadar,radarCounts} from './daily-radar';
import {recoverEditionCovers} from './radar-covers';
import {editionOutcome} from './daily-run-core';
type Db=ReturnType<typeof adminDb>;
const model=()=>process.env.OPENAI_MODEL||'gpt-4.1-mini';
const err=(e:unknown)=>e instanceof Error?e.message.slice(0,300):'Unknown failure';
async function hydratePublishedCovers(db:Db,deadline:number){
 const recent=new Date(Date.now()-14*86400000).toISOString();
 const rows=checked(await db.from('articles').select('id,source_id,source_url').eq('status','published').is('cover_url',null).gte('published_at',recent).order('radar_date',{ascending:false,nullsFirst:false}).order('published_at',{ascending:false}).limit(8));
 let hydrated=0;let failures=0;
 for(let offset=0;offset<(rows||[]).length&&Date.now()<deadline-12000;offset+=3){
  const batch=(rows||[]).slice(offset,offset+3);
  const results=await Promise.all(batch.map(async article=>{try{const allowed=feedAllowlist[article.source_id]?.hosts||[];const cover=await pageCover(article.source_url,allowed);if(!('cover_url' in cover))return false;checked(await db.from('articles').update(cover).eq('id',article.id).is('cover_url',null));return true;}catch{return null;}}));
  hydrated+=results.filter(value=>value===true).length;failures+=results.filter(value=>value===null).length;
 }
 return {covers_hydrated:hydrated,cover_failures:failures};
}
async function generateWeekly(db:Db,deadline:number){
 const week=weekStart();checked(await db.rpc('enqueue_editions',{edition_week:week}));
 // Old ungenerated editions are cancelled instead of generating stale briefings with a changed profile.
 checked(await db.from('editions').update({status:'cancelled',last_error:'Superseded by a newer week'}).eq('status','queued').lt('week_start',week));
 const queued=checked(await db.from('editions').select('*').eq('status','queued').eq('week_start',week).lt('attempts',3).order('created_at').limit(1));
 if(!queued?.length||Date.now()>deadline)return {generated:0};const e=queued[0];
 const profile=checked(await db.from('profiles').select('*').eq('user_id',e.user_id).maybeSingle()) as Profile|null;
 const sub=checked(await db.from('subscriptions').select('status').eq('user_id',e.user_id).maybeSingle());
 if(!profile?.email_opt_in||sub?.status!=='active'){checked(await db.from('editions').update({status:'cancelled'}).eq('id',e.id));return {generated:0};}
 const start=new Date(`${week}T00:00:00Z`);start.setUTCDate(start.getUTCDate()-7);
 const articles=checked(await db.from('articles').select('id,title,summary,brazil_impact,cover_url,cover_caption,cover_credit,source_name,source_url,published_at,category,sectors,human_angle,perspective_attribution,editorial_score').eq('status','published').gte('published_at',start.toISOString()).lt('published_at',`${week}T00:00:00Z`).order('published_at',{ascending:false}).limit(24)) as Article[];
 if(!articles.length)return {generated:0,waiting_for_articles:true};
 checked(await db.from('editions').update({attempts:e.attempts+1}).eq('id',e.id));
 try{const raw=await generate(editionSchema,'weekly_briefing',weeklyInstructions,{profile:{sector:profile.sector,size:profile.size,objective:profile.objective||profile.goals,interests:profile.interests||[],business_model:profile.business_model,ai_level:profile.ai_level,preferences:profile.preferences||null},articles});
 const content=validateEdition(raw,articles);const partners=matchPartners(checked(await db.from('partners').select('*').eq('active',true).eq('placement','newsletter')) as Partner[],profile.sector,content);
 checked(await db.from('editions').update({status:'ready',content,articles,partners,model:model(),last_error:null}).eq('id',e.id));return {generated:1};
 }catch(error){checked(await db.from('editions').update({last_error:err(error),status:e.attempts>=2?'failed':'queued'}).eq('id',e.id));return {generated:0,generation_failures:1};}
}
async function deliver(db:Db,deadline:number){if(process.env.EMAIL_SEND_ENABLED!=='true')return {sent:0,delivery:'disabled'};
 if(!process.env.RESEND_API_KEY||!process.env.EMAIL_FROM||!process.env.APP_URL)throw new Error('Email configuration incomplete');
 let sent=0;let review=0;
 const pending=checked(await db.from('editions').select('*').in('status',['ready','sending']).order('week_start').limit(3));
 for(const row of pending||[]){if(Date.now()>deadline)break;const e=row as Edition & {user_id:string;send_started_at:string|null;delivery_payload:Record<string,unknown>|null};
 const profile=checked(await db.from('profiles').select('email_opt_in').eq('user_id',e.user_id).maybeSingle());const sub=checked(await db.from('subscriptions').select('status').eq('user_id',e.user_id).maybeSingle());
 if(!profile?.email_opt_in||sub?.status!=='active'){checked(await db.from('editions').update({status:'cancelled'}).eq('id',e.id));continue;}
 // Resend retains idempotency keys for 24h. After 23h, stop and require provider reconciliation.
 if(!retryDelivery(e.send_started_at)){review++;checked(await db.from('editions').update({status:'review',last_error:'Reconcile provider delivery before retrying: idempotency window expired'}).eq('id',e.id));continue;}
 try{
 let payload=e.delivery_payload;
 if(!payload){const {data,error}=await db.auth.admin.getUserById(e.user_id);if(error||!data.user?.email)throw new Error('Recipient not available');const unsubscribeUrl=new URL('/unsubscribe',process.env.APP_URL);unsubscribeUrl.searchParams.set('user',e.user_id);unsubscribeUrl.searchParams.set('token',unsubscribeToken(e.user_id));const body=editionEmail(e,process.env.APP_URL,unsubscribeUrl.toString());
 payload={from:process.env.EMAIL_FROM,to:[data.user.email],...body,headers:{'List-Unsubscribe':`<${unsubscribeUrl}>`,'List-Unsubscribe-Post':'List-Unsubscribe=One-Click'}};
 // Freeze the exact provider payload before the first request so retries cannot change recipient or content.
 checked(await db.from('editions').update({status:'sending',delivery_payload:payload,send_started_at:new Date().toISOString()}).eq('id',e.id));
 }
 const response=await fetch('https://api.resend.com/emails',{method:'POST',signal:AbortSignal.timeout(15000),headers:{Authorization:`Bearer ${process.env.RESEND_API_KEY}`,'Content-Type':'application/json','Idempotency-Key':`ventura-weekly/${e.id}`},body:JSON.stringify(payload)});
 const receipt=await response.json() as {id?:string};if(!response.ok||!receipt.id)throw new Error(`Email provider HTTP ${response.status}; delivery requires retry or reconciliation`);
 checked(await db.from('editions').update({status:'sent',sent_at:new Date().toISOString(),provider_id:receipt.id,last_error:null}).eq('id',e.id));sent++;
 }catch(error){checked(await db.from('editions').update({last_error:err(error)}).eq('id',e.id));}}
 return {sent,delivery_review:review};
}
async function generateRoadmaps(db:Db,deadline:number){
 if(Date.now()>deadline)return {roadmaps_generated:0};
 const rows=checked(await db.from('roadmaps').select('*').eq('status','queued').lt('attempts',3).order('created_at').limit(1));
 const row=rows?.[0];if(!row)return {roadmaps_generated:0};
 checked(await db.from('roadmaps').update({attempts:row.attempts+1}).eq('id',row.id));
 try{const answers=roadmapInput.parse(row.answers);const output=await generate(roadmapOutput,'roadmap','Analise o negócio e proponha exatamente três projetos distintos, proporcionais ao contexto informado. Considere raciocínio assistido, análise e previsão com dados, criação, acesso a conhecimento, personalização, novos produtos e crescimento, além de automação. Use as prioridades em opportunity_focus e as ambições em new_capability, decision_challenge, customer_opportunity e knowledge_gap para escolher as rotas. Não force três projetos de automação nem uma categoria por projeto: a seleção deve refletir oportunidades demonstradas nas respostas. Explique qual capacidade da IA agrega valor em cada solução; quando regras simples forem suficientes, diga isso. Previsões exigem histórico adequado e validação; decisões sensíveis exigem supervisão humana. Ordene os projetos por prioridade considerando objetivo, frequência das tarefas, horas declaradas, dependência de pessoas, erros, dados disponíveis, orçamento, prazo e capacidade de adoção. Explique a prioridade no diagnóstico e separe informações declaradas de hipóteses a validar. Horas nulas significam que o empresário não sabe, nunca zero. Para cada projeto, descreva problema específico, solução com limites de escopo, primeiro passo pequeno, critério de sucesso comparável à situação atual, esforço e três fases com validação humana. Se faltarem dados ou houver restrições, comece por organizar informações ou um piloto assistido antes de recomendar integrações. As três opções são alternativas e não precisam depender uma da outra. Não invente economia, preços, integrações disponíveis ou garantias. Trate os resultados como exploração inicial. Escreva em português brasileiro. Você não recebe dados de parceiros: eles não devem influenciar a escolha dos projetos.',answers);
 const partners=(checked(await db.from('partners').select('*').eq('active',true).eq('plan','strategic').contains('sectors',[answers.sector]))||[]) as Partner[];
 checked(await db.from('roadmaps').update({status:'ready',output,partners:partners.filter(p=>output.projects.some(project=>p.capabilities.includes(project.capability))).slice(0,6),last_error:null}).eq('id',row.id).eq('status','queued'));
 return {roadmaps_generated:1};
 }catch(e){checked(await db.from('roadmaps').update({status:row.attempts>=2?'failed':'queued',last_error:err(e)}).eq('id',row.id).eq('status','queued'));return {roadmap_failures:1};}
}
export async function runDaily(){
 if(isDemo())return {status:'blocked',reason:'demo_mode'};
 const db=adminDb();const owner=randomUUID();
 if(!checked(await db.rpc('acquire_job',{lock_name:'daily',lock_owner:owner})))return {status:'pending',reason:'already_running'};
 let run:{id:string}|null=null;let date=radarDate();let attempts=0;
  // Hobby functions have a 60-second ceiling; reserve time for persistence and response.
  const deadline=Date.now()+54000;let metrics:Record<string,unknown>={};
 try{
  // A killed invocation remains visibly interrupted, never completed.
  checked(await db.from('job_runs').update({status:'interrupted',finished_at:new Date().toISOString(),error:'Worker interrompido; retomado pela próxima execução'}).eq('job','daily').eq('status','running'));
  checked(await db.from('radar_editions').upsert({radar_date:date},{onConflict:'radar_date',ignoreDuplicates:true}));
 const edition=checked(await db.from('radar_editions').select('*').eq('radar_date',date).neq('status','completed').lte('next_attempt_at',new Date().toISOString()).maybeSingle());
  if(!edition){const current=checked(await db.from('radar_editions').select('status,last_reason,metrics').eq('radar_date',date).single());return {status:current?.status||'pending',reason:current?.last_reason||'retry_scheduled',...current?.metrics};}
  date=edition.radar_date;attempts=edition.attempts+1;
  run=checked(await db.from('job_runs').insert({job:'daily',metrics:{radar_date:date,attempt:attempts}}).select('id').single());
  checked(await db.from('radar_editions').update({attempts,updated_at:new Date().toISOString()}).eq('radar_date',date));
  const progress=async(data:Record<string,unknown>)=>{
   metrics={...metrics,...data,radar_date:date,attempt:attempts};
   checked(await db.from('job_runs').update({metrics}).eq('id',run!.id));
   checked(await db.from('radar_editions').update({metrics,search_stage:data.search_stage??edition.search_stage,updated_at:new Date().toISOString(),last_reason:data.reason||'processing'}).eq('radar_date',date));
  };
  checked(await db.from('subscriptions').update({status:'inactive'}).eq('status','active').lte('expires_at',new Date().toISOString()));
  checked(await db.from('partners').update({active:false}).eq('active',true).lte('expires_at',new Date().toISOString()));
  const radar=await fillRadar(db,date,edition.search_stage,deadline-20000,progress);
  const covers=await recoverEditionCovers(db,date,deadline-5000);
  const counts=await radarCounts(db,date);
  let instagram:Record<string,unknown>={instagram:'waiting_for_three_articles',instagram_published:0};
  if(counts.published===3&&covers.articles_with_images===3&&Date.now()<deadline-5000){
   // Allow posting to use the remaining function budget; later cron runs resume safely.
   instagram=await runInstagram(deadline+15000,date).catch(()=>({instagram:'failed',instagram_published:0,instagram_failures:1}));
  }
  const outcome=editionOutcome(counts.published,Number(instagram.instagram_published)||0,covers.articles_with_images,counts.published===3?String(instagram.instagram||'instagram_pending'):radar.reason);
  metrics={...metrics,...counts,...covers,...instagram,radar_date:date,attempt:attempts,status:outcome.status,reason:outcome.reason};
  const next=new Date(Date.now()+(radar.reason==='news_daily_budget_exhausted'?3600000:300000)).toISOString();
  checked(await db.from('radar_editions').update({status:outcome.status,search_stage:radar.stage,metrics,last_reason:outcome.reason,next_attempt_at:next,updated_at:new Date().toISOString()}).eq('radar_date',date));
  checked(await db.from('job_runs').update({status:outcome.status,finished_at:new Date().toISOString(),metrics}).eq('id',run!.id));
  console.info('radar_daily',JSON.stringify(metrics));
  // Customer work has its own budget and cannot turn an incomplete edition into success.
  if(Date.now()<deadline-45000){
   try{await hydratePublishedCovers(db,deadline-30000);await generateWeekly(db,deadline-30000);await generateRoadmaps(db,deadline-30000);await deliver(db,deadline-12000);}catch{console.error('radar_auxiliary_jobs_failed');}
  }
  return metrics;
 }catch(error){
  if(run)checked(await db.from('job_runs').update({status:'failed',finished_at:new Date().toISOString(),metrics,error:err(error)}).eq('id',run.id));
  checked(await db.from('radar_editions').update({status:'pending',last_reason:'worker_failure',next_attempt_at:new Date(Date.now()+300000).toISOString(),updated_at:new Date().toISOString()}).eq('radar_date',date));
  throw error;
 }finally{checked(await db.rpc('release_job',{lock_name:'daily',lock_owner:owner}));}
}
