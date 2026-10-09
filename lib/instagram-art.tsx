import 'server-only';
import React from 'react';
import {ImageResponse} from 'next/og';
import sharp from 'sharp';
import {readFile} from 'node:fs/promises';
import {join} from 'node:path';
import {label} from './labels';

function validPublicImageUrl(value:string){
 try{const u=new URL(value);const h=u.hostname.toLowerCase();return u.protocol==='https:'&&!u.username&&!u.password&&!u.port&&!['localhost','::1'].includes(h)&&!h.endsWith('.local')&&!/^\d{1,3}(?:\.\d{1,3}){3}$/.test(h)&&!h.includes(':');}catch{return false;}
}
async function coverImage(url:string|null|undefined){
 if(!url||!validPublicImageUrl(url))return null;
 try{
  const parsed=new URL(url);
  const response=await fetch(parsed,{redirect:'error',signal:AbortSignal.timeout(7000)});
  if(!response.ok||!response.headers.get('content-type')?.startsWith('image/')||!response.body)return null;
  const reader=response.body.getReader();const chunks:Uint8Array[]=[];let size=0;
  try{while(true){const {value,done}=await reader.read();if(done)break;size+=value.length;if(size>6000000)throw new Error('Imagem muito grande');chunks.push(value);}}finally{await reader.cancel();}
  // Composite the template's original navy fade into the photo itself. CSS
  // overlays in ImageResponse were not consistently rendered over bright covers.
  const fade=Buffer.from(`<svg width="1080" height="1350" xmlns="http://www.w3.org/2000/svg"><defs><linearGradient id="fade" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stop-color="#15142F" stop-opacity=".24"/><stop offset="30%" stop-color="#15142F" stop-opacity=".05"/><stop offset="48%" stop-color="#15142F" stop-opacity=".12"/><stop offset="61%" stop-color="#15142F" stop-opacity=".72"/><stop offset="82%" stop-color="#15142F" stop-opacity=".98"/><stop offset="100%" stop-color="#15142F" stop-opacity="1"/></linearGradient></defs><rect width="1080" height="1350" fill="url(#fade)"/></svg>`);
  const jpeg=await sharp(Buffer.concat(chunks),{limitInputPixels:30000000}).resize(1080,1350,{fit:'cover'}).composite([{input:fade}]).jpeg({quality:85}).toBuffer();
  return `data:image/jpeg;base64,${jpeg.toString('base64')}`;
 }catch{return null;}
}

export async function instagramArtwork(post:{title:string;source_name:string;radar_date:string;category?:string;cover_url?:string|null;cover_origin?:string|null}){
 if(!post.cover_url||!['feed','article'].includes(post.cover_origin||''))throw new Error('Imagem original da matéria obrigatória');
 const logo=await readFile(join(process.cwd(),'public/ventura-logo.png'));
 const fonts=await Promise.all([600,700].map(async weight=>({name:'Space Grotesk',weight:weight as 600|700,style:'normal' as const,data:await readFile(join(process.cwd(),`public/fonts/space-grotesk-${weight}.ttf`))})));
 const photo=await coverImage(post.cover_url);if(!photo)throw new Error('Não foi possível obter a imagem original da matéria');
 const date=new Intl.DateTimeFormat('pt-BR',{day:'2-digit',month:'short',year:'numeric',timeZone:'UTC'}).format(new Date(`${post.radar_date}T12:00:00Z`)).replace('.','').toUpperCase();
 const titleSize=post.title.length>125?64:post.title.length>90?72:81;
 const response=new ImageResponse(<div style={{display:'flex',position:'relative',width:'100%',height:'100%',background:'#15142F',color:'#F7F6EF',fontFamily:'Space Grotesk'}}>
  <img alt="Imagem original da reportagem" src={photo} width={1080} height={1350} style={{position:'absolute',top:0,left:0,objectFit:'cover'}}/>
  <div style={{display:'flex',position:'absolute',top:62,left:64,right:64,justifyContent:'space-between',alignItems:'center'}}>
   <div style={{display:'flex',background:'#15142F',padding:'17px 22px',borderRadius:4}}><img alt="Ventura AI" src={`data:image/png;base64,${logo.toString('base64')}`} width={251} height={45}/></div>
   <div style={{display:'flex',fontSize:22,letterSpacing:2,textShadow:'0 1px 5px #15142F'}}>RADAR / {date}</div>
  </div>
  <div style={{display:'flex',flexDirection:'column',position:'absolute',left:70,right:70,bottom:164}}>
   <div style={{display:'flex',alignSelf:'flex-start',background:'#DBFF4F',color:'#15142F',padding:'14px 19px',fontSize:19,letterSpacing:2,fontWeight:600,marginBottom:34}}>{label(post.category||'Business').toUpperCase()}</div>
   <div style={{fontSize:titleSize,fontWeight:700,lineHeight:1.04,letterSpacing:-3.3,textShadow:'0 2px 6px #15142F'}}>{post.title}</div>
  </div>
  <div style={{display:'flex',position:'absolute',right:32,top:585,fontSize:15,writingMode:'vertical-rl',textShadow:'0 1px 4px black'}}>Fonte: {post.source_name}</div>
  <div style={{display:'flex',position:'absolute',left:70,right:70,bottom:60,borderTop:'1px solid #ffffff45',paddingTop:26,justifyContent:'space-between',alignItems:'center',fontSize:22}}><div style={{fontWeight:700}}>@ventura_ai</div><div style={{color:'#DBFF4F'}}>Leia no Radar · link na bio ↗</div></div>
 </div>,{width:1080,height:1350,fonts});
 return sharp(Buffer.from(await response.arrayBuffer())).jpeg({quality:90}).toBuffer();
}
