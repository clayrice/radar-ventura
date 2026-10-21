import test from 'node:test';import assert from 'node:assert/strict';
import {build} from 'esbuild';import {mkdtemp,rm} from 'node:fs/promises';import {tmpdir} from 'node:os';import {join} from 'node:path';import {createRequire} from 'node:module';
import {emailFingerprint} from '../lib/email-feedback-core';
test('semanal bloqueia destinatário após reclamação, mantém edição disponível e falha fechado antes do provedor',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'weekly-delivery-')),env={...process.env},oldFetch=globalThis.fetch;const g=globalThis as any;
 try{
 Object.assign(process.env,{EMAIL_SEND_ENABLED:'true',RESEND_API_KEY:'test',EMAIL_FROM:'radar@example.com',APP_URL:'https://radar.example',UNSUBSCRIBE_SECRET:'s'.repeat(32)});
 const file=join(dir,'weekly.cjs');await build({entryPoints:[new URL('../lib/weekly-delivery.ts',import.meta.url).pathname],outfile:file,bundle:true,platform:'node',format:'cjs',plugins:[{name:'db',setup(b){b.onResolve({filter:/^(server-only|\.\/db)$/},a=>({path:a.path,namespace:'fake'}));b.onLoad({filter:/.*/,namespace:'fake'},a=>({loader:'js',contents:a.path==='server-only'?'':`export const adminDb=()=>globalThis.weeklyDeliveryDb;export const checked=r=>{if(r.error)throw Error('DB failure');return r.data;};`}));}}]});
 const {deliverWeekly}=createRequire(import.meta.url)(file);let blocked=false,dbError=false,calls=0;const frozen={from:'radar@example.com',to:['tester@example.com'],subject:'Already frozen',html:'<p>Original</p>',text:'Original'};const edition={id:'edition',user_id:'user',status:'sending',send_started_at:new Date().toISOString(),delivery_payload:frozen};
 const tables:any={editions:[edition],profiles:[{user_id:'user',email_opt_in:true}],subscriptions:[{user_id:'user',status:'active'}]};
 const db={from(table:string){let single=false,patch:any;const filters:((r:any)=>boolean)[]=[];const q:any={select(){return q},eq(k:string,v:any){filters.push(r=>r[k]===v);return q},in(k:string,v:any[]){filters.push(r=>v.includes(r[k]));return q},order(){return q},limit(){return q},maybeSingle(){single=true;return q},update(p:any){patch=p;return q},then(resolve:any){const selected=table==='email_suppressions'?(blocked?[{fingerprint:emailFingerprint('tester@example.com')}]:[]):tables[table].filter((r:any)=>filters.every(f=>f(r)));if(patch)selected.forEach((r:any)=>Object.assign(r,patch));return Promise.resolve({data:single?selected[0]||null:selected.map((r:any)=>({...r})),error:dbError&&table==='email_suppressions'?{}:null}).then(resolve)}};return q;}};g.weeklyDeliveryDb=db;
 globalThis.fetch=async(_input,init)=>{calls++;assert.deepEqual(JSON.parse(String(init?.body)),frozen);return Response.json({id:'provider'});};
 dbError=true;assert.equal((await deliverWeekly(db,Date.now()+10000)).sent,0);assert.equal(calls,0);assert.equal(edition.status,'sending');
 dbError=false;blocked=true;assert.equal((await deliverWeekly(db,Date.now()+10000)).sent,0);assert.equal(edition.status,'available');assert.equal(calls,0);
 blocked=false;edition.status='sending';assert.equal((await deliverWeekly(db,Date.now()+10000)).sent,1);assert.equal(calls,1);assert.equal(edition.status,'sent');
 }finally{globalThis.fetch=oldFetch;delete g.weeklyDeliveryDb;for(const k of Object.keys(process.env))if(!(k in env))delete process.env[k];Object.assign(process.env,env);await rm(dir,{recursive:true,force:true});}
});
