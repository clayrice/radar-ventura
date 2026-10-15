import test from 'node:test';import assert from 'node:assert/strict';
import {build} from 'esbuild';import {mkdtemp,rm} from 'node:fs/promises';import {tmpdir} from 'node:os';import {join} from 'node:path';import {createRequire} from 'node:module';
test('checkout sem cobrança indexada mantém pendência sem bloquear evento financeiro e deduplica pagamento',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'billing-webhook-')),prior=process.env.ASAAS_WEBHOOK_TOKEN;
 const state=globalThis as typeof globalThis&{billingWebhookState?:{events:Record<string,{status:string}>,reconciled:number}};
 try{
 state.billingWebhookState={events:{},reconciled:0};process.env.ASAAS_WEBHOOK_TOKEN='x'.repeat(32);
 const bundle=join(dir,'route.cjs');await build({entryPoints:[new URL('../app/api/billing/webhook/route.ts',import.meta.url).pathname],outfile:bundle,bundle:true,platform:'node',format:'cjs',plugins:[{name:'services',setup(b){b.onResolve({filter:/^@\/lib\/(billing|db)$/},a=>({path:a.path.endsWith('/db')?'db':'billing',namespace:'fake'}));b.onLoad({filter:/.*/,namespace:'fake'},a=>({loader:'js',contents:a.path==='billing'?`export const billingEnabled=()=>true;export const checkoutPaymentIds=async()=>[];export async function reconcilePayment(){globalThis.billingWebhookState.reconciled++;return true}`:`export const isDemo=()=>false;export const checked=r=>r.data;export function adminDb(){return {from(){const q={id:null,patch:null,select(){return this},eq(k,v){this.id=v;return this},async maybeSingle(){return {data:globalThis.billingWebhookState.events[this.id]||null}},async upsert(v){globalThis.billingWebhookState.events[v.id]??={status:'pending'};return {data:null}},update(v){this.patch=v;return this},then(resolve){Object.assign(globalThis.billingWebhookState.events[this.id],this.patch);return Promise.resolve({data:null}).then(resolve)}};return q}}}` }));}}]});
 const {POST}=createRequire(import.meta.url)(bundle);const send=(event:unknown,token=process.env.ASAAS_WEBHOOK_TOKEN!)=>POST(new Request('https://radar.example/api/billing/webhook',{method:'POST',headers:{'asaas-access-token':token},body:JSON.stringify(event)}));
 const pending=await send({id:'evt_checkout',event:'CHECKOUT_PAID',checkout:{id:'checkout_1'}});assert.equal(pending.status,200);assert.equal((await pending.json()).pending,true);assert.equal(state.billingWebhookState.events.evt_checkout.status,'pending');
 const payment={id:'evt_payment',event:'PAYMENT_CONFIRMED',payment:{id:'pay_1'}};
 assert.equal((await send(payment)).status,200);assert.equal(state.billingWebhookState.events.evt_payment.status,'processed');assert.equal(state.billingWebhookState.reconciled,1);
 assert.equal((await send(payment)).status,200);assert.equal(state.billingWebhookState.reconciled,1);
 assert.equal((await send({id:'evt_bad',event:'PAYMENT_CONFIRMED'},'bad')).status,401);assert.equal(state.billingWebhookState.events.evt_bad,undefined);
 }finally{if(prior===undefined)delete process.env.ASAAS_WEBHOOK_TOKEN;else process.env.ASAAS_WEBHOOK_TOKEN=prior;delete state.billingWebhookState;await rm(dir,{recursive:true,force:true});}
});
