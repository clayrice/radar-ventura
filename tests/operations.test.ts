import test from 'node:test';import assert from 'node:assert/strict';
import {operationsAllowed} from '../lib/operations-access';
import {build} from 'esbuild';import {mkdtemp,rm} from 'node:fs/promises';import {tmpdir} from 'node:os';import {join} from 'node:path';import {createRequire} from 'node:module';
test('painel exige endereço confirmado na lista e não aceita privilégios de metadados',()=>{
 const verified={email:'Owner@Example.com',email_confirmed_at:'2026-10-20'};
 assert.equal(operationsAllowed(verified,''),false);assert.equal(operationsAllowed(verified,' owner@example.com '),true);
 assert.equal(operationsAllowed({...verified,email_confirmed_at:null},'owner@example.com'),false);
 assert.equal(operationsAllowed({...verified,email:'other@example.com',user_metadata:{role:'admin'}} as any,'owner@example.com'),false);
 assert.equal(operationsAllowed(null,'owner@example.com'),false);
});
test('acesso negado não cria conexão privilegiada; alertas usam registros e não executam ações',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'operations-'));const state=globalThis as any;const before=process.env.OPS_ADMIN_EMAILS;
 try{
 process.env.OPS_ADMIN_EMAILS='owner@example.com';state.operationsTest={user:null,adminCalls:0,demo:false};
 const file=join(dir,'ops.cjs');await build({entryPoints:[new URL('../lib/operations.ts',import.meta.url).pathname],outfile:file,bundle:true,platform:'node',format:'cjs',plugins:[{name:'services',setup(b){b.onResolve({filter:/^(server-only|\.\/db|next\/navigation)$/},a=>({path:a.path,namespace:'fake'}));b.onLoad({filter:/.*/,namespace:'fake'},a=>({loader:'js',contents:a.path==='server-only'?'':a.path==='next/navigation'?`export const notFound=()=>{throw Error('NOT_FOUND')}`:`export const isDemo=()=>globalThis.operationsTest.demo;export const sessionDb=async()=>({auth:{getUser:async()=>({data:{user:globalThis.operationsTest.user}})}});export const checked=r=>r.data;export function adminDb(){globalThis.operationsTest.adminCalls++;return {rpc:async(name)=>{if(name!=='operations_snapshot')throw Error('Unexpected procedure');return {data:{marker:'snapshot'}}}}}`}));}}]});
 const {loadOperations,operationAlerts}=createRequire(import.meta.url)(file);const s=state.operationsTest;
 await assert.rejects(loadOperations(),/NOT_FOUND/);s.user={email:'other@example.com',email_confirmed_at:'yes'};await assert.rejects(loadOperations(),/NOT_FOUND/);assert.equal(s.adminCalls,0);
 s.user={email:'owner@example.com',email_confirmed_at:'yes'};assert.equal((await loadOperations()).marker,'snapshot');assert.equal(s.adminCalls,1);
 s.demo=true;await assert.rejects(loadOperations(),/NOT_FOUND/);assert.equal(s.adminCalls,1);
 const empty={weekly_review:0,daily_review:0,financial_review:0,billing_review:0,billing_events_pending:0,personalization_calls:0,news_calls:0,partners_active:1,runs:[]};assert.deepEqual(operationAlerts(empty),[]);
 const alerts=operationAlerts({...empty,weekly_review:1,billing_events_pending:2,personalization_calls:10,news_calls:40,partners_active:0,runs:[{status:'running',started_at:new Date(Date.now()-20*60000).toISOString()}]});assert.equal(alerts.length,6);assert.equal(s.adminCalls,1);
 }finally{delete state.operationsTest;if(before===undefined)delete process.env.OPS_ADMIN_EMAILS;else process.env.OPS_ADMIN_EMAILS=before;await rm(dir,{recursive:true,force:true});}
});
