"use client";
import {useEffect,useRef,useState} from 'react';
import {createBrowserClient} from '@supabase/ssr';
import {PartnerCarousel} from './partner-carousel';
import {savePartnerMedia} from '@/app/partner-media-actions';
import {MEDIA_BUCKET,mediaFileError,mediaTypes,type PartnerMedia} from '@/lib/partner-media';
export function PartnerMediaEditor({initial=[],demo,ready}:{initial?:PartnerMedia[];demo:boolean;ready:boolean}){
 const [items,setItems]=useState(initial);const [busy,setBusy]=useState(false);const [message,setMessage]=useState('');
 const occupied=useRef(new Set(initial.map(i=>i.path.split('/').pop())));const blobs=useRef<string[]>([]);
 useEffect(()=>()=>{blobs.current.forEach(url=>URL.revokeObjectURL(url));},[]);
 async function upload(files:File[]){
  if(!files.length)return;setMessage('');
  if(items.length+files.length>6){setMessage('A vitrine pode ter até seis itens.');return;}
  if(items.filter(i=>i.kind==='video').length+files.filter(f=>mediaTypes[f.type]==='video').length>1){setMessage('Escolha apenas um vídeo para a capa.');return;}
  for(const file of files){const error=mediaFileError(file.type,file.size);if(error){setMessage(`${file.name}: ${error}`);return;}}
  if(6-occupied.current.size<files.length){setMessage('Salve as remoções antes de enviar novos materiais.');return;}
  setBusy(true);const added:PartnerMedia[]=[];
  try{
   const db=demo?null:createBrowserClient(process.env.NEXT_PUBLIC_SUPABASE_URL!,process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!);
   const user= db ? (await db.auth.getUser()).data.user : null;
   if(db&&!user)throw new Error('Entre novamente para enviar arquivos.');
   for(const file of files){
    const slot=Array.from({length:6},(_,i)=>String(i)).find(i=>!occupied.current.has(i))!;
    const path=`${user?.id||'demo'}/${slot}`;let url:string;
    if(db){const {error}=await db.storage.from(MEDIA_BUCKET).upload(path,file,{upsert:true,contentType:file.type,cacheControl:'60'});if(error)throw new Error('Não foi possível enviar o arquivo. Confira sua conexão e tente novamente.');url=db.storage.from(MEDIA_BUCKET).getPublicUrl(path).data.publicUrl+`?v=${Date.now()}`;}
    else{url=URL.createObjectURL(file);blobs.current.push(url);}
    occupied.current.add(slot);added.push({path,url,kind:mediaTypes[file.type],caption:file.name.replace(/\.[^.]+$/,'').slice(0,160)||'Apresentação do parceiro'});
   }
   setMessage(demo?'Prévia local: os arquivos não foram enviados.':'Arquivos enviados. Revise as descrições e salve a vitrine.');
  }catch(error){setMessage(error instanceof Error?error.message:'Falha no envio. Tente novamente.');}
  finally{setItems(old=>[...old,...added].sort((a,b)=>Number(b.kind==='video')-Number(a.kind==='video')));setBusy(false);}
 }
 async function save(){setBusy(true);try{const result=await savePartnerMedia(items.map(({path,kind,caption})=>({path,kind,caption})));setMessage(result.message);if(result.ok)occupied.current=new Set(items.map(i=>i.path.split('/').pop()));}catch{setMessage('Não foi possível salvar. Tente novamente.');}finally{setBusy(false);}}
 function move(index:number,offset:number){const target=index+offset;if(target<0||target>=items.length||items[index].kind==='video'||items[target].kind==='video')return;setItems(old=>{const copy=[...old];[copy[index],copy[target]]=[copy[target],copy[index]];return copy;});}
 return <section className="panel media-editor"><span className="eyebrow">SUA VITRINE NO CATÁLOGO</span><h2>Mostre como você <em>pode ajudar.</em></h2><p>Apresente seu trabalho com até seis slides em imagem ou um vídeo de capa e até cinco imagens. O primeiro item é a capa do card.</p><p className="fine">JPG, PNG ou WebP: até 5 MB por imagem. MP4 ou WebM: até 40 MB. Para slides de PowerPoint, Canva ou PDF, exporte cada página como imagem. Prefira o formato horizontal 16:9 e inclua legendas no vídeo.</p>
 {!ready&&!demo&&<p className="notice">Salve seu cadastro acima para liberar o envio dos materiais.</p>}
 <label className="field">Adicionar slides ou vídeo<input type="file" accept="image/jpeg,image/png,image/webp,video/mp4,video/webm" multiple disabled={busy||(!ready&&!demo)} onChange={e=>{void upload(Array.from(e.target.files||[]));e.target.value='';}}/></label>
 <p className="fine">Envie apenas materiais que você tem autorização para publicar. Os arquivos enviados têm um link público.</p>
 <div className="media-editor-grid"><div><ol className="media-editor-list">{items.map((item,index)=><li key={item.path}><label className="field">{index===0?'Capa':`Slide ${index+1}`} · {item.kind==='video'?'Vídeo':'Imagem'}<input aria-label={`Descrição do material ${index+1}`} value={item.caption} maxLength={160} disabled={busy} onChange={e=>setItems(old=>old.map((i,n)=>n===index?{...i,caption:e.target.value}:i))}/></label><div className="media-item-actions"><button type="button" disabled={busy||index===0||item.kind==='video'||items[index-1]?.kind==='video'} onClick={()=>move(index,-1)} aria-label={`Mover material ${index+1} para antes`}>← Antes</button><button type="button" disabled={busy||index===items.length-1||item.kind==='video'} onClick={()=>move(index,1)} aria-label={`Mover material ${index+1} para depois`}>Depois →</button><button type="button" disabled={busy} onClick={()=>setItems(old=>old.filter((_,n)=>n!==index))}>Remover</button></div></li>)}</ol><button type="button" className="button" disabled={busy||(!ready&&!demo)} onClick={save}>{busy?'Preparando vitrine…':'Salvar vitrine ↗'}</button><p role="status" className="form-message">{message}</p></div><div><span className="mini-label">PRÉVIA DO CARD</span><PartnerCarousel items={items} name="Sua empresa"/></div></div>
 </section>;
}
