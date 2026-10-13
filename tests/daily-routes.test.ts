import test from 'node:test';
import assert from 'node:assert/strict';
import {build} from 'esbuild';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createRequire} from 'node:module';
import {dailyToken} from '../lib/daily-email-core';
import {confirmationEmail,radarPage} from '../lib/radar-design';

test('branded emails preserve secure links, readable fallback text and official logo',async()=>{
 const email=confirmationEmail('https://radar.example/confirm','https://radar.example/cancel','https://radar.example');
 assert.ok(email.html.includes('https://radar.example/brand/ventura-lime.png'));
 assert.ok(email.html.includes('role="presentation"'));assert.ok(email.text.includes('24 horas'));assert.ok(email.text.includes('/cancel'));
 assert.throws(()=>confirmationEmail('javascript:alert(1)','https://radar.example/cancel','https://radar.example'));
 const response=radarPage('<script>bad</script>','<p>Mensagem</p>');
 assert.equal(response.headers.get('Referrer-Policy'),'no-referrer');
 assert.ok(!(await response.text()).includes('<script>'));
});

test('daily routes require explicit confirmation, support one-click cancellation and isolate the manual test',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'daily-routes-')),previous=process.env.UNSUBSCRIBE_SECRET;
 try{
 const bundle=join(dir,'route.cjs');
 await build({entryPoints:[new URL('../app/radar-diario/[action]/route.ts',import.meta.url).pathname],outfile:bundle,bundle:true,platform:'node',format:'cjs',plugins:[{name:'boundaries',setup(b){
 b.onResolve({filter:/^@\/lib\/(db|daily-mail)$/},a=>({path:a.path,namespace:'stub'}));
 b.onLoad({filter:/.*/,namespace:'stub'},a=>({loader:'js',contents:a.path.endsWith('/db')?`export const isDemo=()=>false;export const adminDb=()=>globalThis.__routeDb;export const checked=r=>{if(r.error)throw Error(r.error.message);return r.data;};`:`export const sendCancellationReceipt=async()=>{globalThis.__receiptCalls++;};export const dailyEnabled=()=>false;export const confirmationTestAllowed=email=>email==='test@example.com';export const sendDailyTest=async()=>{globalThis.__manualCalls++;return {status:'sent'};};`}));
 }}]});
 const route=createRequire(import.meta.url)(bundle),id='11111111-1111-4111-8111-111111111111',nonce='route-nonce',secret='s'.repeat(32);
 process.env.UNSUBSCRIBE_SECRET=secret;
 const row={id,nonce,email:'test@example.com',status:'pending',requested_at:new Date().toISOString(),confirmed_at:null as string|null};
 (globalThis as any).__manualCalls=0;(globalThis as any).__receiptCalls=0;
 (globalThis as any).__routeDb={from(){let updates:any;const filters:Record<string,string>={};const q:any={select(){return q},eq(k:string,v:string){filters[k]=v;return q},maybeSingle(){return q},update(value:any){updates=value;return q},then(resolve:any,reject:any){const matches=Object.entries(filters).every(([k,v])=>(row as any)[k]===v);if(matches&&updates)Object.assign(row,updates);return Promise.resolve({data:matches?{...row}:null,error:null}).then(resolve,reject);}};return q;}};
 const call=(action:string,method='GET',token=dailyToken(action==='unsubscribe'?'unsubscribe':'confirm',id,nonce,secret))=>route[method](new Request(`https://radar.example/radar-diario/${action}?id=${id}&token=${token}`,{method,body:method==='POST'?'List-Unsubscribe=One-Click':undefined}),{params:Promise.resolve({action})});
 assert.equal((await call('confirm')).status,200);assert.equal(row.status,'pending');
 assert.equal((await call('test')).status,403);assert.equal((globalThis as any).__manualCalls,0);
 assert.equal((await call('confirm','POST')).status,200);assert.equal(row.status,'active');assert.ok(row.confirmed_at);
 assert.equal((await call('test')).status,200);assert.equal((globalThis as any).__manualCalls,0);
 assert.equal((await call('test','POST')).status,200);assert.equal((globalThis as any).__manualCalls,1);
 row.email='other@example.com';assert.equal((await call('test','POST')).status,403);row.email='test@example.com';
 assert.equal((await call('unsubscribe')).status,200);assert.equal(row.status,'active');
 assert.equal((await call('unsubscribe','POST','0'.repeat(64))).status,400);assert.equal(row.status,'active');
 assert.equal((await call('unsubscribe','POST')).status,200);assert.equal(row.status,'unsubscribed');assert.equal((globalThis as any).__receiptCalls,1);
 assert.equal((await call('unsubscribe','POST')).status,200);assert.equal((globalThis as any).__receiptCalls,1);
 assert.equal((await call('confirm','POST')).status,400);assert.equal((await call('test','POST')).status,400);
 row.status='pending';row.requested_at=new Date(Date.now()-25*3600000).toISOString();assert.equal((await call('confirm','POST')).status,400);
 row.requested_at=new Date().toISOString();row.nonce='rotated';assert.equal((await call('confirm','POST')).status,400);
 }finally{if(previous===undefined)delete process.env.UNSUBSCRIBE_SECRET;else process.env.UNSUBSCRIBE_SECRET=previous;delete (globalThis as any).__routeDb;delete (globalThis as any).__manualCalls;delete (globalThis as any).__receiptCalls;await rm(dir,{recursive:true,force:true});}
});
