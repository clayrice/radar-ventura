import {load} from 'cheerio';
import {safeUrl} from './validation';
import {pageCoverFromHtml} from './news-images';
export const SOURCE_TEXT_LIMIT=14000;
export function extractArticleText(html:string){
 const $=load(html);
 // Keep visible editorial paragraphs, never menus, comments or subscription prompts.
 $('script,style,noscript,nav,header,footer,aside,form,[hidden],[aria-hidden="true"],.comments,.related-posts,.related-articles,.newsletter,.paywall').remove();
 const selectors=['[itemprop="articleBody"]','.entry-content','.article-content','.article-body','.body.markup','article'];
 for(const selector of selectors){
  const blocks=$(selector).toArray().map(node=>{
   const paragraphs=$(node).find('p').toArray().map(p=>$(p).text().replace(/\s+/g,' ').trim()).filter(p=>p.length>=40);
   return [...new Set(paragraphs)].join('\n\n').slice(0,SOURCE_TEXT_LIMIT);
  }).filter(text=>text.length>=600).sort((a,b)=>b.length-a.length);
  if(blocks.length)return blocks[0];
 }
 return '';
}
export async function sourceContext(sourceUrl:string,allowedHosts:string[],fetcher:typeof fetch=fetch,timeout=8000){
 const allowed=(input:string)=>{const url=safeUrl(input);return url&&allowedHosts.includes(new URL(url).hostname)?url:null;};
 let url=allowed(sourceUrl);if(!url)return {text:''};
 const signal=AbortSignal.timeout(Math.max(1,timeout));
 // Check each redirect BEFORE fetching it, as well as the final response origin.
 for(let redirects=0;redirects<=3;redirects++){
  const response=await fetcher(url,{signal,redirect:'manual',headers:{'User-Agent':'Mozilla/5.0 (compatible; VenturaRadar/0.3)','Accept':'text/html,application/xhtml+xml'}});
  if([301,302,303,307,308].includes(response.status)){
   const location=response.headers.get('location');await response.body?.cancel();
   if(!location)return {text:''};url=allowed(new URL(location,url).toString());if(!url)return {text:''};continue;
  }
  if(!response.ok||!response.headers.get('content-type')?.toLowerCase().includes('text/html')||!allowed(response.url||url)||!response.body){await response.body?.cancel();return {text:''};}
  const reader=response.body.getReader();const decoder=new TextDecoder();let html='',bytes=0;
  try{while(true){const part=await reader.read();if(part.done)break;bytes+=part.value.length;if(bytes>2_000_000)break;html+=decoder.decode(part.value,{stream:true});}html+=decoder.decode();}finally{await reader.cancel();}
  return {text:extractArticleText(html),...pageCoverFromHtml(html,response.url||url)};
 }
 return {text:''};
}
