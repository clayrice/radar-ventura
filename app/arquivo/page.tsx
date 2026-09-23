import type {Metadata} from 'next';
import Link from 'next/link';
import {ArrowUpRight} from 'lucide-react';
import {NewsFeed} from '@/components/news-feed';
import {archiveEditions} from '@/lib/data';
import {formatRadarDate} from '@/lib/radar-dates';

export const dynamic='force-dynamic';
export const metadata:Metadata={title:'Arquivo do Radar',description:'Edições anteriores do Radar Ventura sobre inteligência artificial, negócios e trabalho.'};

export default async function ArchivePage(){
 const editions=await archiveEditions();
 return <main id="main" className="wrap archive-page">
  <header className="page-heading archive-heading"><span className="eyebrow">RADAR VENTURA</span><h1>Arquivo do Radar</h1><p>Releia as histórias, os debates e as mudanças que marcaram cada edição.</p><Link className="text-link" href="/">Voltar ao Radar de hoje <ArrowUpRight size={15}/></Link></header>
  {editions.map(edition=><section className="archive-edition" key={edition.date} aria-labelledby={`edition-${edition.date}`}><div className="archive-edition-head"><div><span className="mini-label">EDIÇÃO</span><h2 id={`edition-${edition.date}`}>{formatRadarDate(edition.date)}</h2></div><span className="mini-label">{edition.articles.length} {edition.articles.length===1?'NOTÍCIA':'NOTÍCIAS'}</span></div><NewsFeed articles={edition.articles}/></section>)}
  {!editions.length&&<section className="empty archive-empty"><h2>O arquivo começa em breve</h2><p>As edições anteriores aparecerão aqui conforme o Radar for publicado.</p></section>}
 </main>;
}
