import {createHmac,timingSafeEqual} from 'node:crypto';
import {escapeHtml as h,safeUrl} from './validation';
import type {Article,Partner} from './types';
function signature(value:string,secret:string){if(secret.length<32)throw Error('Daily email secret requires 32 characters');return createHmac('sha256',secret).update(value).digest('hex');}
export function dailyToken(action:'confirm'|'unsubscribe',id:string,nonce:string,secret:string){return signature(`daily:${action}:${id}:${nonce}`,secret);}
export function validDailyToken(action:'confirm'|'unsubscribe',id:string,nonce:string,token:string,secret:string){return /^[a-f0-9]{64}$/.test(token)&&timingSafeEqual(Buffer.from(token),Buffer.from(dailyToken(action,id,nonce,secret)));}
export function dailyEmail(date:string,articles:Article[],partner:Partner|null,appUrl:string,unsubscribe:string){
 if(articles.length!==3)throw Error('Daily email requires exactly three articles');
 const origin=safeUrl(appUrl);if(!origin)throw Error('HTTPS APP_URL required');
 const link=(path:string)=>new URL(path,origin).toString();
 const stories=articles.map(a=>({title:a.title,summary:a.summary.split(/\n\s*\n/)[0],url:link(`/arquivo#article-${a.id}`)}));
 const subject=`Radar Ventura · ${date}`;
 const partnerText=partner?`Parceiro patrocinado em destaque: ${partner.name}\n${partner.description}\n${link(`/partners/${partner.slug}`)}`:'Conheça os parceiros Ventura: '+link('/partners');
 return {subject,text:[subject,...stories.map(a=>`${a.title}\n${a.summary}\nLeia no Radar: ${a.url}`),partnerText,`Cancelar inscrição: ${unsubscribe}`].join('\n\n'),html:`<!doctype html><html lang="pt-BR"><body style="font:16px/1.6 Arial;background:#F7F6EF;color:#15142F"><main style="max-width:620px;margin:auto;padding:24px"><h1>Radar Ventura</h1><p>${h(date)} · Três notícias para quem empreende</p>${stories.map(a=>`<h2>${h(a.title)}</h2><p>${h(a.summary)}</p><p><a href="${h(a.url)}">Leia no Radar ↗</a></p>`).join('')}<hr>${partner?`<p>Parceiro patrocinado em destaque</p><h2>${h(partner.name)}</h2><p>${h(partner.description)}</p><a href="${h(link(`/partners/${partner.slug}`))}">Conhecer parceiro</a>`:`<a href="${h(link('/partners'))}">Conheça nossos parceiros</a>`}<p>Parceiros não influenciam a seleção editorial.</p><hr><a href="${h(unsubscribe)}">Cancelar inscrição</a><p>Você autorizou o recebimento do Radar Diário gratuito.</p></main></body></html>`};
}
