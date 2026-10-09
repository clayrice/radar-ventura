import 'server-only';
import {randomUUID} from 'node:crypto';
import {adminDb,checked} from './db';
import {radarDate} from './radar-dates';
import {instagramDraft,instagramPublishAction} from './instagram-core';
import {instagramArtwork} from './instagram-art';
import type {Article} from './types';

type Db=ReturnType<typeof adminDb>;
type Post={id:string;article_id:string;account_id:string;radar_date:string;title:string;caption:string;source_name:string;status:string;cover_url:string|null;cover_origin:'feed'|'article'|null;image_url:string|null;container_id:string|null;attempts:number};
type MetaResult={id?:string;username?:string;status_code?:string;data?:{permission?:string;status?:string}[]};
function configuration(){
 const account=process.env.INSTAGRAM_ACCOUNT_ID;
 const token=process.env.INSTAGRAM_ACCESS_TOKEN;
 const version=process.env.INSTAGRAM_API_VERSION;
 if(!account||!/^\d+$/.test(account)||!token||!version||!/^v\d+\.\d+$/.test(version))throw new Error('Configuração Instagram incompleta');
 return {account,token,version};
}
async function meta(path:string,method:'GET'|'POST'='GET',values:Record<string,string>={}):Promise<MetaResult>{
 const {token,version}=configuration();
 const url=new URL(`https://graph.instagram.com/${version}/${path}`);
 if(method==='GET')for(const [key,value] of Object.entries(values))url.searchParams.set(key,value);
 for(let attempt=0;attempt<3;attempt++){
  try{
   const response=await fetch(url,{method,headers:{Authorization:`Bearer ${token}`},body:method==='POST'?new URLSearchParams(values):undefined,signal:AbortSignal.timeout(method==='GET'?5000:12000),redirect:'error'});
   const payload=await response.json();
   if(!response.ok){
    if(method==='GET'&&(response.status===429||response.status>=500)&&attempt<2){await new Promise(resolve=>setTimeout(resolve,500*2**attempt));continue;}
    throw new Error(`Instagram HTTP ${response.status}; code ${Number(payload.error?.code)||0}`);
   }
   return payload;
  }catch(error){if(method!=='GET'||attempt===2||error instanceof Error&&error.message.startsWith('Instagram HTTP'))throw error;}
 }
 throw new Error('Falha de leitura Instagram');
}
async function update(db:Db,id:string,values:Record<string,unknown>){checked(await db.from('instagram_posts').update(values).eq('id',id));}
async function processPost(db:Db,post:Post,deadline:number){
 const article=checked(await db.from('articles').select('status,cover_url,cover_origin').eq('id',post.article_id).maybeSingle());
 if(article?.status!=='published'){await update(db,post.id,{status:'cancelled'});return false;}
 if(!article.cover_url?.trim()||!['feed','article'].includes(article.cover_origin||'')||post.cover_url!==article.cover_url||post.cover_origin!==article.cover_origin){await update(db,post.id,{status:'failed',last_error:'Imagem original da matéria ausente ou divergente'});return false;}
 if(post.status==='creating'){await update(db,post.id,{status:'queued',last_error:'Criação interrompida antes da publicação; nova tentativa segura'});post={...post,status:'queued'};}
 if(post.status==='queued'){
  if(post.attempts>=3){await update(db,post.id,{status:'failed',last_error:'Limite de tentativas atingido'});return false;}
  await update(db,post.id,{attempts:post.attempts+1});
  let imageUrl=post.image_url;
  if(!imageUrl){
   const image=await instagramArtwork(post);
   const filename=`${post.id}.jpg`;
   checked(await db.storage.from('instagram-media').upload(filename,image,{contentType:'image/jpeg',upsert:true}));
   imageUrl=db.storage.from('instagram-media').getPublicUrl(filename).data.publicUrl;
   await update(db,post.id,{image_url:imageUrl});
  }
  await update(db,post.id,{status:'creating'});
  const container=await meta(`${post.account_id}/media`,'POST',{image_url:imageUrl,caption:post.caption});
  if(!container.id)throw new Error('Instagram não retornou o contêiner');
  // Persist creation before publishing. A process interruption must not recreate a post.
  await update(db,post.id,{status:'processing',container_id:container.id,last_error:null});
  post={...post,status:'processing',attempts:post.attempts+1,container_id:container.id};
 }
 if(!post.container_id)return false;
 for(let poll=0;poll<5&&Date.now()<deadline-15000;poll++){
  const container=await meta(post.container_id,'GET',{fields:'status_code'});
  const action=instagramPublishAction(post.status,container.status_code||'');
  if(action==='confirm'){await update(db,post.id,{status:'published',published_at:new Date().toISOString(),last_error:null});return true;}
  if(action==='review'){await update(db,post.id,{status:'review',last_error:'Publicação sem confirmação; conferir no Instagram antes de retomar'});return false;}
  if(action==='fail'){await update(db,post.id,{status:post.attempts<3?'queued':'failed',container_id:null,last_error:'Contêiner recusado ou expirado; retentar criação antes de publicar'});return false;}
  if(action==='publish'){
   // Freeze this state BEFORE the external side effect. Never automatically repeat media_publish.
   await update(db,post.id,{status:'publishing'});
   const published=await meta(`${post.account_id}/media_publish`,'POST',{creation_id:post.container_id});
   if(!published.id)throw new Error('Publicação sem identificador');
   await update(db,post.id,{status:'published',media_id:published.id,published_at:new Date().toISOString(),last_error:null});return true;
  }
  await new Promise(resolve=>setTimeout(resolve,1000));
 }
 return false;
}

export async function runInstagram(deadline=Date.now()+75000,date=radarDate()){
 if(process.env.INSTAGRAM_PUBLISH_ENABLED==='false')return {instagram:'disabled'};
 const db=adminDb();const owner=randomUUID();
 if(!checked(await db.rpc('acquire_job',{lock_name:'instagram',lock_owner:owner})))return {instagram:'already_running'};
 let published=0,failures=0;
 let run:{id:string}|null=null;
 try{
  run=checked(await db.from('job_runs').insert({job:'instagram',metrics:{radar_date:date}}).select('id').single());
  const {account}=configuration();
  const identity=await meta(account,'GET',{fields:'id,username'});
  if(identity.username?.toLowerCase()!=='ventura_ai')throw new Error('A conta conectada não é @ventura_ai');
  // Starting at today's date avoids automatically publishing a historical backlog.
  const articles=checked(await db.from('articles').select('*').eq('status','published').eq('radar_date',date).order('editorial_score',{ascending:false}).order('published_at',{ascending:false})) as Article[];
  if(articles.length!==3){if(run)checked(await db.from('job_runs').update({status:'pending',finished_at:new Date().toISOString(),metrics:{radar_date:date,instagram:'waiting_for_three_articles',portal_published:articles.length}}).eq('id',run.id));return {instagram:'waiting_for_three_articles'};}
  for(const [index,article] of articles.entries()){
   const existing=checked(await db.from('instagram_posts').select('id').eq('article_id',article.id).eq('account_id',account).maybeSingle());
   if(existing)continue;
   const occupied=checked(await db.from('instagram_posts').select('id').eq('account_id',account).eq('radar_date',date).eq('slot',index+1).maybeSingle());
   if(occupied)continue;
   try{const draft=instagramDraft(article);checked(await db.from('instagram_posts').upsert({...draft,article_id:article.id,account_id:account,slot:index+1},{onConflict:'article_id,account_id',ignoreDuplicates:true}));}
   catch{failures++;checked(await db.from('job_runs').update({error:`Legenda ou capa inválida para artigo ${article.id}`}).eq('id',run!.id));}
  }
  const pending=checked(await db.from('instagram_posts').select('*').eq('account_id',account).eq('radar_date',date).in('status',['queued','creating','processing','publishing','review']).order('radar_date').order('created_at').limit(3)) as Post[];
  for(const post of pending){if(Date.now()>deadline-20000)break;
   try{if(await processPost(db,post,deadline))published++;}
   catch(error){failures++;const latest=checked(await db.from('instagram_posts').select('status').eq('id',post.id).single());await update(db,post.id,{status:latest?.status==='creating'?'queued':latest?.status||'review',last_error:error instanceof Error?error.message:'Falha de publicação'});}
  }
  const rows=checked(await db.from('instagram_posts').select('article_id,status,image_url').eq('account_id',account).eq('radar_date',date))||[];
  const ids=new Set(articles.map(a=>a.id));
  const confirmed=rows.filter(p=>p.status==='published'&&p.image_url?.trim()&&ids.has(p.article_id)).length;
  const complete=confirmed===3&&rows.length===3;
  const metrics={radar_date:date,instagram:complete?'completed':'pending',instagram_published:confirmed,instagram_newly_published:published,instagram_pending:3-confirmed,instagram_review:rows.filter(p=>['failed','review','cancelled'].includes(p.status)).length,instagram_failures:failures};
  if(run)checked(await db.from('job_runs').update({status:complete?'completed':'pending',finished_at:new Date().toISOString(),metrics}).eq('id',run.id));
  return metrics;
 }catch(error){
  if(run)checked(await db.from('job_runs').update({status:'failed',finished_at:new Date().toISOString(),error:error instanceof Error?error.message:'Falha Instagram'}).eq('id',run.id));
  throw error;
 }finally{checked(await db.rpc('release_job',{lock_name:'instagram',lock_owner:owner}));}
}
