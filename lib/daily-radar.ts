import 'server-only';
import Parser from 'rss-parser';
import {adminDb,checked} from './db';
import {feedAllowlist,sourceArticleUrl,titleKey} from './pipeline-core';
import {editorialDecision,editorialInstructions,normalizeRadarSummary,selectDailyCandidates} from './editorial';
import {classificationSchema} from './validation';
import {generate} from './ai';
import {feedCover} from './news-images';
import {DAILY_TARGET,SEARCH_STAGES,NewsBudgetError,retryDelay} from './daily-run-core';

type Db=ReturnType<typeof adminDb>;
const parser=new Parser();
const message=(e:unknown)=>e instanceof Error?e.message.slice(0,300):'Falha desconhecida';
async function feed(url:string){
 const response=await fetch(url,{signal:AbortSignal.timeout(12000),redirect:'error',headers:{'User-Agent':'VenturaRadar/0.2'}});
 if(!response.ok||!response.body)throw new Error(`Feed HTTP ${response.status}`);
 const reader=response.body.getReader();const decoder=new TextDecoder();let xml='',size=0;
 try{while(true){const part=await reader.read();if(part.done)break;size+=part.value.length;if(size>2000000)throw new Error('Feed maior que 2 MB');xml+=decoder.decode(part.value,{stream:true});}xml+=decoder.decode();}finally{await reader.cancel();}
 if(/<!DOCTYPE|<!ENTITY/i.test(xml))throw new Error('Declaração XML não permitida');
 return parser.parseString(xml);
}
export async function portalCount(db:Db,date:string){
 const result=await db.from('articles').select('id',{count:'exact',head:true}).eq('status','published').eq('radar_date',date);checked(result);return result.count||0;
}
async function track(db:Db,date:string,ids:string[]){
 if(ids.length)checked(await db.from('radar_candidates').upsert(ids.map(article_id=>({radar_date:date,article_id})),{onConflict:'radar_date,article_id',ignoreDuplicates:true}));
}
export async function radarCounts(db:Db,date:string){
 const links=checked(await db.from('radar_candidates').select('article_id').eq('radar_date',date))||[];
 const counts={collected:links.length,rejected:0,pending:0,errors:0,published:await portalCount(db,date)};
 // Batch around URL length limits; these are distinct persisted candidates.
 for(let offset=0;offset<links.length;offset+=100){
  const rows=checked(await db.from('articles').select('status,radar_date,last_error').in('id',links.slice(offset,offset+100).map(r=>r.article_id)))||[];
  for(const row of rows){if(row.status==='rejected')counts.rejected++;if(row.status==='queued')counts.pending++;if(row.status==='review'||row.status==='queued'&&row.last_error)counts.errors++;}
 }
 return counts;
}
async function collect(db:Db,date:string,stage:number,deadline:number){
 const {days,items}=SEARCH_STAGES[stage];let sourceErrors=0,skipped=0,added=0;
 // Keep disabled sources disabled. Widen the window and feed depth over verified feeds.
 const sources=checked(await db.from('sources').select('*').eq('enabled',true).in('kind',['press','analysis']).order('last_fetched_at',{ascending:true,nullsFirst:true}))||[];
 for(let offset=0;offset<sources.length&&Date.now()<deadline-30000;offset+=4){
  await Promise.all(sources.slice(offset,offset+4).map(async source=>{
   const allowed=feedAllowlist[source.id];if(!allowed||allowed.url!==source.feed_url)return;
   try{
    let result;for(let attempt=0;attempt<2;attempt++){try{result=await feed(allowed.url);break;}catch(error){if(attempt===1||Date.now()>deadline-30000)throw error;await new Promise(resolve=>setTimeout(resolve,500));}}
    for(const item of result?.items.slice(0,items)||[]){
     if(Date.now()>deadline-12000)break;
     const url=item.link&&sourceArticleUrl(item.link,source.id);const published=new Date(item.isoDate||item.pubDate||'');
     const excerpt=(item.contentSnippet||item.summary||item.content||'').replace(/<[^>]*>/g,' ').replace(/\s+/g,' ').trim().slice(0,5000);
     if(!url||!item.title||!Number.isFinite(published.getTime())||published.getTime()>Date.now()+60000||published.getTime()<Date.now()-days*86400000||excerpt.length<120){skipped++;continue;}
     const insert=await db.from('articles').insert({...feedCover(item),source_id:source.id,source_kind:source.kind,source_name:source.name,source_url:url,title:item.title.slice(0,180),title_key:titleKey(item.title),excerpt,published_at:published.toISOString()}).select('id');
     if(insert.error&&insert.error.code!=='23505')throw insert.error;
     if(!insert.error)added++;
    }
    checked(await db.from('sources').update({last_fetched_at:new Date().toISOString(),last_error:null}).eq('id',source.id));
   }catch(error){sourceErrors++;checked(await db.from('sources').update({last_error:message(error)}).eq('id',source.id));}
  }));
 }
 return {source_errors:sourceErrors,feed_items_skipped:skipped,added};
}
export async function fillRadar(db:Db,date:string,initialStage:number,deadline:number,onProgress:(data:Record<string,unknown>)=>Promise<void>){
 let stage=initialStage;let sourceErrors=0,skipped=0,added=0,failures=0;let reason='search_exhausted';
 const seen=new Set<string>();
 await track(db,date,(checked(await db.from('articles').select('id').eq('status','published').eq('radar_date',date))||[]).map(a=>a.id));
 const save=async()=>onProgress({search_stage:stage,source_errors:sourceErrors,feed_items_skipped:skipped,added,classification_failures:failures,...await radarCounts(db,date),reason});
 while(await portalCount(db,date)<DAILY_TARGET&&Date.now()<deadline-55000){
  const collection=await collect(db,date,stage,deadline);sourceErrors+=collection.source_errors;skipped+=collection.feed_items_skipped;added+=collection.added;
  const recent=new Date(Date.now()-SEARCH_STAGES[stage].days*86400000).toISOString();
  // Include already queued candidates; failed/rejected articles never count toward the quota.
  const pool=checked(await db.from('articles').select('*').eq('status','queued').in('source_kind',['press','analysis']).lt('attempts',3).lte('next_attempt_at',new Date().toISOString()).gte('published_at',recent).order('attempts').order('published_at',{ascending:false}).limit(200))||[];
  await track(db,date,pool.map(a=>a.id));
  const candidates=selectDailyCandidates(pool.filter(a=>!seen.has(a.id)),200);
  for(const a of candidates){
   if(Date.now()>=deadline-55000){reason='time_budget_exhausted';break;}
   if(await portalCount(db,date)>=DAILY_TARGET)break;
   seen.add(a.id);
   try{
    const generated=await generate(classificationSchema,'news_brief',editorialInstructions,{title:a.title,excerpt:a.excerpt,source:a.source_name});
    const output={...generated,summary:normalizeRadarSummary(generated.summary)};const decision=editorialDecision(output,a.source_kind,a.excerpt);
    // Invalid formatting may retry; lack of evidence or editorial rejection is final.
    const formatError=decision.reason==='Texto precisa de três a quatro parágrafos';
    checked(await db.from('articles').update({title:output.title,summary:output.summary,brazil_impact:output.brazil_impact,category:output.category,sectors:output.sectors,human_angle:output.human_angle,perspective_attribution:a.source_name,perspective_evidence:output.perspective_evidence,editorial_score:Math.round((output.business_relevance+output.reader_interest)/2),status:decision.publish?'published':formatError&&a.attempts<2?'queued':'rejected',radar_date:decision.publish?date:null,attempts:a.attempts+1,next_attempt_at:new Date(Date.now()+retryDelay(a.attempts+1)).toISOString(),model:process.env.OPENAI_MODEL||'gpt-4.1-mini',last_error:decision.reason}).eq('id',a.id).eq('status','queued'));
   }catch(error){
    if(error instanceof NewsBudgetError){reason='news_daily_budget_exhausted';await save();return {reason,stage};}
    failures++;checked(await db.from('articles').update({attempts:a.attempts+1,status:a.attempts>=2?'review':'queued',next_attempt_at:new Date(Date.now()+retryDelay(a.attempts+1)).toISOString(),last_error:'classification_failed; retry scheduled or manual review required'}).eq('id',a.id).eq('status','queued'));
   }
   await save();
  }
  if(await portalCount(db,date)>=DAILY_TARGET){reason='portal_target_reached';break;}
  if(Date.now()>=deadline-55000){reason='time_budget_exhausted';break;}
  if(stage<SEARCH_STAGES.length-1){stage++;await save();continue;}
  // Process other sources in the expanded pool before ending this invocation.
  if(candidates.length)continue;
  reason=sourceErrors?'source_failures_or_insufficient_evidence':'insufficient_valid_articles';break;
 }
 if(await portalCount(db,date)===DAILY_TARGET)reason='portal_target_reached';
 else if(Date.now()>=deadline-55000)reason='time_budget_exhausted';
 await save();return {reason,stage};
}
