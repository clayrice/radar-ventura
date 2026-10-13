import {createHmac,timingSafeEqual} from 'node:crypto';
import {escapeHtml as h,safeUrl} from './validation';
import type {Article,Partner} from './types';
import {emailFrame} from './radar-design';
import {dailyMix} from './editorial';
import {label} from './labels';
import {formatRadarDate} from './radar-dates';
function signature(value:string,secret:string){if(secret.length<32)throw Error('Daily email secret requires 32 characters');return createHmac('sha256',secret).update(value).digest('hex');}
export function dailyToken(action:'confirm'|'unsubscribe',id:string,nonce:string,secret:string){return signature(`daily:${action}:${id}:${nonce}`,secret);}
export function validDailyToken(action:'confirm'|'unsubscribe',id:string,nonce:string,token:string,secret:string){return /^[a-f0-9]{64}$/.test(token)&&timingSafeEqual(Buffer.from(token),Buffer.from(dailyToken(action,id,nonce,secret)));}
export function dailyEmail(date:string,articles:Article[],partner:Partner|null,appUrl:string,unsubscribe:string){
 if(articles.length!==3)throw Error('Daily email requires exactly three articles');
 const origin=safeUrl(appUrl);if(!origin)throw Error('HTTPS APP_URL required');
 const link=(path:string)=>new URL(path,origin).toString();
 const editionUrl=link(`/arquivo?edicao=${encodeURIComponent(date)}#edition-${date}`);
 const editionDate=/^\d{4}-\d{2}-\d{2}$/.test(date)?formatRadarDate(date):date;
 // Use the same publication order and category mix as the website, without rewriting its text.
 const stories=dailyMix(articles).map(a=>({...a,paragraphs:a.summary.split(/\n\s*\n/).filter(Boolean),url:link(`/arquivo?edicao=${encodeURIComponent(date)}#article-${a.id}`)}));
 const subject=`Radar Ventura · ${date}`;
 const partnerText=partner?`Parceiro patrocinado em destaque: ${partner.name}\n${partner.description}\n${link(`/partners/${partner.slug}`)}`:'Conheça os parceiros Ventura: '+link('/partners');
 const storiesHtml=stories.map((a,i)=>{
 const source=safeUrl(a.source_url);if(!source)throw Error('Valid source URL required');
 const image=a.cover_url&&safeUrl(a.cover_url)?`<a href="${h(source)}"><img src="${h(a.cover_url)}" alt="${h(a.cover_caption||a.title)}" width="544" style="display:block;width:100%;max-width:544px;height:auto;border:0;border-radius:8px"></a><p style="margin:10px 0 24px;color:#656474;font:12px/18px Arial,sans-serif">${h(a.cover_caption||'Imagem da reportagem original.')}${a.cover_credit?` Crédito: ${h(a.cover_credit)}.`:''} <a href="${h(source)}" style="color:#524FF5">Ver matéria em ${h(a.source_name)} ↗</a></p>`:'';
 const published=new Date(a.published_at).toLocaleDateString('pt-BR',{month:'short',day:'numeric',timeZone:'UTC'});
 const paragraphs=a.paragraphs.map(text=>`<p style="margin:0 0 18px;font:16px/27px Arial,sans-serif;color:#15142F">${h(text)}</p>`).join('');
 const impact=a.brazil_impact?`<div style="padding:20px;border-left:3px solid #524FF5;background:#F7F6EF;margin:24px 0"><p style="margin:0 0 10px;color:#524FF5;font:11px/18px Arial,sans-serif;letter-spacing:1px">LEITURA VENTURA</p><h3 style="margin:0 0 12px;font:600 22px/28px Arial,sans-serif">E a gente com isso? 🇧🇷</h3><p style="margin:0;font:16px/27px Arial,sans-serif">${h(a.brazil_impact)}</p></div>`:'';
 return `<p style="margin:0 0 12px;color:#524FF5;font:12px/20px Arial,sans-serif;letter-spacing:1px">${String(i+1).padStart(2,'0')} · ${h(label(a.category).toUpperCase())} · ${h(published)}</p><h2 style="margin:0 0 20px;font:600 27px/34px Arial,sans-serif;color:#15142F">${h(a.title)}</h2>${image}${paragraphs}${impact}<p style="margin:20px 0 0;font:13px/22px Arial,sans-serif;color:#656474">${h(a.source_name)} · <a href="${h(source)}" style="color:#524FF5">Aprofunde aqui ↗</a> · <a href="${h(a.url)}" style="color:#524FF5">Ler no Radar</a></p><div style="height:1px;background:#E8E6EE;margin:32px 0"></div>`;
 }).join('');
 const partnerHtml=partner?`<div style="padding:22px;background:#F7F6EF;border-radius:12px"><p style="margin:0 0 12px;font-size:11px;letter-spacing:1px;color:#524FF5">PARCEIRO PATROCINADO EM DESTAQUE</p><h2 style="margin:0 0 12px;font:600 24px/30px Arial,sans-serif">${h(partner.name)}</h2><p style="margin:0 0 18px">${h(partner.description)}</p><a href="${h(link(`/partners/${partner.slug}`))}" style="color:#524FF5">Conhecer parceiro →</a></div>`:`<p style="margin:0"><a href="${h(link('/partners'))}" style="color:#524FF5">Conheça nossos parceiros →</a></p>`;
 const text=[subject,`Ler a edição online: ${editionUrl}`,...stories.map(a=>[`${label(a.category)} · ${a.title}`,a.cover_url?`Imagem: ${a.cover_url}`:'',a.cover_caption||'',a.cover_credit?`Crédito: ${a.cover_credit}`:'',a.summary,a.brazil_impact?`LEITURA VENTURA\nE a gente com isso? 🇧🇷\n${a.brazil_impact}`:'',`${a.source_name}\nAprofunde aqui: ${a.source_url}`,`Leia no Radar: ${a.url}`].filter(Boolean).join('\n\n')),partnerText,`Cancelar inscrição: ${unsubscribe}`].join('\n\n');
 return {subject,text,html:emailFrame(subject,'A edição completa do Radar: notícias de IA e a leitura para quem empreende.',`<p style="margin:0 0 12px;font:13px/20px Arial,sans-serif"><a href="${h(editionUrl)}" style="color:#524FF5">Ler a edição online ↗</a></p><p style="margin:0 0 28px;color:#656474;font:14px/22px Arial,sans-serif">Edição de ${h(editionDate)}</p>${storiesHtml}${partnerHtml}<p style="font-size:12px;color:#656474;margin:16px 0 0">Parceiros não influenciam a seleção editorial.</p>`,`<p style="margin:0">Você autorizou o recebimento do Radar Diário gratuito.</p><p style="margin:12px 0 0"><a href="${h(unsubscribe)}" style="color:#DBFF4F">Cancelar inscrição</a> · <a href="${h(link('/'))}" style="color:#ffffff">Abrir o Radar</a></p>`,origin)};
}
