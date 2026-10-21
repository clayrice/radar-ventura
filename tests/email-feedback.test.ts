import test from 'node:test';import assert from 'node:assert/strict';
import {createHmac} from 'node:crypto';
import {emailFeedback,emailFingerprint} from '../lib/email-feedback-core';
import {build} from 'esbuild';import {mkdtemp,rm} from 'node:fs/promises';import {tmpdir} from 'node:os';import {join} from 'node:path';import {createRequire} from 'node:module';

test('feedback limita remetente, destinatário e tipo, sem armazenar e-mail em texto',()=>{
 const old=process.env.UNSUBSCRIBE_SECRET;process.env.UNSUBSCRIBE_SECRET='s'.repeat(32);
 try{
 const event={type:'email.bounced',data:{from:'Ventura <radar@example.com>',to:['owner@example.com'],email_id:'provider',bounce:{type:'Permanent'}}};
 const feedback=emailFeedback(event,'radar@example.com')!;assert.equal(feedback.reason,'hard_bounce');assert.match(feedback.fingerprint,/^[a-f0-9]{64}$/);assert.ok(!JSON.stringify(feedback).includes('owner@example.com'));
 assert.equal(emailFingerprint(' Owner@Example.com '),feedback.fingerprint);
 assert.equal(emailFeedback({...event,type:'email.complained'},'radar@example.com')!.reason,'complaint');
 assert.equal(emailFeedback(event,'other@example.com'),null);
 assert.equal(emailFeedback({...event,type:'email.delivered'},'radar@example.com'),null);
 assert.equal(emailFeedback({...event,data:{...event.data,bounce:{type:'Transient'}}},'radar@example.com'),null);
 assert.throws(()=>emailFeedback({...event,data:{...event.data,to:['owner@example.com','other@example.com']}},'radar@example.com'));
 assert.throws(()=>emailFingerprint('invalid'));assert.throws(()=>emailFingerprint('valid@example.com','short'));
 }finally{if(old===undefined)delete process.env.UNSUBSCRIBE_SECRET;else process.env.UNSUBSCRIBE_SECRET=old;}
});

test('webhook exige assinatura original recente e falha de banco pede nova tentativa',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'email-webhook-')),env={...process.env};const g=globalThis as any;
 try{
 const file=join(dir,'route.cjs');await build({entryPoints:[new URL('../app/api/email/webhook/route.ts',import.meta.url).pathname],outfile:file,bundle:true,platform:'node',format:'cjs',plugins:[{name:'db',setup(b){b.onResolve({filter:/^@\/lib\/db$/},a=>({path:a.path,namespace:'fake'}));b.onLoad({filter:/.*/,namespace:'fake'},()=>({loader:'js',contents:`export const isDemo=()=>process.env.DEMO_MODE==='true';export const checked=r=>{if(r.error)throw Error('DB failure');return r.data};export const adminDb=()=>({rpc:async(name,args)=>{globalThis.feedbackTest.calls.push({name,args});return {data:null,error:globalThis.feedbackTest.fail?{}:null}}});`}));}}]});
 const {POST}=createRequire(import.meta.url)(file);const key=Buffer.alloc(32,7);Object.assign(process.env,{DEMO_MODE:'false',RESEND_WEBHOOK_SECRET:'whsec_'+key.toString('base64'),UNSUBSCRIBE_SECRET:'s'.repeat(32),EMAIL_FROM:'Radar <radar@example.com>'});
 g.feedbackTest={calls:[],fail:false};const payload=JSON.stringify({type:'email.complained',data:{from:'radar@example.com',to:['tester@example.com'],email_id:'provider'}});
 function request(body=payload,time=Math.floor(Date.now()/1000),signed=body){const id='msg_test',signature=createHmac('sha256',key).update(`${id}.${time}.${signed}`).digest('base64');return new Request('https://radar.example/api/email/webhook',{method:'POST',body,headers:{'svix-id':id,'svix-timestamp':String(time),'svix-signature':'v1,'+signature}});}
 assert.equal((await POST(new Request('https://radar.example',{method:'POST',body:payload}))).status,401);assert.equal(g.feedbackTest.calls.length,0);
 assert.equal((await POST(request(payload,Math.floor(Date.now()/1000)-600))).status,401);
 assert.equal((await POST(request(payload+' ',Math.floor(Date.now()/1000),payload))).status,401);
 assert.equal((await POST(request())).status,200);assert.equal(g.feedbackTest.calls[0].name,'record_email_suppression');assert.ok(!JSON.stringify(g.feedbackTest.calls).includes('tester@example.com'));
 g.feedbackTest.fail=true;assert.equal((await POST(request())).status,503);
 const before=g.feedbackTest.calls.length;assert.equal((await POST(request(payload.replace('radar@example.com','other@example.com')))).status,200);assert.equal(g.feedbackTest.calls.length,before);
 delete process.env.RESEND_WEBHOOK_SECRET;assert.equal((await POST(request())).status,503);
 }finally{delete g.feedbackTest;for(const k of Object.keys(process.env))if(!(k in env))delete process.env[k];Object.assign(process.env,env);await rm(dir,{recursive:true,force:true});}
});
