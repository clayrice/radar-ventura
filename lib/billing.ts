import 'server-only';
import {adminDb,checked} from './db';
import {productNames,prices} from './products';
export const billingEnabled=()=>process.env.BILLING_ENABLED==='true'&&!!process.env.ASAAS_API_KEY;
export function priceFor(product:string){const value=Number(prices[product]);return productNames[product]&&Number.isSafeInteger(value)&&value>0?value:null;}
export function asaasBase(){return process.env.ASAAS_ENV==='production'?'https://api.asaas.com/v3':'https://api-sandbox.asaas.com/v3';}
export async function asaas(path:string,init:RequestInit={}){const r=await fetch(asaasBase()+path,{...init,signal:AbortSignal.timeout(20000),headers:{'Content-Type':'application/json',access_token:process.env.ASAAS_API_KEY!,'User-Agent':'VenturaAI/0.1',...init.headers}});if(!r.ok)throw new Error(`Asaas HTTP ${r.status}`);return r.json();}
export async function createCheckout(userId:string,product:string,value:number){const db=adminDb();const existing=checked(await db.from('orders').select('*').eq('user_id',userId).eq('product',product).in('status',['creating','pending','review']).maybeSingle());
 const link=(id:string)=>`${process.env.ASAAS_ENV==='production'?'https://asaas.com':'https://sandbox.asaas.com'}/checkoutSession/show?id=${encodeURIComponent(id)}`;
 if(existing){if(existing.checkout_id&&existing.status==='pending'&&Date.now()-Date.parse(existing.created_at)<50*60000)return link(existing.checkout_id);throw new Error('Pedido anterior precisa ser conciliado antes de uma nova tentativa.');}
 const o=checked(await db.from('orders').insert({user_id:userId,product,value_cents:value}).select('id').single());if(!o)throw new Error('Pedido não criado');
 const origin=process.env.APP_URL!;if(!origin.startsWith('https://'))throw new Error('APP_URL HTTPS obrigatório');
 try{const body={externalReference:o.id,billingTypes:['CREDIT_CARD'],chargeTypes:[product==='roadmap'?'DETACHED':'RECURRENT'],minutesToExpire:60,callback:{successUrl:`${origin}/account/pagamento`,cancelUrl:`${origin}/account/pagamento?status=cancelado`,expiredUrl:`${origin}/account/pagamento?status=expirado`},items:[{name:productNames[product],description:product==='roadmap'?'Compra avulsa':'Assinatura mensal',quantity:1,value:value/100}],...(product==='roadmap'?{}:{subscription:{cycle:'MONTHLY',nextDueDate:new Date().toISOString().slice(0,10)}})};
 const result=await asaas('/checkouts',{method:'POST',body:JSON.stringify(body)});if(!result.id)throw new Error('Checkout sem identificador');checked(await db.from('orders').update({checkout_id:result.id,status:'pending'}).eq('id',o.id));return link(result.id);
 }catch(e){checked(await db.from('orders').update({status:'review',last_error:'Confirmar no Asaas se o checkout foi criado antes de repetir.'}).eq('id',o.id));throw e;}}
export async function reconcilePayment(paymentId:string,checkoutId?:string){const db=adminDb();const payment=await asaas(`/payments/${encodeURIComponent(paymentId)}`);
 let order=null;
 if(checkoutId||payment.checkoutSession)order=checked(await db.from('orders').select('*').eq('checkout_id',checkoutId||payment.checkoutSession).maybeSingle());
 if(!order&&payment.subscription)order=checked(await db.from('orders').select('*').eq('subscription_id',payment.subscription).maybeSingle());
 if(!order)return false;
 if(Math.round(Number(payment.value)*100)!==order.value_cents)throw new Error('Valor divergente do pedido');
 if(['CONFIRMED','RECEIVED','RECEIVED_IN_CASH'].includes(payment.status)){
 const due=new Date(`${payment.dueDate}T12:00:00Z`);if(!Number.isFinite(due.getTime()))throw new Error('Data de pagamento inválida');const day=due.getUTCDate();due.setUTCDate(1);due.setUTCMonth(due.getUTCMonth()+1);const last=new Date(Date.UTC(due.getUTCFullYear(),due.getUTCMonth()+1,0)).getUTCDate();due.setUTCDate(Math.min(day,last));
 checked(await db.rpc('confirm_payment',{order_key:order.id,payment_key:payment.id,subscription_key:payment.subscription||null,paid_until:due.toISOString()}));
 }else if(['REFUNDED','REFUND_REQUESTED','CHARGEBACK_REQUESTED','CHARGEBACK_DISPUTE'].includes(payment.status)){checked(await db.rpc('revoke_payment',{payment_key:payment.id}));}
 return true;
}
