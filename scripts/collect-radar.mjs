import fs from 'node:fs/promises';
import Parser from 'rss-parser';
const sources=JSON.parse(await fs.readFile(new URL('../lib/source-registry.json',import.meta.url),'utf8'));
const parser=new Parser();const checkedAt=new Date().toISOString();const items=[];const results=[];
async function collect(source){
 if(!source.enabled||!source.feed_url){results.push({id:source.id,name:source.name,status:'pending',reason:'Conector pendente'});return;}
 try{
  const response=await fetch(source.feed_url,{signal:AbortSignal.timeout(15000),headers:{'User-Agent':'VenturaRadar/0.1 (+https://ventura-ai.com)'}});
  if(!response.ok)throw new Error(`HTTP ${response.status}`);
  const reader=response.body.getReader();let xml='';let bytes=0;const decoder=new TextDecoder();
  try{while(true){const {done,value}=await reader.read();if(done)break;bytes+=value.length;if(bytes>3000000)throw new Error('Feed excede 3 MB');xml+=decoder.decode(value,{stream:true});}xml+=decoder.decode();}finally{await reader.cancel();}
  if(/<!DOCTYPE|<!ENTITY/i.test(xml))throw new Error('XML não permitido');
  const feed=await parser.parseString(xml);let recent=0;
  for(const item of feed.items.slice(0,30)){
   const date=new Date(item.isoDate||item.pubDate||'');if(!Number.isFinite(+date)||+date>Date.now()||+date<Date.now()-7*86400000||!item.link)continue;
   const url=new URL(item.link);if(url.protocol!=='https:'||!source.article_hosts.includes(url.hostname))continue;
   recent++;items.push({source_id:source.id,source_name:source.name,source_kind:source.kind,title:item.title,url:item.link,published_at:date.toISOString(),excerpt:(item.contentSnippet||item.summary||item.content||'').replace(/<[^>]+>/g,' ').replace(/\s+/g,' ').trim().slice(0,5000)});
  }
  results.push({id:source.id,name:source.name,status:'connected',recent_items:recent});
 }catch(error){results.push({id:source.id,name:source.name,status:'error',reason:error.message});}
}
for(let n=0;n<sources.length;n+=4)await Promise.all(sources.slice(n,n+4).map(collect));
items.sort((a,b)=>b.published_at.localeCompare(a.published_at));
await fs.writeFile(new URL('../data/radar/collection.json',import.meta.url),JSON.stringify({checked_at:checkedAt,results,items},null,2)+'\n');
console.log(JSON.stringify({checked_at:checkedAt,connected:results.filter(s=>s.status==='connected').length,items:items.length,results},null,2));

await fs.writeFile(new URL('../data/radar/collection-status.json',import.meta.url),JSON.stringify({checked_at:checkedAt,item_count:items.length,results},null,2)+'\n');
