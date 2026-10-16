import {emailFrame} from './radar-design';
import type {Edition} from './types';
import {escapeHtml as h,safeUrl} from './validation';
import {weeklyStories} from './weekly-stories';
import {label} from './labels';

export function editionEmail(e:Edition,appUrl:string,unsubscribeUrl:string){
 if(!e.content)throw Error('Missing edition content');
 const preview=e.status==='preview',c=e.content,origin=safeUrl(appUrl);
 if(!origin)throw Error('A public HTTPS APP_URL is required for email');
 const url=(path:string)=>new URL(path,origin).toString();
 const paragraphs=(text:string)=>text.split(/\n\s*\n/).filter(Boolean).map(p=>`<p style="margin:0 0 18px;font:16px/27px Arial,sans-serif">${h(p)}</p>`).join('');
 const stories=weeklyStories(e);
 const storiesHtml=stories.map(({article:a,summary,why},i)=>{
  const source=safeUrl(a.source_url);if(!source)throw Error('Invalid source');
  const image=a.cover_url&&safeUrl(a.cover_url)?`<a href="${h(source)}"><img src="${h(a.cover_url)}" alt="${h(a.cover_caption||a.title)}" width="544" style="display:block;width:100%;max-width:544px;height:auto;border:0;border-radius:8px"></a><p style="margin:10px 0 24px;color:#656474;font:12px/18px Arial,sans-serif">${h(a.cover_caption||'Imagem da reportagem original.')}${a.cover_credit?` Crédito: ${h(a.cover_credit)}.`:''}</p>`:'';
  const impact=why?`<div style="padding:20px;border-left:3px solid #524FF5;background:#F7F6EF;margin:24px 0"><p style="margin:0 0 10px;color:#524FF5;font:11px/18px Arial,sans-serif;letter-spacing:1px">LEITURA PARA O SEU NEGÓCIO</p><h3 style="margin:0 0 12px;font:600 22px/28px Arial,sans-serif">O que muda para o seu negócio</h3>${paragraphs(why)}</div>`:'';
  return `<p style="margin:0 0 12px;color:#524FF5;font:12px/20px Arial,sans-serif;letter-spacing:1px">${String(i+1).padStart(2,'0')} · ${h(label(a.category).toUpperCase())}</p><h2 style="margin:0 0 20px;font:600 25px/32px Arial,sans-serif">${h(a.title)}</h2>${image}${paragraphs(summary)}${impact}<p style="margin:20px 0 0;font:13px/22px Arial,sans-serif;color:#656474">${h(a.source_name)} · <a href="${h(source)}" style="color:#524FF5">Aprofunde aqui ↗</a></p><div style="height:1px;background:#E8E6EE;margin:32px 0"></div>`;
 }).join('');
 const heading=(text:string)=>`<h2 style="margin:28px 0 16px;font:600 26px/32px Arial,sans-serif">${text}</h2>`;
 const actions=c.actions.map((a,i)=>`<div style="padding:22px;background:#F7F6EF;border-radius:12px;margin:0 0 16px"><p style="margin:0 0 10px;color:#524FF5;font:12px/18px Arial,sans-serif">PASSO ${String(i+1).padStart(2,'0')} · ${h(a.effort)}</p><h3 style="margin:0 0 12px;font:600 22px/28px Arial,sans-serif">${h(a.title)}</h3>${paragraphs(a.detail)}</div>`).join('');
 const partners=heading('Parceiros para o próximo passo')+(e.partners.length?'<p style="color:#656474;font-size:13px">Conteúdo patrocinado relacionado aos seus próximos passos. Parceiros não influenciam a seleção editorial.</p>'+e.partners.map(p=>`<div style="padding:22px;background:#F7F6EF;border-radius:12px;margin:16px 0"><p style="color:#524FF5;font-size:11px;letter-spacing:1px">Parceiro patrocinado</p><h3 style="font:600 24px/30px Arial,sans-serif">${h(p.name)}</h3>${paragraphs(p.description)}<a href="${h(url(`/partners/${p.slug}`))}" style="color:#524FF5">Ver parceiro ↗</a></div>`).join(''):'<div style="padding:22px;background:#F7F6EF;border-radius:12px"><p style="margin:0 0 18px">Explore o diretório da Ventura para encontrar apoio nas próximas etapas.</p><a href="'+h(url('/partners'))+'" style="color:#524FF5">Encontrar um parceiro ↗</a></div>');
 const html=emailFrame(c.headline,preview?'Prévia de teste da sua edição semanal personalizada.':'Sua edição semanal personalizada da Ventura.',`<p style="margin:0 0 12px;color:#656474;font:12px/20px Arial,sans-serif">VENTURA SEMANAL${preview?' · PRÉVIA DE TESTE':''} · ${h(e.week_start)}</p><h1 style="margin:0 0 24px;font:600 36px/42px Arial,sans-serif">${h(c.headline)}</h1>${storiesHtml}${heading('Seus próximos passos')}${actions}${partners}`,`<p style="margin:0">Você recebeu este e-mail porque autorizou o envio da edição semanal da Ventura.</p><p style="margin:12px 0 0"><a href="${h(url(preview?'/account':`/account/editions/${e.id}`))}" style="color:#ffffff">Ler na minha conta</a> · <a href="${h(unsubscribeUrl)}" style="color:#DBFF4F">Cancelar envio</a></p>`,origin,'weekly');
 const text=[`VENTURA AI | ${e.week_start}`,c.headline,...stories.map(({article:a,summary,why})=>[a.title,a.cover_url?`Imagem: ${a.cover_url}`:'',summary,why?`O QUE MUDA PARA O SEU NEGÓCIO\n${why}`:'',`${a.source_name}\nAprofunde aqui: ${a.source_url}`].filter(Boolean).join('\n\n')),'SEUS PRÓXIMOS PASSOS',...c.actions.map(a=>`${a.title}: ${a.detail} (${a.effort})`),...(e.partners.length?['PARCEIROS PATROCINADOS',...e.partners.map(p=>`${p.name}: ${p.description} ${url(`/partners/${p.slug}`)}`)]:['PARCEIROS PARA O PRÓXIMO PASSO',`Diretório Ventura: ${url('/partners')}`]),`Histórico: ${url(preview?'/account':`/account/editions/${e.id}`)}`,`Cancelar envio: ${unsubscribeUrl}`].join('\n\n');
 return {subject:preview?`[PRÉVIA] ${c.headline}`:c.headline,html,text};
}
