import 'server-only';
import {adminDb,checked} from './db';
import {feedAllowlist} from './pipeline-core';
import {pageCover,verifiedImageUrl} from './news-images';

type Db=ReturnType<typeof adminDb>;
// Missing images are recovered from the article's own metadata. No synthetic fallback is allowed.
export async function recoverEditionCovers(db:Db,date:string,deadline:number){
 const rows=checked(await db.from('articles').select('id,title,source_id,source_url,cover_url,cover_origin').eq('status','published').eq('radar_date',date))||[];
 let attempts=0,failures=0,recovered=0;
 for(const article of rows){
  if(article.cover_url?.trim()&&['feed','article'].includes(article.cover_origin||'')){
   const verified=await verifiedImageUrl(article.cover_url);
   if(verified){if(verified!==article.cover_url)checked(await db.from('articles').update({cover_url:verified}).eq('id',article.id));continue;}
  }
  if(Date.now()>deadline-10000)break;
  attempts++;
  try{
   const cover=await pageCover(article.source_url,feedAllowlist[article.source_id]?.hosts||[]);
   const verified=await verifiedImageUrl(cover.cover_url);
   if(!cover.cover_url||!verified){failures++;continue;}
   checked(await db.from('articles').update({...cover,cover_url:verified}).eq('id',article.id));recovered++;
  }catch{failures++;}
 }
 const confirmed=checked(await db.from('articles').select('cover_url,cover_origin').eq('status','published').eq('radar_date',date))||[];
 const verified=await Promise.all(confirmed.map(a=>a.cover_url?.trim()&&['feed','article'].includes(a.cover_origin||'')?verifiedImageUrl(a.cover_url):null));
 const withImages=verified.filter(Boolean).length;
 return {articles_with_images:withImages,articles_without_images:confirmed.length-withImages,cover_attempts:attempts,cover_failures:failures,covers_recovered:recovered};
}
