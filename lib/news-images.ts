import {safeUrl} from './validation';
type MediaNode={$?:{url?:string;type?:string;medium?:string};'media:credit'?:string[];'media:description'?:string[]};
export function feedCover(item:{enclosure?:{url?:string;type?:string};mediaContent?:MediaNode[]}){
 const media=item.mediaContent?.find(node=>node.$?.medium==='image'||node.$?.type?.startsWith('image/'));
 const raw=media?.$?.url||(item.enclosure?.type?.startsWith('image/')?item.enclosure.url:undefined);
 if(!raw)return {};
 const url=safeUrl(raw);if(!url)return {};
 // These URLs are rendered by the browser, never fetched by a server-side image proxy.
 const hostname=new URL(url).hostname;
 if(hostname==='localhost'||hostname.endsWith('.local')||hostname==='[::1]'||/^(127\.|10\.|192\.168\.|169\.254\.|172\.(1[6-9]|2\d|3[01])\.)/.test(hostname))return {};
 return {cover_url:url,cover_credit:media?.['media:credit']?.[0]?.replace(/<[^>]*>/g,'').slice(0,300)||null,cover_caption:null};
}
