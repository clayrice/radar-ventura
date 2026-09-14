"use server";
import {revalidatePath} from 'next/cache';
import {adminDb,isDemo,sessionDb} from '@/lib/db';
import {MEDIA_BUCKET,mediaInput,mediaFileError,mediaTypes,ownsMediaPath} from '@/lib/partner-media';
export async function savePartnerMedia(input:unknown){
 const parsed=mediaInput.safeParse(input);
 if(!parsed.success)return {ok:false,message:'Use até seis itens, com descrição e no máximo um vídeo na primeira posição.'};
 if(isDemo())return {ok:true,message:'Prévia atualizada apenas neste navegador. Nenhum arquivo foi enviado.'};
 const db=await sessionDb();const {data:{user}}=await db.auth.getUser();
 if(!user)return {ok:false,message:'Entre novamente para salvar sua vitrine.'};
 if(parsed.data.some(i=>!ownsMediaPath(i.path,user.id)))return {ok:false,message:'Um dos arquivos não pertence à sua conta.'};
 const admin=adminDb();
 const {data:profile,error:profileError}=await admin.from('partner_applications').select('user_id').eq('user_id',user.id).maybeSingle();
 if(profileError||!profile)return {ok:false,message:'Salve primeiro seu cadastro de parceiro.'};
 const {data:files,error}=await admin.storage.from(MEDIA_BUCKET).list(user.id,{limit:10});
 if(error)return {ok:false,message:'Não foi possível verificar os arquivos. Tente novamente.'};
 for(const item of parsed.data){
  const file=files.find(f=>`${user.id}/${f.name}`===item.path);
  const type=file?.metadata?.mimetype;const size=Number(file?.metadata?.size);
  if(!file||!type||!Number.isFinite(size)||mediaFileError(type,size)||mediaTypes[type]!==item.kind)return {ok:false,message:'Arquivo ausente ou inválido. Envie o material novamente.'};
 }
 const {error:saveError}=await admin.from('partner_showcases').upsert({user_id:user.id,items:parsed.data,updated_at:new Date().toISOString()});
 if(saveError)return {ok:false,message:'Não foi possível salvar a vitrine. Tente novamente.'};
 // The stored manifest is the publication boundary. Remove unused slots only after saving it.
 const unused=files.filter(f=>/^[0-5]$/.test(f.name)&&!parsed.data.some(i=>i.path===`${user.id}/${f.name}`)).map(f=>`${user.id}/${f.name}`);
 if(unused.length)await admin.storage.from(MEDIA_BUCKET).remove(unused);
 revalidatePath('/partners');revalidatePath('/account/parceiro');
 return {ok:true,message:'Vitrine salva. Ela aparece no catálogo quando sua assinatura de parceiro estiver ativa.'};
}
