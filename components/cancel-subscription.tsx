"use client";
import {useState} from 'react';
import {useRouter} from 'next/navigation';
export function CancelSubscription({orderId,pending=false}:{orderId:string;pending?:boolean}){
 const [confirm,setConfirm]=useState(false),[busy,setBusy]=useState(false),[message,setMessage]=useState('');const router=useRouter();
 async function cancel(){setBusy(true);try{const r=await fetch('/api/billing/cancel',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({orderId,confirm:true})});const result=await r.json();setMessage(result.message);if(r.ok){setConfirm(false);router.refresh();}}catch{setMessage('Não foi possível conectar. Confira o estado da assinatura antes de tentar novamente.');}finally{setBusy(false);}}
 return <><button className="button outline" onClick={()=>setConfirm(true)} disabled={busy}>{pending?'Conferir cancelamento':'Cancelar renovação'}</button>{confirm&&<div className="notice" role="region" aria-label="Confirmar cancelamento"><p>Quer cancelar a renovação mensal? Não haverá novas cobranças desta assinatura. As cobranças pendentes vinculadas à recorrência serão removidas. Seu acesso continua até o fim do período já pago.</p><p>Este pedido não solicita estorno de pagamentos anteriores.</p><button className="button" onClick={cancel} disabled={busy}>{busy?'Confirmando…':'Sim, cancelar renovação'}</button> <button className="button outline" onClick={()=>setConfirm(false)} disabled={busy}>Manter assinatura</button></div>}<p role="status" className="form-message">{message}</p></>;
}
