"use server";
import {redirect} from 'next/navigation';
import {revalidatePath} from 'next/cache';
import {z} from 'zod';
import {configured,isDemo,sessionDb} from '@/lib/db';
import {authCallbackUrl} from '@/lib/auth-navigation';
import {profileSchema} from '@/lib/validation';
export type FormState={message:string;ok?:boolean};
export async function login(_:FormState,form:FormData):Promise<FormState>{if(isDemo()||!configured())return {message:'Esta é uma demonstração. Você pode explorar a edição de exemplo sem entrar na conta.'};const email=z.email().safeParse(form.get('email'));if(!email.success)return {message:'Informe um email válido.'};const db=await sessionDb();const {error}=await db.auth.signInWithOtp({email:email.data,options:{emailRedirectTo:authCallbackUrl(process.env.APP_URL!,form.get('next'))}});return {message:error?'Não foi possível enviar o link. Tente novamente em alguns instantes.':'Confira seu email para acessar a conta pelo link seguro.',ok:!error};}
export async function loginGoogle(_:FormState,form:FormData):Promise<FormState>{
 if(isDemo()||!configured())return {message:'O acesso com Google estará disponível quando a conexão de login for configurada. Por enquanto, explore a conta de exemplo.'};
 if(!process.env.APP_URL)return {message:'O acesso ainda está sendo configurado. Tente novamente mais tarde.'};
 let destination:string|undefined;
 try {
  const db=await sessionDb();
  const {data,error}=await db.auth.signInWithOAuth({provider:'google',options:{redirectTo:authCallbackUrl(process.env.APP_URL,form.get('next')),skipBrowserRedirect:true}});
  if(error||!data.url)return {message:'Não foi possível conectar com o Google. Tente novamente ou use seu email.'};
  destination=data.url;
 }catch{return {message:'Não foi possível conectar com o Google. Tente novamente ou use seu email.'};}
 redirect(destination);
}
export async function saveProfile(_:FormState,form:FormData):Promise<FormState>{
 const parsed=profileSchema.safeParse({
  company:form.get('company'),sector:form.get('sector'),size:form.get('size'),
  objective:form.get('objective'),business_model:form.get('business_model'),ai_level:form.get('ai_level'),
  interests:form.getAll('interests'),email_opt_in:form.get('email_opt_in')==='on'
 });
 if(!parsed.success)return {message:'Preencha as opções e selecione de uma a três áreas de interesse.'};
 if(isDemo())return {ok:true,message:'Preferências validadas. Nesta demonstração, seus dados não são salvos.'};
 const db=await sessionDb();const {data:{user}}=await db.auth.getUser();
 if(!user)return {message:'Entre novamente para continuar.'};
 const {error}=await db.from('profiles').upsert({
  ...parsed.data,goals:parsed.data.objective,user_id:user.id,updated_at:new Date().toISOString()
 });
 if(error)return {message:'Não foi possível salvar o perfil. Tente novamente.'};
 revalidatePath('/account');
 return {message:'Perfil salvo. Suas escolhas serão usadas na próxima edição.',ok:true};
}
export async function signOut(){if(configured()){const db=await sessionDb();await db.auth.signOut();}redirect('/');}
