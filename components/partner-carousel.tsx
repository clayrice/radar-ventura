"use client";
import {useState} from 'react';
import type {PartnerMedia} from '@/lib/partner-media';
export function PartnerCarousel({items=[],name}:{items?:PartnerMedia[];name:string}){
 const [index,setIndex]=useState(0);const [failed,setFailed]=useState<string|null>(null);
 const current=items[Math.min(index,items.length-1)];
 if(!current)return <div className="partner-showcase-empty"><span>CONHEÇA O PARCEIRO</span><strong>{name}</strong><small>Conhecimento para colocar a IA em prática ↗</small></div>;
 const move=(n:number)=>{setIndex((n+items.length)%items.length);setFailed(null);};
 return <section className="partner-showcase" aria-label={`Apresentação de ${name}`} aria-roledescription="carrossel" onKeyDown={e=>{if((e.target as HTMLElement).tagName==='VIDEO')return;if(e.key==='ArrowRight'){e.preventDefault();move(index+1);}if(e.key==='ArrowLeft'){e.preventDefault();move(index-1);}}}>
  <div className="showcase-frame">
   {failed===current.url?<p className="showcase-error">Não foi possível carregar este material.</p>:current.kind==='video'?<video key={current.url} src={current.url} controls playsInline preload="metadata" poster={items.find(item=>item.kind==='image')?.url} aria-label={current.caption} onError={()=>setFailed(current.url)}/>:<img src={current.url} alt={current.caption} loading="lazy" onError={()=>setFailed(current.url)}/>}
  </div>
  {items.length>1&&<div className="showcase-controls"><button type="button" aria-label={`Material anterior de ${name}`} onClick={()=>move(index-1)}>←</button><button type="button" aria-label={`Próximo material de ${name}`} onClick={()=>move(index+1)}>→</button></div>}

 </section>;
}
