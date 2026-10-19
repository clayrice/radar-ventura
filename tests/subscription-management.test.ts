import test from 'node:test';import assert from 'node:assert/strict';
import {build} from 'esbuild';import {mkdtemp,rm} from 'node:fs/promises';import {tmpdir} from 'node:os';import {join} from 'node:path';import {createRequire} from 'node:module';

test('cancelamento valida propriedade, preserva acesso pago e só conclui após confirmação do provedor',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'subscription-cancel-'));
 const state=globalThis as any;
 try{
 state.cancelState={user:'owner',order:{id:'order',subscription_id:'sub_provider',renewal_status:'active'},updates:[],requests:[],failure:false,missing:false};
 const path=join(dir,'cancel.cjs');await build({entryPoints:[new URL('../lib/subscription-management.ts',import.meta.url).pathname],outfile:path,bundle:true,platform:'node',format:'cjs',plugins:[{name:'services',setup(b){b.onResolve({filter:/^(server-only|\.\/db|\.\/billing)$/},a=>({path:a.path,namespace:'fake'}));b.onLoad({filter:/.*/,namespace:'fake'},a=>({contents:a.path==='server-only'?'':a.path==='./billing'?`export async function asaas(path,init){const s=globalThis.cancelState;s.requests.push({path,method:init?.method});if(s.failure)throw Error('Asaas HTTP 500');if(s.missing)throw Error('Asaas HTTP 404');return {deleted:!s.notDeleted};}`:`export const checked=x=>{if(x.error)throw x.error;return x.data};export function adminDb(){const s=globalThis.cancelState;return {rpc:async(name)=>({data:true}),from(table){if(table!=='orders')throw Error('Paid access must not be changed');const filters={};let update;return {select(){return this},eq(k,v){filters[k]=v;return this},update(v){update=v;return this},async maybeSingle(){return {data:filters.user_id===s.user?s.order:null}},then(resolve){if(update){s.updates.push(update);Object.assign(s.order,update)}resolve({data:null})}}}};}`}));}}]});
 const {cancelWeeklyRenewal}=createRequire(import.meta.url)(path);const s=state.cancelState;
 await assert.rejects(cancelWeeklyRenewal('other','order'),/não encontrada/);assert.equal(s.requests.length,0);
 s.failure=true;await assert.rejects(cancelWeeklyRenewal('owner','order'),/500/);assert.equal(s.order.renewal_status,'cancel_requested');assert.equal(s.order.cancelled_at,undefined);
 s.failure=false;s.notDeleted=true;await assert.rejects(cancelWeeklyRenewal('owner','order'),/não confirmado/);assert.equal(s.order.renewal_status,'cancel_requested');s.notDeleted=false;await cancelWeeklyRenewal('owner','order');assert.equal(s.order.renewal_status,'cancelled');assert.ok(s.order.cancelled_at);assert.ok(s.updates.every((x:any)=>!('status' in x)&&!('expires_at' in x)));
 const requests=s.requests.length;await cancelWeeklyRenewal('owner','order');assert.equal(s.requests.length,requests);
 s.order.renewal_status='cancel_requested';s.missing=true;await cancelWeeklyRenewal('owner','order');assert.equal(s.order.renewal_status,'cancelled');assert.equal(s.requests.at(-1).method,undefined);
 }finally{delete state.cancelState;await rm(dir,{recursive:true,force:true});}
});

test('rota de cancelamento exige login, origem, confirmação explícita e ID de pedido válido',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'subscription-route-'));const state=globalThis as any;const old=process.env.APP_URL;
 try{
 process.env.APP_URL='https://radar.example';state.cancelRouteUser=null;state.cancelRouteCalls=[];
 const path=join(dir,'route.cjs');await build({entryPoints:[new URL('../app/api/billing/cancel/route.ts',import.meta.url).pathname],outfile:path,bundle:true,platform:'node',format:'cjs',plugins:[{name:'services',setup(b){b.onResolve({filter:/^@\/lib\/(db|subscription-management)$/},a=>({path:a.path,namespace:'fake'}));b.onLoad({filter:/.*/,namespace:'fake'},a=>({contents:a.path.endsWith('/db')?`export const isDemo=()=>false;export async function sessionDb(){return {auth:{async getUser(){return {data:{user:globalThis.cancelRouteUser}}}}}}`:`export async function cancelWeeklyRenewal(user,order){globalThis.cancelRouteCalls.push({user,order})}`}));}}]});
 const {POST}=createRequire(import.meta.url)(path);const request=(body:any,origin='https://radar.example')=>new Request('https://radar.example/api/billing/cancel',{method:'POST',headers:{origin,'content-type':'application/json'},body:JSON.stringify(body)});
 const orderId='00000000-0000-4000-8000-000000000001';
 assert.equal((await POST(request({orderId,confirm:true},'https://outside.example'))).status,403);
 assert.equal((await POST(request({orderId,confirm:true}))).status,401);
 state.cancelRouteUser={id:'owner'};
 assert.equal((await POST(request({orderId}))).status,400);assert.equal((await POST(request({orderId:'sub_provider',confirm:true}))).status,400);
 assert.equal(state.cancelRouteCalls.length,0);assert.equal((await POST(request({orderId,confirm:true}))).status,200);assert.deepEqual(state.cancelRouteCalls,[{user:'owner',order:orderId}]);
 }finally{process.env.APP_URL=old;delete state.cancelRouteUser;delete state.cancelRouteCalls;await rm(dir,{recursive:true,force:true});}
});

test('nova compra semanal aguarda o período pago e o encerramento da recorrência anterior',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'subscription-checkout-'));const state=globalThis as any;const old=process.env.APP_URL;
 try{
 process.env.APP_URL='https://radar.example';state.checkoutState={expiry:'2099-01-01',renewal:'cancelled',created:0};
 const path=join(dir,'checkout.cjs');await build({entryPoints:[new URL('../app/api/billing/checkout/route.ts',import.meta.url).pathname],outfile:path,bundle:true,platform:'node',format:'cjs',plugins:[{name:'services',setup(b){b.onResolve({filter:/^@\/lib\/(db|billing)$/},a=>({path:a.path,namespace:'fake'}));b.onLoad({filter:/.*/,namespace:'fake'},a=>({contents:a.path.endsWith('/billing')?`export const billingEnabled=()=>true;export const priceFor=()=>990;export async function createCheckout(){globalThis.checkoutState.created++;return 'https://asaas.com/checkout'}`:`export const isDemo=()=>false;export const checked=x=>x.data;export async function sessionDb(){return {auth:{async getUser(){return {data:{user:{id:'owner'}}}}},from(table){return {select(){return this},eq(){return this},in(){return this},neq(){return this},async maybeSingle(){return {data:table==='profiles'?{user_id:'owner'}:{status:'active',expires_at:globalThis.checkoutState.expiry}}},async limit(){return {data:globalThis.checkoutState.renewal==='cancelled'?[]:[{id:'paid-order'}]}}}}}}`}));}}]});
 const {POST}=createRequire(import.meta.url)(path);const req=()=>new Request('https://radar.example/api/billing/checkout',{method:'POST',headers:{origin:'https://radar.example','content-type':'application/json'},body:JSON.stringify({product:'weekly'})});
 assert.equal((await POST(req())).status,409);assert.equal(state.checkoutState.created,0);
 state.checkoutState.expiry='2020-01-01';state.checkoutState.renewal='cancel_requested';assert.equal((await POST(req())).status,409);assert.equal(state.checkoutState.created,0);
 state.checkoutState.renewal='cancelled';assert.equal((await POST(req())).status,200);assert.equal(state.checkoutState.created,1);
 }finally{process.env.APP_URL=old;delete state.checkoutState;await rm(dir,{recursive:true,force:true});}
});
