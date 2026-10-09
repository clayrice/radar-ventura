import test from 'node:test';
import assert from 'node:assert/strict';
import {build} from 'esbuild';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createRequire} from 'node:module';

test('daily delivery: gates, confirmed recipients, frozen retry, duplicates, cancellation and review',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'daily-mail-'));
 const previous={...process.env};const originalFetch=globalThis.fetch;
 try{
 const bundle=join(dir,'mail.cjs');
 await build({entryPoints:[new URL('../lib/daily-mail.ts',import.meta.url).pathname],outfile:bundle,bundle:true,platform:'node',format:'cjs',plugins:[{name:'boundaries',setup(b){
 b.onResolve({filter:/^(server-only|\.\/db|\.\/radar-dates)$/},a=>({path:a.path,namespace:'stub'}));
 b.onLoad({filter:/.*/,namespace:'stub'},a=>({loader:'js',contents:a.path==='server-only'?'':a.path==='./db'?`export const isDemo=()=>process.env.DEMO_MODE==='true';export const adminDb=()=>globalThis.__dailyDb;export const checked=r=>{if(r.error)throw Error(r.error.message);return r.data;};`:`export const radarDate=()=> '2026-10-09';`}));
 }}]});
 const mail=createRequire(import.meta.url)(bundle);
 const articles=Array.from({length:3},(_,i)=>({id:String(i),title:'Story '+i,summary:'Summary',radar_date:'2026-10-09',status:'published'}));
 const tables:Record<string,any[]>={articles,partners:[],daily_deliveries:[],daily_subscribers:[{id:'a',nonce:'na',email:'a@example.com',status:'active'},{id:'pending',nonce:'np',email:'p@example.com',status:'pending'},{id:'cancelled',nonce:'nc',email:'c@example.com',status:'unsubscribed'}]};
 let locked=false,requests=0,fail=false;const payloads:string[]=[];
 const db={rpc:async(name:string)=>({data:name==='acquire_job'?!locked:true,error:null}),from(table:string){let predicates:((r:any)=>boolean)[]=[],mutation:string|null=null,payload:any,single=false,start=0,end=Infinity;
 const q:any={select(){return q},eq(k:string,v:any){predicates.push(r=>r[k]===v);return q},order(){return q},or(){return q},range(a:number,b:number){start=a;end=b;return q},limit(n:number){end=n-1;return q},maybeSingle(){single=true;return q},single(){single=true;return q},insert(p:any){mutation='insert';payload=p;return q},update(p:any){mutation='update';payload=p;return q},then(resolve:any,reject:any){
 let rows=tables[table].filter(r=>predicates.every(f=>f(r))).slice(start,end+1);
 if(mutation==='insert'){const row={...payload,status:'sending',started_at:new Date().toISOString()};tables[table].push(row);rows=[row];}
 if(mutation==='update')rows.forEach(r=>Object.assign(r,payload));
 return Promise.resolve({data:single?(rows[0]||null):structuredClone(rows),error:null}).then(resolve,reject);
 }};return q;}};
 (globalThis as any).__dailyDb=db;
 Object.assign(process.env,{DEMO_MODE:'false',EMAIL_SEND_ENABLED:'false',DAILY_EMAIL_SEND_ENABLED:'true',RESEND_API_KEY:'test',EMAIL_FROM:'test@example.com',APP_URL:'https://radar.example',UNSUBSCRIBE_SECRET:'s'.repeat(32)});
 globalThis.fetch=async(_input,init)=>{requests++;payloads.push(String(init?.body));if(fail)throw Error('timeout');return Response.json({id:'provider-'+requests});};
 assert.equal((await mail.runDailyMail()).status,'disabled');assert.equal(requests,0);
 process.env.EMAIL_SEND_ENABLED='true';process.env.DAILY_EMAIL_SEND_ENABLED='false';assert.equal((await mail.runDailyMail()).status,'disabled');assert.equal(requests,0);
 process.env.DAILY_EMAIL_SEND_ENABLED='true';locked=true;assert.equal((await mail.runDailyMail()).status,'busy');locked=false;
 tables.articles=articles.slice(1);assert.equal((await mail.runDailyMail()).status,'waiting_for_three_articles');assert.equal(requests,0);tables.articles=articles;
 fail=true;assert.equal((await mail.runDailyMail()).failures,1);assert.equal(tables.daily_deliveries.length,1);
 tables.articles[0].title='Changed after first attempt';fail=false;assert.equal((await mail.runDailyMail()).sent,1);assert.equal(payloads[0],payloads[1]);assert.equal(JSON.parse(payloads[1]).to[0],'a@example.com');
 assert.equal((await mail.runDailyMail()).sent,0);assert.equal(requests,2);
 tables.daily_deliveries[0].status='sending';tables.daily_deliveries[0].started_at=new Date(Date.now()-24*3600000).toISOString();assert.equal((await mail.runDailyMail()).review,1);assert.equal(requests,2);
 tables.daily_subscribers[0].status='unsubscribed';assert.equal((await mail.runDailyMail()).sent,0);assert.equal(requests,2);
 }finally{globalThis.fetch=originalFetch;delete (globalThis as any).__dailyDb;for(const key of Object.keys(process.env))if(!(key in previous))delete process.env[key];Object.assign(process.env,previous);await rm(dir,{recursive:true,force:true});}
});
