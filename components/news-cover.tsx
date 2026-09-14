"use client";
import {useState} from 'react';
import {safeUrl} from '@/lib/validation';
import type {Article} from '@/lib/types';
export function NewsCover({article}:{article:Article}){
 const [failed,setFailed]=useState(false);
 if(!article.cover_url||!safeUrl(article.cover_url)||failed)return null;
 return <figure className="news-cover"><a href={article.source_url} target="_blank" rel="noopener noreferrer" aria-label={`Ler na fonte: ${article.title}`}><img src={article.cover_url} alt={article.cover_caption||article.title} loading="lazy" referrerPolicy="no-referrer" onError={()=>setFailed(true)}/></a><figcaption>{article.cover_caption&&<span>{article.cover_caption} </span>}{article.cover_credit&&<span>Crédito: {article.cover_credit}. </span>}<a href={article.source_url} target="_blank" rel="noopener noreferrer">Ver matéria em {article.source_name} ↗</a></figcaption></figure>;
}
