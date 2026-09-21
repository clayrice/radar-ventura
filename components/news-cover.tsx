"use client";
import {useState} from 'react';
import {safeUrl} from '@/lib/validation';
import type {Article} from '@/lib/types';
export function NewsCover({article}:{article:Article}){
 const [failed,setFailed]=useState(false);
 const imageAvailable=!!article.cover_url&&safeUrl(article.cover_url)&&!failed;
 return <figure className="news-cover"><a href={article.source_url} target="_blank" rel="noopener noreferrer" aria-label={`Ler na fonte: ${article.title}`}>{imageAvailable?<img src={article.cover_url!} alt={article.cover_caption||article.title} loading="lazy" referrerPolicy="no-referrer" onError={()=>setFailed(true)}/>:<div className="news-cover-fallback" role="img" aria-label={`Capa gráfica da Ventura para a notícia: ${article.title}`}><span className="news-cover-brand">VENTURA / RADAR</span><span className="news-cover-mark" aria-hidden="true">↗</span><strong>{article.title}</strong><span className="news-cover-source">{article.source_name}</span></div>}</a><figcaption>{imageAvailable&&article.cover_caption&&<span>{article.cover_caption} </span>}{imageAvailable&&article.cover_credit&&<span>Crédito: {article.cover_credit}. </span>}{!imageAvailable&&<span>Capa gráfica: Ventura AI. </span>}<a href={article.source_url} target="_blank" rel="noopener noreferrer">Ver matéria em {article.source_name} ↗</a></figcaption></figure>;
}
