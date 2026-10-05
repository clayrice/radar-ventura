import 'server-only';
import Parser from 'rss-parser';
import {feedCover,pageCover} from './news-images';
import {editorialInstructions,editorialDecision,editorialFallbackDecision,editorialCompletionDecision,selectDailyCandidates,normalizeRadarSummary} from './editorial';
import {randomUUID} from 'node:crypto';
import {adminDb,checked,isDemo} from './db';
import {generate} from './ai';
import {classificationSchema,editionSchema,weekStart} from './validation';
import {feedAllowlist,sourceArticleUrl,titleKey,validateEdition,matchPartners,retryDelivery} from './pipeline-core';
import {editionEmail} from './email-template';
import {unsubscribeToken} from './unsubscribe';
import {roadmapOutput,roadmapInput} from './roadmap-schema';
import {radarDate} from './radar-dates';
import type {Article,Edition,Partner,Profile} from './types';
import {runInstagram} from './instagram';
type Db=ReturnType<typeof adminDb>;
const model=()=>process.env.OPENAI_MODEL||'gpt-4.1-mini';
const minimumDailyArticles=3;
const err=(e:unknown)=>e instanceof Error?e.message.slice(0,300):'Unknown failure';
const parser=new Parser<Record<string,unknown>,{mediaContent?:{$?:{url?:string;type?:string;medium?:string};'media:credit'?:string[]}[];mediaThumbnail?:{$?:{url?:string;type?:string;medium?:string};'media:credit'?:string[]}[]}>({customFields:{item:[['media:content','mediaContent',{keepArray:true}],['media:thumbnail','mediaThumbnail',{keepArray:true}]]}});

async function boundedFeed(url:string){
 const res=await fetch(url,{signal:AbortSignal.timeout(12000),redirect:'error',headers:{'User-Agent':'VenturaRadar/0.1 (+https://ventura-ai.com)'}});
 if(!res.ok)throw new Error(`Feed HTTP ${res.status}`);
 if(!res.body)throw new Error('Empty feed');
 const reader=res.body.getReader();const decoder=new TextDecoder();let xml='';let bytes=0;
 try{while(true){const {done,value}=await reader.read();if(done)break;bytes+=value.length;if(bytes>2_000_000)throw new Error('Feed exceeds 2MB limit');xml+=decoder.decode(value,{stream:true});}xml+=decoder.decode();}finally{await reader.cancel();}
 if(/<!DOCTYPE|<!ENTITY/i.test(xml))throw new Error('Unsupported XML declaration');return parser.parseString(xml);
}
async function ingest(db:Db){let added=0;let errors=0;const sources=checked(await db.from('sources').select('*').eq('enabled',true).order('last_fetched_at',{ascending:true,nullsFirst:true}));
 for(let offset=0;offset<(sources||[]).length;offset+=4){await Promise.all((sources||[]).slice(offset,offset+4).map(async source=>{const allowed=feedAllowlist[source.id];if(!allowed||allowed.url!==source.feed_url)return;
 try{const feed=await boundedFeed(allowed.url);for(const item of feed.items.slice(0,10)){if(!item.link||!item.title)continue;const url=sourceArticleUrl(item.link,source.id);const published=new Date(item.isoDate||item.pubDate||'');if(!url||!Number.isFinite(published.getTime())||published.getTime()>Date.now()+60000||published.getTime()<Date.now()-14*86400000)continue;
 const excerpt=(item.contentSnippet||item.summary||item.content||'').replace(/<[^>]*>/g,' ').replace(/\s+/g,' ').trim().slice(0,5000);
 if(excerpt.length<120)continue;
 if(source.kind==='discovery'||source.kind==='primary'){const primaryLinks=[...new Set([...(item.content||'').matchAll(/href=[\"'](https:\/\/[^\"']+)[\"']/g)].map(m=>m[1]).filter(link=>Object.values(feedAllowlist).some(f=>f.kind==='primary'&&f.hosts.includes(new URL(link).hostname))))].slice(0,10);checked(await db.from('discoveries').upsert({source_id:source.id,source_url:url,title:item.title,excerpt,primary_links:primaryLinks},{onConflict:'source_url',ignoreDuplicates:true}));continue;}
 const {error}=await db.from('articles').insert({...feedCover(item),source_id:source.id,source_kind:source.kind,source_name:source.name,source_url:url,title:item.title.slice(0,180),title_key:titleKey(item.title),excerpt,published_at:published.toISOString()});
 if(error&&error.code!=='23505')throw error;if(!error)added++;
 }checked(await db.from('sources').update({last_fetched_at:new Date().toISOString(),last_error:null}).eq('id',source.id));
 }catch(e){errors++;checked(await db.from('sources').update({last_error:err(e)}).eq('id',source.id));}}));}
 return {added,source_errors:errors};
}
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
async function classify(db:Db,deadline:number){const today=radarDate();const existing=checked(await db.from('articles').select('id').eq('status','published').eq('radar_date',today));let published=0;let recovered=0;let failures=0;const flexible:{id:string;score:number}[]=[];const completion:{id:string;score:number}[]=[];const recent=new Date(Date.now()-14*86400000).toISOString();
 const malformed=checked(await db.from('articles').select('*').eq('status','rejected').eq('last_error','Texto precisa de três a quatro parágrafos').gte('published_at',recent).order('editorial_score',{ascending:false}).order('published_at',{ascending:false}).limit(12));
 for(const a of malformed||[]){if((existing?.length||0)+published>=minimumDailyArticles)break;const summary=normalizeRadarSummary(a.summary);const score=a.editorial_score||0;const output={title:a.title,summary,brazil_impact:a.brazil_impact||'',category:a.category,sectors:a.sectors||[],publish:false,human_angle:a.human_angle||'',perspective_evidence:a.perspective_evidence||'',business_relevance:score,reader_interest:score,launch_importance:100};if(!editorialCompletionDecision(output,a.source_kind,a.excerpt).publish)continue;checked(await db.from('articles').update({summary,status:'published',radar_date:today,last_error:null}).eq('id',a.id));published++;recovered++;}
 const pool=checked(await db.from('articles').select('*').in('status',['queued','rejected']).in('source_kind',['press','analysis']).lt('attempts',3).gte('published_at',recent).order('published_at',{ascending:false}).limit(30));const candidates=selectDailyCandidates(pool||[],10);
 for(const a of candidates||[]){if(Date.now()>deadline||(existing?.length||0)+published>=minimumDailyArticles)break;checked(await db.from('articles').update({attempts:a.attempts+1}).eq('id',a.id));
 try{const generated=await generate(classificationSchema,'news_brief',editorialInstructions,{title:a.title,excerpt:a.excerpt,source:a.source_name});const output={...generated,summary:normalizeRadarSummary(generated.summary)};
 const decision=editorialDecision(output,a.source_kind,a.excerpt);
 checked(await db.from('articles').update({title:output.title,summary:output.summary,brazil_impact:output.brazil_impact,category:output.category,sectors:output.sectors,human_angle:output.human_angle,perspective_attribution:a.source_name,perspective_evidence:output.perspective_evidence,editorial_score:Math.round((output.business_relevance+output.reader_interest)/2),status:decision.publish?'published':'rejected',radar_date:decision.publish?today:null,model:model(),last_error:decision.reason}).eq('id',a.id));if(decision.publish)published++;
 else {const score=output.business_relevance+output.reader_interest;if(editorialFallbackDecision(output,a.source_kind,a.excerpt).publish)flexible.push({id:a.id,score});else if(editorialCompletionDecision(output,a.source_kind,a.excerpt).publish)completion.push({id:a.id,score});}

 }catch(e){failures++;checked(await db.from('articles').update({last_error:err(e),status:a.attempts>=2?'review':'queued'}).eq('id',a.id));}}
 let flexiblePublished=0;const needed=()=>Math.max(0,minimumDailyArticles-(existing?.length||0)-published);for(const candidate of flexible.sort((a,b)=>b.score-a.score).slice(0,needed())){checked(await db.from('articles').update({status:'published',radar_date:today,last_error:null}).eq('id',candidate.id));published++;flexiblePublished++;}
 let completionPublished=0;for(const candidate of completion.sort((a,b)=>b.score-a.score).slice(0,needed())){checked(await db.from('articles').update({status:'published',radar_date:today,last_error:null}).eq('id',candidate.id));published++;completionPublished++;}
 return {published,recovered_published:recovered,flexible_published:flexiblePublished,completion_published:completionPublished,classification_failures:failures};
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
 try{const raw=await generate(editionSchema,'weekly_briefing','Create a concise weekly AI briefing for a small business. Preserve the human perspective and attribution in the selected reporting. Mix relevant business news, useful launches, documented business cases, practical guides and evidence-based comparisons with work and public debate. Identify guides as educational content rather than new events. Select by usefulness to this company, not by a rigid category quota. Avoid a catalogue of tools. Explain concrete business implications without jargon. Prioritize the selected business areas and primary objective. Adapt the proposed steps to the stated AI adoption level, customer type, decision role, available experiment time and adoption limit. Consider the selected ambition: growth, new offerings, better decisions, personalized service and team knowledge, as well as operational efficiency. For readers who want to observe before experimenting, suggest what to monitor instead of assigning implementation work. Write all content in Brazilian Portuguese. If structured preferences are missing, use the legacy objective without inventing preferences. Include 1–3 top stories in overview, 0–3 specifically relevant stories with a concrete explanation in relevant, and 1–3 feasible action steps. Cite only supplied article IDs. If no story is relevant to this business, leave relevant empty. Suggest experiments, never promise returns or make unsupported product claims. Partners must not influence your editorial content: you will not receive partner data. Return only the requested schema.',{profile:{sector:profile.sector,size:profile.size,objective:profile.objective||profile.goals,interests:profile.interests||[],business_model:profile.business_model,ai_level:profile.ai_level,preferences:profile.preferences||null},articles});
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
export async function runDaily(){if(isDemo())return {skipped:'demo_mode'};
 const db=adminDb();const owner=randomUUID();const acquired=checked(await db.rpc('acquire_job',{lock_name:'daily',lock_owner:owner}));if(!acquired)return {skipped:'already_running'};
 const run=checked(await db.from('job_runs').insert({job:'daily'}).select('id').single());if(!run)throw new Error('Could not create job run');const deadline=Date.now()+190000;
 try{checked(await db.from('subscriptions').update({status:'inactive'}).eq('status','active').lte('expires_at',new Date().toISOString()));checked(await db.from('partners').update({active:false}).eq('active',true).lte('expires_at',new Date().toISOString()));const metrics={...await ingest(db),...await classify(db,deadline),...await hydratePublishedCovers(db,deadline),...await generateWeekly(db,deadline),...await generateRoadmaps(db,deadline),...await deliver(db,deadline),...await runInstagram(deadline+75000).catch(()=>({instagram:'failed',instagram_failures:1}))};checked(await db.from('job_runs').update({status:'completed',finished_at:new Date().toISOString(),metrics}).eq('id',run.id));return metrics;
 }catch(error){checked(await db.from('job_runs').update({status:'failed',finished_at:new Date().toISOString(),error:err(error)}).eq('id',run.id));throw error;
 }finally{checked(await db.rpc('release_job',{lock_name:'daily',lock_owner:owner}));}
}
