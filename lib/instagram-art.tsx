import 'server-only';
import React from 'react';
import {ImageResponse} from 'next/og';
import sharp from 'sharp';
import {readFile} from 'node:fs/promises';
import {join} from 'node:path';

const imageHosts=new Set(['wp.technologyreview.com','techcrunch.com','substackcdn.com','cdn.arstechnica.net','images.axios.com','platform.theverge.com','s.yimg.com','venturebeat.com']);
async function coverImage(url:string|null|undefined){
 if(!url)return null;
 try{
  const parsed=new URL(url);
  if(parsed.protocol!=='https:'||parsed.username||parsed.password||parsed.port||!imageHosts.has(parsed.hostname))return null;
  const response=await fetch(parsed,{redirect:'error',signal:AbortSignal.timeout(7000)});
  if(!response.ok||!response.headers.get('content-type')?.startsWith('image/')||!response.body)return null;
  const reader=response.body.getReader();const chunks:Uint8Array[]=[];let size=0;
  try{while(true){const {value,done}=await reader.read();if(done)break;size+=value.length;if(size>6000000)throw new Error('Imagem muito grande');chunks.push(value);}}finally{await reader.cancel();}
  const jpeg=await sharp(Buffer.concat(chunks),{limitInputPixels:30000000}).resize(1080,1350,{fit:'cover'}).jpeg({quality:85}).toBuffer();
  return `data:image/jpeg;base64,${jpeg.toString('base64')}`;
 }catch{return null;}
}

export async function instagramArtwork(post:{title:string;source_name:string;radar_date:string;cover_url?:string|null}){
 const logo=await readFile(join(process.cwd(),'public/ventura-logo.png'));
 const fonts=await Promise.all([600,700].map(async weight=>({name:'Space Grotesk',weight:weight as 600|700,style:'normal' as const,data:await readFile(join(process.cwd(),`public/fonts/space-grotesk-${weight}.ttf`))})));
 const photo=process.env.INSTAGRAM_USE_SOURCE_IMAGES==='true'?await coverImage(post.cover_url):null;
 const date=new Intl.DateTimeFormat('pt-BR',{day:'2-digit',month:'short',year:'numeric',timeZone:'UTC'}).format(new Date(`${post.radar_date}T12:00:00Z`));
 const response=new ImageResponse(<div style={{display:'flex',position:'relative',width:'100%',height:'100%',background:photo?'#15142F':'#F7F6EF',color:photo?'#F7F6EF':'#15142F',fontFamily:'Space Grotesk'}}>
  {photo?<><img alt="Imagem da reportagem" src={photo} width={1080} height={1350} style={{position:'absolute',top:0,left:0}}/><div style={{display:'flex',position:'absolute',inset:0,background:'linear-gradient(180deg,rgba(21,20,47,.2) 0%,rgba(21,20,47,.05) 30%,rgba(21,20,47,.78) 58%,#15142F 89%)'}}/></>:<div style={{display:'flex',position:'absolute',right:-435,top:-390,width:950,height:950,border:'100px solid #DBFF4F',borderRadius:'50%'}} />}
  <div style={{display:'flex',position:'absolute',top:62,left:64,right:64,justifyContent:'space-between',alignItems:'center'}}>
   <div style={{display:'flex',background:'#000000',padding:'17px 22px',borderRadius:4}}><img alt="Ventura AI" src={`data:image/png;base64,${logo.toString('base64')}`} width={251} height={45}/></div>
   <div style={{display:'flex',fontSize:22}}>RADAR / {date.toUpperCase()}</div>
  </div>
  <div style={{display:'flex',flexDirection:'column',position:'absolute',left:70,right:70,bottom:235}}>
   <div style={{display:'flex',alignSelf:'flex-start',background:photo?'#DBFF4F':'#524FF5',color:photo?'#15142F':'white',padding:'14px 19px',fontSize:20,marginBottom:34}}>IA & NEGÓCIOS</div>
   <div style={{fontSize:post.title.length>150?64:post.title.length>100?74:88,fontWeight:700,lineHeight:1.08,letterSpacing:-3}}>{post.title}</div>
  </div>
  <div style={{display:'flex',position:'absolute',left:70,bottom:170,fontSize:25,color:photo?'#DBFF4F':'#524FF5'}}>IA com rumo.</div>
  <div style={{display:'flex',position:'absolute',left:70,bottom:118,fontSize:19,color:photo?'#F7F6EF':'#656474'}}>Fonte: {post.source_name}</div>
  <div style={{display:'flex',position:'absolute',left:70,right:70,bottom:60,borderTop:photo?'1px solid #ffffff45':'1px solid #15142F40',paddingTop:26,justifyContent:'space-between',fontSize:22}}><div>@ventura_ai</div><div style={{color:photo?'#DBFF4F':'#524FF5'}}>Leia no Radar · link na bio ↗</div></div>
 </div>,{width:1080,height:1350,fonts});
 return sharp(Buffer.from(await response.arrayBuffer())).jpeg({quality:90}).toBuffer();
}
