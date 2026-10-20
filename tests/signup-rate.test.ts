import test from 'node:test';import assert from 'node:assert/strict';
import {signupRateKey} from '../lib/signup-rate-key';
test('limite usa apenas origem da hospedagem configurada, sem armazenar endereço em texto',()=>{
 const headers=new Headers({'x-nf-client-connection-ip':'192.0.2.10','x-forwarded-for':'203.0.113.1'}),secret='s'.repeat(32),day=new Date('2026-10-20T12:00:00Z');
 const key=signupRateKey(headers,secret,'netlify',day)!;assert.match(key,/^[0-9a-f]{64}$/);assert.ok(!key.includes('192.0.2.10'));
 assert.equal(signupRateKey(new Headers({'x-forwarded-for':'192.0.2.10'}),secret,'netlify',day),null);
 assert.equal(signupRateKey(headers,secret,'',day),null);assert.equal(signupRateKey(headers,'short','netlify',day),null);
 for(const ip of ['192.0.2.10, 203.0.113.2','192.0.2.10:8080','garbage'])assert.equal(signupRateKey(new Headers({'x-nf-client-connection-ip':ip}),secret,'netlify',day),null);
 assert.notEqual(signupRateKey(headers,secret,'netlify',new Date('2026-10-21T00:00:00Z')),key);
 assert.notEqual(signupRateKey(headers,'t'.repeat(32),'netlify',day),key);
 assert.equal(signupRateKey(new Headers({'x-nf-client-connection-ip':'2001:db8::1'}),secret,'netlify',day),signupRateKey(new Headers({'x-nf-client-connection-ip':'2001:0db8:0:0:0:0:0:1'}),secret,'netlify',day));
});

test('cadastro bloqueado não cria assinante nem envia confirmação e falha fechada sem origem válida',async()=>{
 const {build}=await import('esbuild'),{mkdtemp,rm}=await import('node:fs/promises'),{tmpdir}=await import('node:os'),{join}=await import('node:path'),{createRequire}=await import('node:module');
 const dir=await mkdtemp(join(tmpdir(),'signup-action-')),env={...process.env},global=globalThis as any;
 try{
 Object.assign(process.env,{UNSUBSCRIBE_SECRET:'s'.repeat(32),SIGNUP_TRUSTED_PROXY:'netlify',APP_URL:'https://radar.example'});
 global.signupTest={enabled:true,allowed:false,rpcs:[],sent:0,ip:'192.0.2.10'};
 const file=join(dir,'signup.cjs');await build({entryPoints:[new URL('../app/daily-signup-action.ts',import.meta.url).pathname],outfile:file,bundle:true,platform:'node',format:'cjs',plugins:[{name:'services',setup(b){b.onResolve({filter:/^(next\/headers|@\/lib\/(db|daily-mail))$/},a=>({path:a.path,namespace:'fake'}));b.onLoad({filter:/.*/,namespace:'fake'},a=>({loader:'js',contents:a.path==='next/headers'?`export const headers=async()=>new Headers({'x-nf-client-connection-ip':globalThis.signupTest.ip});`:a.path.endsWith('/db')?`export const checked=r=>{if(r.error)throw Error('Database unavailable');return r.data};export const adminDb=()=>({rpc:async(name,args)=>{const s=globalThis.signupTest;s.rpcs.push(name);return {data:name==='reserve_daily_signup'?s.allowed:[{id:'subscriber',nonce:'nonce'}],error:s.dbError?{}:null}}});`:`export const confirmationEnabled=()=>globalThis.signupTest.enabled;export const dailyConfig=()=>{};export const dailyLink=action=>'https://radar.example/'+action;export const sendConfirmationPayload=async()=>{globalThis.signupTest.sent++;};`}));}}]});
 const {dailySignup}=createRequire(import.meta.url)(file),s=global.signupTest;const form=()=>{const f=new FormData();f.set('email','TEST@example.com');f.set('consent','on');return f;};
 assert.match((await dailySignup({message:''},form())).message,/dez minutos/);assert.deepEqual(s.rpcs,['reserve_daily_signup']);assert.equal(s.sent,0);
 s.rpcs=[];s.ip='invalid';await dailySignup({message:''},form());assert.equal(s.rpcs.length,0);assert.equal(s.sent,0);
 s.ip='192.0.2.10';s.allowed=true;await dailySignup({message:''},form());assert.deepEqual(s.rpcs,['reserve_daily_signup','request_daily_signup']);assert.equal(s.sent,1);
 s.rpcs=[];s.dbError=true;await dailySignup({message:''},form());assert.deepEqual(s.rpcs,['reserve_daily_signup']);assert.equal(s.sent,1);
 s.rpcs=[];s.dbError=false;s.enabled=false;await dailySignup({message:''},form());assert.equal(s.rpcs.length,0);s.enabled=true;const bot=form();bot.set('website','spam');await dailySignup({message:''},bot);assert.equal(s.rpcs.length,0);assert.equal(s.sent,1);
 }finally{delete global.signupTest;for(const k of Object.keys(process.env))if(!(k in env))delete process.env[k];Object.assign(process.env,env);await rm(dir,{recursive:true,force:true});}
});
