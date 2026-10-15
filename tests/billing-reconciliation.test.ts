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
