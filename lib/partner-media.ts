import {z} from 'zod';
export const MEDIA_BUCKET='partner-media';
export const mediaTypes:Record<string,'image'|'video'>={'image/jpeg':'image','image/png':'image','image/webp':'image','video/mp4':'video','video/webm':'video'};
export type PartnerMedia={path:string;kind:'image'|'video';caption:string;url:string};
export const mediaInput=z.array(z.object({path:z.string(),kind:z.enum(['image','video']),caption:z.string().trim().min(1).max(160)})).max(6).refine(items=>new Set(items.map(i=>i.path)).size===items.length).refine(items=>items.filter(i=>i.kind==='video').length<=1&&items.every((i,n)=>i.kind!=='video'||n===0));
export function mediaFileError(type:string,size:number):string|null{
 const kind=mediaTypes[type];if(!kind)return 'Use imagens JPG, PNG ou WebP e vídeos MP4 ou WebM.';
 if(size<=0||size>(kind==='video'?40:5)*1024*1024)return kind==='video'?'O vídeo deve ter até 40 MB.':'Cada imagem deve ter até 5 MB.';
 return null;
}
export function ownsMediaPath(path:string,userId:string){return new RegExp(`^${userId}/[0-5]$`).test(path);}
