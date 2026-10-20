import test from 'node:test';import assert from 'node:assert/strict';
import {build} from 'esbuild';import {mkdtemp,rm} from 'node:fs/promises';import {tmpdir} from 'node:os';import {join} from 'node:path';import {createRequire} from 'node:module';
test('conciliação de recorrência usa fallback limitado ao cliente e recusa cobrança de outro checkout',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'billing-reconcile-')),priorFetch=globalThis.fetch;
 try{
 const bundle=join(dir,'billing.cjs');await build({entryPoints:[new URL('../lib/billing.ts',import.meta.url).pathname],outfile:bundle,bundle:true,platform:'node',format:'cjs',plugins:[{name:'boundaries',setup(b){b.onResolve({filter:/^server-only$/},()=>({path:'server-only',namespace:'fake'}));b.onResolve({filter:/^\.\/db$/},()=>({path:'db',namespace:'fake'}));b.onLoad({filter:/.*/,namespace:'fake'},args=>({contents:args.path==='server-only'?'':'export function adminDb(){throw Error("database must not be touched for another checkout")};export const checked=x=>x.data;',loader:'js'}));}}]});
 const mod=createRequire(import.meta.url)(bundle),calls:string[]=[];
 globalThis.fetch=(async input=>{const url=String(input);calls.push(url);const data=url.includes('/payments/pay_wrong')?{id:'pay_wrong',checkoutSession:'other'}:url.includes('checkoutSession=')?{data:[]}: {data:[{id:'pay_correct',checkoutSession:'checkout_1'},{id:'pay_other',checkoutSession:'other'},{id:'pay_missing'}]};return Response.json(data);}) as typeof fetch;
 assert.deepEqual(await mod.checkoutPaymentIds('checkout_1','customer_1'),['pay_correct']);assert.equal(calls.length,2);assert.ok(calls[1].includes('customer=customer_1'));
 calls.length=0;assert.deepEqual(await mod.checkoutPaymentIds('checkout_1'),[]);assert.equal(calls.length,1);
 await assert.rejects(mod.reconcilePayment('pay_wrong','checkout_1'),/não pertence/);
 }finally{globalThis.fetch=priorFetch;await rm(dir,{recursive:true,force:true});}
});

test('falha financeira é enfileirada pela cobrança verificada e ignorada após pagamento confirmado',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'billing-failure-'));const oldFetch=globalThis.fetch;const state=globalThis as any;
 try{
  state.failureRpcs=[];
  const file=join(dir,'billing.cjs');await build({entryPoints:[new URL('../lib/billing.ts',import.meta.url).pathname],outfile:file,bundle:true,platform:'node',format:'cjs',plugins:[{name:'services',setup(b){b.onResolve({filter:/^(server-only|\.\/db)$/},a=>({path:a.path,namespace:'test'}));b.onLoad({filter:/.*/,namespace:'test'},a=>({loader:'js',contents:a.path==='server-only'?'':`export const checked=r=>r.data;export function adminDb(){return {from(){return {select(){return this},eq(){return this},async maybeSingle(){return {data:{id:'order',value_cents:990}}}}},async rpc(name,args){globalThis.failureRpcs.push({name,args});return {data:null}}}}`}));}}]});
  const {reconcilePayment}=createRequire(import.meta.url)(file);let status='OVERDUE';
  globalThis.fetch=(async()=>Response.json({id:'pay_pending',checkoutSession:'checkout',status,value:9.90,dueDate:'2026-10-20'})) as typeof fetch;
  assert.equal(await reconcilePayment('pay_pending'),true);assert.equal(state.failureRpcs.at(-1).name,'queue_billing_failure');
  status='PENDING';state.failureRpcs=[];await reconcilePayment('pay_pending',undefined,'PAYMENT_CREDIT_CARD_CAPTURE_REFUSED');assert.equal(state.failureRpcs.at(-1).name,'queue_billing_failure');
  status='CONFIRMED';state.failureRpcs=[];await reconcilePayment('pay_pending',undefined,'PAYMENT_CREDIT_CARD_CAPTURE_REFUSED');assert.deepEqual(state.failureRpcs.map((r:any)=>r.name),['confirm_payment']);
 }finally{globalThis.fetch=oldFetch;delete state.failureRpcs;await rm(dir,{recursive:true,force:true});}
});
