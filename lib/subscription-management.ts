import 'server-only';
import {adminDb,checked} from './db';
import {asaas} from './billing';

// An external cancellation changes renewal only. Paid access still expires
// through the existing payment ledger, including any later refund events.
export async function reconcileWeeklyCancellation(subscriptionId:string){
 if(!/^sub_[A-Za-z0-9_-]{1,100}$/.test(subscriptionId))throw Error('Assinatura inválida.');
 const db=adminDb();
 const orders=checked(await db.from('orders').select('id,renewal_status').eq('subscription_id',subscriptionId).eq('product','weekly').limit(2));
 if(!orders?.length)return false;
 if(orders.length!==1)throw Error('Recorrência associada a mais de um pedido.');
 if(orders[0].renewal_status==='cancelled')return true;
 const owner=crypto.randomUUID(),lock=`cancel-subscription:${orders[0].id}`;
 if(!checked(await db.rpc('acquire_job',{lock_name:lock,lock_owner:owner})))throw Error('Cancelamento em andamento.');
 try{
 try{const current=await asaas(`/subscriptions/${encodeURIComponent(subscriptionId)}`);if(current.deleted!==true)throw Error('Remoção ainda não confirmada pelo provedor.');}
 catch(error){if(!(error instanceof Error)||error.message!=='Asaas HTTP 404')throw error;}
 checked(await db.from('orders').update({renewal_status:'cancelled',cancelled_at:new Date().toISOString(),last_error:null}).eq('id',orders[0].id).eq('subscription_id',subscriptionId).eq('product','weekly'));
 return true;
 }finally{checked(await db.rpc('release_job',{lock_name:lock,lock_owner:owner}));}
}

// The caller supplies only an owned order ID, never a provider subscription ID.
export async function cancelWeeklyRenewal(userId:string,orderId:string){
 const db=adminDb();
 const order=checked(await db.from('orders').select('id,subscription_id,renewal_status').eq('id',orderId).eq('user_id',userId).eq('product','weekly').eq('status','paid').maybeSingle());
 if(!order?.subscription_id)throw Error('Assinatura não encontrada.');
 if(order.renewal_status==='cancelled')return;
 const owner=crypto.randomUUID(),lock=`cancel-subscription:${order.id}`;
 if(!checked(await db.rpc('acquire_job',{lock_name:lock,lock_owner:owner})))throw Error('Cancelamento em andamento. Confira novamente em instantes.');
 try{
  checked(await db.from('orders').update({renewal_status:'cancel_requested',cancellation_requested_at:new Date().toISOString()}).eq('id',order.id).eq('user_id',userId));
  // A retry after a successful DELETE may receive 404. Verify absence before
  // accepting it; other provider failures always leave the request pending.
  try{const result=await asaas(`/subscriptions/${encodeURIComponent(order.subscription_id)}`,{method:'DELETE'});if(result.deleted!==true)throw Error('Cancelamento não confirmado pelo provedor.');}
  catch(error){
   if(!(error instanceof Error)||error.message!=='Asaas HTTP 404')throw error;
   try{const current=await asaas(`/subscriptions/${encodeURIComponent(order.subscription_id)}`);if(current.deleted!==true)throw Error('Assinatura ainda existe no provedor.');}
   catch(check){if(!(check instanceof Error)||check.message!=='Asaas HTTP 404')throw check;}
  }
  checked(await db.from('orders').update({renewal_status:'cancelled',cancelled_at:new Date().toISOString(),last_error:null}).eq('id',order.id).eq('user_id',userId));
  // Keep paid entitlement and historical payment records unchanged.
 }finally{checked(await db.rpc('release_job',{lock_name:lock,lock_owner:owner}));}
}
