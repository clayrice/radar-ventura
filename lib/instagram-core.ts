import type {Article} from './types';

export function instagramDraft(article:Article){
 const paragraphs=article.summary.split(/\n\s*\n/).map(p=>p.trim()).filter(Boolean);
 if(paragraphs.length<2||!article.brazil_impact?.trim())throw new Error('Notícia incompleta para Instagram');
 const split=Math.ceil(paragraphs.length/2);
 const news=[paragraphs.slice(0,split).join(' '),paragraphs.slice(split).join(' ')];
 const caption=`${news.join('\n\n')}\n\nE a gente com isso? 🇧🇷\n${article.brazil_impact.trim()}\n\nLeia a notícia completa no Radar Ventura. Link na bio.\nFonte: ${article.source_name}`;
 // Do not silently truncate facts, attribution or the Brazilian reflection.
 if([...caption].length>2200)throw new Error('Legenda excede o limite; revisar antes de publicar');
 if([...article.title].length>240)throw new Error('Título exige revisão para a capa');
 return {title:article.title,caption,source_name:article.source_name,radar_date:article.radar_date,cover_url:article.cover_url||null};
}

export function instagramPublishAction(state:string,containerStatus:string){
 if(state==='processing'&&containerStatus==='FINISHED')return 'publish';
 if((state==='publishing'||state==='review')&&containerStatus==='PUBLISHED')return 'confirm';
 if(state==='publishing'||state==='review')return 'review';
 if(['ERROR','EXPIRED'].includes(containerStatus))return 'fail';
 return 'wait';
}
