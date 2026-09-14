import fs from 'node:fs/promises';
import Parser from 'rss-parser';
const file=new URL('../lib/source-registry.json',import.meta.url);
const sources=JSON.parse(await fs.readFile(file,'utf8'));
const parser=new Parser();
async function fetchText(url){const r=await fetch(url,{signal:AbortSignal.timeout(15000),headers:{'User-Agent':'VenturaRadar/0.1'}});if(!r.ok)throw new Error(`HTTP ${r.status}`);const text=await r.text();if(text.length>3000000)throw new Error('Feed muito grande');return {text,url:r.url};}
async function check(s){try{let target=s.feed_url;if(!target){const {text}=await fetchText(s.url);const tags=text.match(/<link\b[^>]*>/gi)||[];for(const tag of tags){if(/application\/(rss|atom)\+xml/i.test(tag)){const href=tag.match(/href=["']([^"']+)["']/i)?.[1];if(href){target=new URL(href,s.url).toString();break;}}}if(!target){s.note='Sem RSS declarado; conector pendente';return;}}
const {text,url}=await fetchText(target);if(/<!DOCTYPE|<!ENTITY/i.test(text))throw new Error('Resposta não é um feed XML permitido');const feed=await parser.parseString(text);if(!feed.items.length)throw new Error('Feed sem itens');s.feed_url=url;s.verified=true;s.enabled=true;s.checked_at=new Date().toISOString();s.note=`RSS validado (${feed.items.length} itens)`;s.article_hosts=[...new Set(feed.items.map(i=>{try{return new URL(i.link).hostname;}catch{return null;}}).filter(Boolean))];
}catch(e){s.verified=false;s.enabled=false;s.note=`Pendente: ${e.message}`;}finally{console.log(`${s.verified?'OK':'PENDENTE'} ${s.name}: ${s.note}`);}}
for(let i=0;i<sources.length;i+=4)await Promise.all(sources.slice(i,i+4).map(check));
await fs.writeFile(file,JSON.stringify(sources,null,2)+'\n');
console.log(`${sources.filter(s=>s.verified).length}/${sources.length} feeds validados`);
