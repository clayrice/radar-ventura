import test from 'node:test';import assert from 'node:assert/strict';
import {build} from 'esbuild';import {mkdtemp,rm} from 'node:fs/promises';import {tmpdir} from 'node:os';import {join} from 'node:path';import {createRequire} from 'node:module';
import {billingEmail} from '../lib/billing-email-template';

test('recibos financeiros usam identidade oficial, links seguros e diferenciam renovação de acesso',()=>{
 for(const kind of ['activated','renewed','payment_failed','cancelled'] as const){const mail=billingEmail(kind,'https://radar.example','2099-01-10T12:00:00Z');assert.ok(mail.html.includes('/brand/ventura-lime.png'));assert.ok(mail.html.includes('https://radar.example/account/assinatura'));assert.ok(mail.text.includes('10/01/2099'));assert.ok(!mail.html.includes('radar-weekly-header'));assert.ok(!mail.html.includes('List-Unsubscribe'));}
 const cancelled=billingEmail('cancelled','https://radar.example','2099-01-10T12:00:00Z');assert.match(cancelled.text,/Não haverá novas cobranças/);assert.match(cancelled.text,/não solicita estorno/);
 assert.match(billingEmail('activated','https://radar.example',null,false).text,/renovação mensal já está cancelada/);
 assert.throws(()=>billingEmail('activated','javascript:alert(1)',null));
});

test('fila financeira bloqueia envio desligado, retoma payload congelado, não duplica e revisa após 23h',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'billing-mail-')),env={...process.env},oldFetch=globalThis.fetch;const global=globalThis as any;
 try{
  const file=join(dir,'mail.cjs');await build({entryPoints:[new URL('../lib/billing-mail.ts',import.meta.url).pathname],outfile:file,bundle:true,platform:'node',format:'cjs',plugins:[{name:'services',setup(b){b.onResolve({filter:/^(server-only|\.\/db)$/},a=>({path:a.path,namespace:'fake'}));b.onLoad({filter:/.*/,namespace:'fake'},a=>({loader:'js',contents:a.path==='server-only'?'':`export const isDemo=()=>process.env.DEMO_MODE==='true';export const adminDb=()=>globalThis.financialDb;export const checked=r=>{if(r.error)throw Error(r.error.message);return r.data;};`}));}}]});
  const mail=createRequire(import.meta.url)(file);let calls=0,fail=true,locked=false;const payloads:string[]=[],keys:string[]=[];
  const rows:any[]=[{id:'notice',order_id:'order',user_id:'user',kind:'activated',payment_id:'pay',status:'pending',payload:null,started_at:null}];
  const tables:any={email_suppressions:[],billing_mail:rows,payments:[{id:'pay',order_id:'order',status:'paid'}],subscriptions:[{user_id:'user',status:'active',expires_at:'2099-01-10T12:00:00Z'}],orders:[{id:'order',user_id:'user',product:'weekly',renewal_status:'active'}]};
  global.financialDb={auth:{admin:{getUserById:async()=>({data:{user:{email:'tester@example.com'}},error:null})}},rpc:async(name:string)=>({data:name==='acquire_job'?!locked:true}),from(table:string){const filters:((row:any)=>boolean)[]=[];let patch:any,single=false;const q:any={select(){return q},eq(k:string,v:any){filters.push(r=>r[k]===v);return q},in(k:string,v:any[]){filters.push(r=>v.includes(r[k]));return q},order(){return q},limit(){return q},maybeSingle(){single=true;return q},update(v:any){patch=v;return q},then(resolve:any){const selected=tables[table].filter((r:any)=>filters.every(f=>f(r)));if(patch)selected.forEach((r:any)=>Object.assign(r,patch));return Promise.resolve({data:single?selected[0]||null:selected.map((r:any)=>({...r})),error:null}).then(resolve)}};return q;}};
  globalThis.fetch=(async(_input,init)=>{calls++;payloads.push(String(init?.body));keys.push(new Headers(init?.headers).get('Idempotency-Key')!);return Response.json(fail?{}:{id:'provider_1'},{status:fail?500:200});}) as typeof fetch;
  Object.assign(process.env,{UNSUBSCRIBE_SECRET:'s'.repeat(32),DEMO_MODE:'false',EMAIL_SEND_ENABLED:'true',BILLING_EMAIL_SEND_ENABLED:'false',RESEND_API_KEY:'test',EMAIL_FROM:'Ventura <test@example.com>',APP_URL:'https://radar.example'});
  assert.equal((await mail.runBillingMail()).status,'disabled');assert.equal(calls,0);
  process.env.BILLING_EMAIL_SEND_ENABLED='true';locked=true;assert.equal((await mail.runBillingMail()).status,'busy');locked=false;
  assert.equal((await mail.runBillingMail()).failures,1);assert.equal(rows[0].status,'sending');assert.ok(rows[0].payload);assert.equal(calls,1);
  tables.subscriptions[0].expires_at='2099-02-10T12:00:00Z';tables.orders[0].renewal_status='cancelled';fail=false;
  assert.equal((await mail.runBillingMail()).sent,1);assert.equal(payloads[0],payloads[1]);assert.equal(keys[0],keys[1]);assert.equal(rows[0].status,'sent');
  await mail.runBillingMail();assert.equal(calls,2);
  rows.push({...rows[0],id:'exhausted',status:'pending',attempts:3,payload:null,started_at:null});assert.equal((await mail.runBillingMail()).review,1);assert.equal(calls,2);rows.pop();
  rows.push({...rows[0],id:'expired',status:'sending',started_at:new Date(Date.now()-24*3600000).toISOString()});assert.equal((await mail.runBillingMail()).review,1);assert.equal(rows[1].status,'review');assert.equal(calls,2);
  rows.push({...rows[0],id:'revoked',status:'pending',payload:null,started_at:null});tables.payments[0].status='revoked';assert.equal((await mail.runBillingMail()).cancelled,1);assert.equal(calls,2);
  rows.push({...rows[0],id:'failure-resolved',kind:'payment_failed',status:'pending',payload:null,started_at:null});tables.payments[0].status='paid';assert.equal((await mail.runBillingMail()).cancelled,1);assert.equal(calls,2);
  tables.payments[0].status='paid';tables.email_suppressions.push({fingerprint:(await import('../lib/email-feedback-core')).emailFingerprint('tester@example.com')});rows.push({...rows[0],id:'blocked',status:'pending',payload:null,started_at:null,attempts:0});assert.equal((await mail.runBillingMail()).review,1);assert.equal(rows.at(-1).status,'review');assert.equal(calls,2);
 }finally{globalThis.fetch=oldFetch;delete global.financialDb;for(const k of Object.keys(process.env))if(!(k in env))delete process.env[k];Object.assign(process.env,env);await rm(dir,{recursive:true,force:true});}
});
