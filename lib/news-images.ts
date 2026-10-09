import {safeUrl} from './validation';
type MediaNode={$?:{url?:string;type?:string;medium?:string};'media:credit'?:string[];'media:description'?:string[]};
type FeedImageItem={enclosure?:{url?:string;type?:string};mediaContent?:MediaNode[];mediaThumbnail?:MediaNode[]};
function publicImageUrl(input:string|null|undefined,base?:string){
 if(!input)return null;
 let resolved:string;
 try{resolved=base?new URL(input,base).toString():input;}catch{return null;}
 const url=safeUrl(resolved);if(!url)return null;
 const hostname=new URL(url).hostname;
 if(hostname==='localhost'||hostname.endsWith('.local')||hostname==='[::1]'||/^(127\.|10\.|192\.168\.|169\.254\.|172\.(1[6-9]|2\d|3[01])\.)/.test(hostname))return null;
 return url;
}
export async function verifiedImageUrl(input:string|null|undefined,fetcher:typeof fetch=fetch){
 const url=publicImageUrl(input);if(!url)return null;
 try{
  const response=await fetcher(url,{signal:AbortSignal.timeout(8000),redirect:'follow',headers:{'User-Agent':'Mozilla/5.0 (compatible; VenturaRadar/0.1)','Accept':'image/avif,image/webp,image/*'}});
  if(!response.ok||!response.headers.get('content-type')?.toLowerCase().startsWith('image/')||!response.body)return null;
  const finalUrl=publicImageUrl(response.url||url);if(!finalUrl)return null;
  const reader=response.body.getReader();const chunks:Uint8Array[]=[];let size=0;
  try{while(true){const {done,value}=await reader.read();if(done)break;size+=value.length;if(size>6000000)return null;chunks.push(value);}}finally{await reader.cancel();}
  const sharp=(await import('sharp')).default;const dimensions=await sharp(Buffer.concat(chunks),{limitInputPixels:30000000}).metadata();
  return dimensions.width&&dimensions.height?finalUrl:null;
 }catch{return null;}
}
export function feedCover(item:FeedImageItem){
 const media=[...(item.mediaContent||[]),...(item.mediaThumbnail||[])].find(node=>node.$?.medium==='image'||node.$?.type?.startsWith('image/')||!!node.$?.url);
 const raw=media?.$?.url||(item.enclosure?.type?.startsWith('image/')?item.enclosure.url:undefined);
 const url=publicImageUrl(raw);if(!url)return {};
 return {cover_url:url,cover_origin:'feed',cover_credit:media?.['media:credit']?.[0]?.replace(/<[^>]*>/g,'').slice(0,300)||null,cover_caption:null};
}

function decodeHtml(value:string){return value.replace(/&#(\d+);/g,(_,n)=>String.fromCodePoint(Number(n))).replace(/&#x([\da-f]+);/gi,(_,n)=>String.fromCodePoint(parseInt(n,16))).replace(/&quot;/gi,'"').replace(/&#39;|&apos;/gi,"'").replace(/&amp;/gi,'&').replace(/&lt;/gi,'<').replace(/&gt;/gi,'>');}
function metaContent(html:string,key:string){
 const escaped=key.replace(/[.*+?^${}()|[\]\\]/g,'\\$&');
 const patterns=[new RegExp(`<meta[^>]+(?:property|name)=["']${escaped}["'][^>]+content=["']([^"']+)["'][^>]*>`,'i'),new RegExp(`<meta[^>]+content=["']([^"']+)["'][^>]+(?:property|name)=["']${escaped}["'][^>]*>`,'i')];
 for(const pattern of patterns){const match=html.match(pattern);if(match)return decodeHtml(match[1].trim());}
 return null;
}
export async function pageCover(sourceUrl:string,allowedHosts:string[],fetcher:typeof fetch=fetch){
 const source=safeUrl(sourceUrl);if(!source||!allowedHosts.includes(new URL(source).hostname))return {};
 const response=await fetcher(source,{signal:AbortSignal.timeout(10000),redirect:'follow',headers:{'User-Agent':'Mozilla/5.0 (compatible; VenturaRadar/0.1; +https://ventura-ai.com)','Accept':'text/html,application/xhtml+xml'}});
 if(!response.ok||!response.headers.get('content-type')?.toLowerCase().includes('text/html'))return {};
 const finalUrl=safeUrl(response.url||source);if(!finalUrl||!allowedHosts.includes(new URL(finalUrl).hostname))return {};
 const reader=response.body?.getReader();if(!reader)return {};
 const decoder=new TextDecoder();let html='';let bytes=0;
 try{while(true){const {done,value}=await reader.read();if(done)break;bytes+=value.length;if(bytes>1_500_000)break;html+=decoder.decode(value,{stream:true});if(/<\/head>/i.test(html))break;}html+=decoder.decode();}finally{await reader.cancel();}
 const raw=metaContent(html,'og:image:secure_url')||metaContent(html,'og:image')||metaContent(html,'twitter:image');
 const coverUrl=publicImageUrl(raw,finalUrl);if(!coverUrl)return {};
 const caption=(metaContent(html,'og:image:alt')||metaContent(html,'twitter:image:alt'))?.replace(/\s+/g,' ').trim().slice(0,500)||null;
 return {cover_url:coverUrl,cover_origin:'article',cover_caption:caption,cover_credit:null};
}
