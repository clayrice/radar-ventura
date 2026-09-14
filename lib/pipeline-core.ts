import {createHash} from 'node:crypto';
import {canonicalUrl,editionSchema} from './validation';
import type {Article,Partner,EditionContent} from './types';
import registry from './source-registry.json';
export const feedAllowlist:Record<string,{url:string;hosts:string[];kind:string}>=Object.fromEntries(registry.filter(s=>s.verified&&s.feed_url).map(s=>[s.id,{url:s.feed_url!,hosts:s.article_hosts||[new URL(s.url).hostname],kind:s.kind}]));
export function sourceArticleUrl(input:string,sourceId:string){const url=canonicalUrl(input);if(!url)return null;return feedAllowlist[sourceId]?.hosts.includes(new URL(url).hostname)?url:null;}
export function titleKey(title:string){return createHash('sha256').update(title.toLowerCase().normalize('NFKC').replace(/[^\p{L}\p{N}]+/gu,' ').trim()).digest('hex');}
export function validateEdition(raw:unknown,articles:Article[]):EditionContent{const e=editionSchema.parse(raw);const ids=new Set(articles.map(a=>a.id));for(const item of [...e.overview,...e.relevant])if(!ids.has(item.article_id))throw new Error('Unknown article reference');if(new Set(e.overview.map(x=>x.article_id)).size!==e.overview.length||new Set(e.relevant.map(x=>x.article_id)).size!==e.relevant.length)throw new Error('Duplicate article references');return e;}
export function matchPartners(partners:Partner[],sector:string,content:EditionContent):Partner[]{const needs=new Set(content.actions.map(a=>a.capability));return partners.filter(p=>p.active&&['connections','strategic'].includes(p.plan)&&p.sectors.includes(sector)&&p.capabilities.some(c=>needs.has(c))).sort((a,b)=>b.capabilities.filter(c=>needs.has(c)).length-a.capabilities.filter(c=>needs.has(c)).length||a.id.localeCompare(b.id)).slice(0,2);}
export function retryDelivery(start:string|null,now=Date.now()){return !start||now-new Date(start).getTime()<23*60*60*1000;}
