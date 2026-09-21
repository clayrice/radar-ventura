import 'server-only';
import {createClient} from '@supabase/supabase-js';
import {createServerClient} from '@supabase/ssr';
import {cookies} from 'next/headers';
export const configured = () => Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);
export const isDemo = () => process.env.DEMO_MODE === 'true' || (!configured() && process.env.NODE_ENV !== 'production');
export const isEditorialPreview = () => isDemo() || process.env.EDITORIAL_PREVIEW === 'true';
const boundedFetch:typeof fetch=(input,init)=>fetch(input,{...init,signal:AbortSignal.timeout(10000)});
export function publicDb(){
 if(!configured()) throw new Error('Supabase is not configured');
 return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!,process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,{auth:{persistSession:false},global:{fetch:boundedFetch}});
}
export function adminDb(){
 if(!process.env.SUPABASE_SERVICE_ROLE_KEY) throw new Error('Service role is not configured');
 return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!,process.env.SUPABASE_SERVICE_ROLE_KEY,{auth:{persistSession:false,autoRefreshToken:false},global:{fetch:boundedFetch}});
}
export async function sessionDb(){
 const jar=await cookies();
 return createServerClient(process.env.NEXT_PUBLIC_SUPABASE_URL!,process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,{
  cookies:{getAll:()=>jar.getAll(),setAll(items){
   try{items.forEach(({name,value,options})=>jar.set(name,value,options));}
   catch{/* Server Components cannot write cookies. The proxy refreshes them. */}
  }}
 });
}
export function checked<T>(result:{data:T;error:{message:string}|null}):T {
 if(result.error)throw new Error(result.error.message);return result.data;
}
