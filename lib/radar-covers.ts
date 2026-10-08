import 'server-only';
import {adminDb,checked} from './db';
import {instagramArtwork} from './instagram-art';

type Db=ReturnType<typeof adminDb>;
// A stable object name makes retries safe after an interrupted upload or database write.
export async function recoverEditionCovers(db:Db,date:string,deadline:number){
 const rows=checked(await db.from('articles').select('id,title,source_name,cover_url').eq('status','published').eq('radar_date',date))||[];
 let attempts=0,failures=0,recovered=0;
 for(const article of rows){
  if(article.cover_url?.trim())continue;
  for(let attempt=0;attempt<2&&Date.now()<deadline-10000;attempt++){
   attempts++;
   try{
    const image=await instagramArtwork({...article,radar_date:date});
    const path=`radar/${date}/${article.id}.jpg`;
    checked(await db.storage.from('instagram-media').upload(path,image,{contentType:'image/jpeg',upsert:true}));
    const url=db.storage.from('instagram-media').getPublicUrl(path).data.publicUrl;
    checked(await db.from('articles').update({cover_url:url,cover_credit:'Arte: Ventura AI',cover_caption:article.title}).eq('id',article.id));
    recovered++;break;
   }catch{failures++;}
  }
 }
 const confirmed=checked(await db.from('articles').select('cover_url').eq('status','published').eq('radar_date',date))||[];
 const withImages=confirmed.filter(a=>a.cover_url?.trim()).length;
 return {articles_with_images:withImages,articles_without_images:confirmed.length-withImages,cover_attempts:attempts,cover_failures:failures,covers_recovered:recovered};
}
