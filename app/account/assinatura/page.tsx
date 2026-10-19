import Link from 'next/link';
import {sessionDb,checked,isDemo} from '@/lib/db';
import {asaas} from '@/lib/billing';
import {CancelSubscription} from '@/components/cancel-subscription';
export default async function Subscription(){
 if(isDemo())return <div className="panel"><h2>Minha assinatura</h2><p>Esta conta demonstrativa não possui cobranças.</p></div>;
 const db=await sessionDb();const {data:{user}}=await db.auth.getUser();
 const orders=checked(await db.from('orders').select('id,subscription_id,renewal_status,created_at').eq('user_id',user!.id).eq('product','weekly').eq('status','paid').order('created_at',{ascending:false}).limit(10));
 const sub=checked(await db.from('subscriptions').select('status,expires_at').eq('user_id',user!.id).maybeSingle());
 const current=orders?.find(o=>o.subscription_id&&o.renewal_status==='active');
 let nextDue:string|null=null;
 if(current){try{const provider=await asaas(`/subscriptions/${encodeURIComponent(current.subscription_id!)}`);if(provider.status==='ACTIVE'&&/^\d{4}-\d{2}-\d{2}$/.test(provider.nextDueDate))nextDue=new Date(`${provider.nextDueDate}T12:00:00Z`).toLocaleDateString('pt-BR',{timeZone:'America/Sao_Paulo'});}catch{/* Access and cancellation remain available when the provider is temporarily unreachable. */}}
 const active=sub?.status==='active'&&sub.expires_at&&new Date(sub.expires_at)>new Date();
 const date=sub?.expires_at?new Date(sub.expires_at).toLocaleDateString('pt-BR',{timeZone:'America/Sao_Paulo'}):null;
 return <div className="panel"><span className="eyebrow">MINHA ASSINATURA</span><h1>Ventura Semanal</h1><p>R$ 9,90/mês · edição personalizada toda semana</p><p>{active?`Seu acesso está garantido até ${date}.`:'Você não possui um período pago ativo.'}</p>{current&&<p>{nextDue?`Próxima cobrança prevista: ${nextDue}.`:'A data da próxima cobrança está temporariamente indisponível. Você pode cancelar a renovação abaixo.'}</p>}{orders?.filter(o=>o.subscription_id).map(o=><section key={o.id} className="edition-item"><h2>{o.renewal_status==='cancelled'?'Renovação cancelada':o.renewal_status==='cancel_requested'?'Cancelamento em análise':'Renovação mensal ativa'}</h2><p>{o.renewal_status==='cancelled'?'Não haverá novas cobranças desta assinatura. Seu histórico continua disponível.':o.renewal_status==='cancel_requested'?'O pedido foi registrado. Confirme o resultado antes de iniciar uma nova assinatura.':'A renovação cobra o próximo período mensal automaticamente.'}</p>{o.renewal_status!=='cancelled'&&<CancelSubscription orderId={o.id} pending={o.renewal_status==='cancel_requested'}/>}</section>)}<p>Cancelar o recebimento dos e-mails é uma preferência separada da renovação da assinatura.</p><p>Para falar sobre pagamentos ou solicitar análise de estorno: <a href="mailto:hello@ventura-ai.com">hello@ventura-ai.com</a>.</p><Link className="text-link" href="/account">Voltar às minhas edições ↗</Link></div>;
}
