import {NextResponse,type NextRequest} from 'next/server';
import {sessionDb,configured,isDemo} from '@/lib/db';
import {authDestination,loginPath} from '@/lib/auth-navigation';
export async function GET(request:NextRequest){
 const next=authDestination(request.nextUrl.searchParams.get('next'));
 const origin=process.env.APP_URL||request.nextUrl.origin;
 let ok=false;
 if(configured()&&!isDemo())try{
  const db=await sessionDb();
  const token=request.nextUrl.searchParams.get('token_hash');
  const code=request.nextUrl.searchParams.get('code');
  if(token){const {error}=await db.auth.verifyOtp({token_hash:token,type:'email'});ok=!error;}
  else if(code){const {error}=await db.auth.exchangeCodeForSession(code);ok=!error;}
 }catch{/* Return to login without exposing provider errors or tokens. */}
 const response=NextResponse.redirect(new URL(ok?next:loginPath(next,'access'),origin));
 response.headers.set('Cache-Control','private, no-store');
 return response;
}
