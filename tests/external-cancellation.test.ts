import test from 'node:test';
import assert from 'node:assert/strict';
import {build} from 'esbuild';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createRequire} from 'node:module';

test('cancelamento externo exige pedido conhecido e prova do provedor, preservando acesso pago',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'external-cancel-'));
 const global=globalThis as any;
 global.externalCancel={orders:[{id:'owned-order',renewal_status:'active'}],provider:{deleted:false},requests:[],updates:[],lock:true};
 try{
  const file=join(dir,'app.cjs');
  await build({entryPoints:[new URL('../lib/subscription-management.ts',import.meta.url).pathname],outfile:file,bundle:true,platform:'node',format:'cjs',plugins:[{name:'boundaries',setup(b){
   b.onResolve({filter:/^(server-only|\.\/db|\.\/billing)$/},a=>({path:a.path,namespace:'test'}));
   b.onLoad({filter:/.*/,namespace:'test'},a=>({loader:'js',contents:a.path==='server-only'?'':a.path==='./billing'?`
    export async function asaas(path,init){const s=globalThis.externalCancel;s.requests.push({path,method:init?.method});if(s.error)throw Error('Asaas HTTP '+s.error);return s.provider;}
   `:`
    export const checked=r=>{if(r.error)throw Error(r.error.message);return r.data};
    export function adminDb(){const s=globalThis.externalCancel;return {rpc:async(name)=>({data:name==='acquire_job'?s.lock:true}),from(table){if(table!=='orders')throw Error('Paid access must not change');const filters={};let patch;return {select(){return this},eq(k,v){filters[k]=v;return this},async limit(){if(filters.subscription_id!=='sub_fixture'||filters.product!=='weekly')throw Error('Unrestricted order lookup');return {data:s.orders}},update(value){patch=value;return this},then(resolve){if(filters.id!=='owned-order'||filters.subscription_id!=='sub_fixture'||filters.product!=='weekly')throw Error('Unrestricted update');s.updates.push(patch);Object.assign(s.orders[0],patch);return Promise.resolve({data:null}).then(resolve)}}}}}
   `}));
  }}]});
  const {reconcileWeeklyCancellation}=createRequire(import.meta.url)(file),s=global.externalCancel;
  await assert.rejects(reconcileWeeklyCancellation('../outside'),/inválida/);assert.equal(s.requests.length,0);
  await assert.rejects(reconcileWeeklyCancellation('sub_fixture'),/não confirmada/);assert.equal(s.updates.length,0);
  s.error=500;await assert.rejects(reconcileWeeklyCancellation('sub_fixture'),/500/);assert.equal(s.updates.length,0);
  s.error=0;s.provider={};await assert.rejects(reconcileWeeklyCancellation('sub_fixture'),/não confirmada/);
  s.lock=false;await assert.rejects(reconcileWeeklyCancellation('sub_fixture'),/andamento/);s.lock=true;
  s.provider={deleted:true};assert.equal(await reconcileWeeklyCancellation('sub_fixture'),true);
  assert.equal(s.orders[0].renewal_status,'cancelled');assert.ok(s.orders[0].cancelled_at);assert.deepEqual(Object.keys(s.updates[0]).sort(),['cancelled_at','last_error','renewal_status']);
  const calls=s.requests.length;assert.equal(await reconcileWeeklyCancellation('sub_fixture'),true);assert.equal(s.requests.length,calls);
  s.orders=[{id:'owned-order',renewal_status:'active'}];s.error=404;assert.equal(await reconcileWeeklyCancellation('sub_fixture'),true);
  s.orders=[];assert.equal(await reconcileWeeklyCancellation('sub_fixture'),false);
  s.orders=[{id:'a'},{id:'b'}];await assert.rejects(reconcileWeeklyCancellation('sub_fixture'),/mais de um pedido/);
  assert.ok(s.requests.every((r:any)=>r.method===undefined));
 }finally{delete global.externalCancel;await rm(dir,{recursive:true,force:true});}
});
