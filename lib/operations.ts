import 'server-only';
import {notFound} from 'next/navigation';
import {adminDb,checked,isDemo,sessionDb} from './db';
import {operationsAllowed} from './operations-access';
export type OperationsSnapshot={day:string;generated_at:string;articles_today:number;photos_today:number;posts_today:number;daily_status:string|null;daily_active:number;daily_pending:number;daily_sent_today:number;daily_review:number;weekly_active:number;weekly_queued:number;weekly_ready:number;weekly_review:number;weekly_sent:number;billing_review:number;billing_events_pending:number;financial_queued:number;financial_review:number;financial_sent:number;partners_active:number;personalization_calls:number;news_calls:number;daily_history:{radar_date:string;status:string;attempts:number;updated_at:string}[];runs:{job:string;status:string;started_at:string;finished_at:string|null}[]};
export async function loadOperations(){
 if(isDemo())notFound();
 const session=await sessionDb();const {data:{user},error}=await session.auth.getUser();
 if(error||!operationsAllowed(user))notFound();
 // No privileged connection is created until server-verified access passes.
 return checked(await adminDb().rpc('operations_snapshot')) as OperationsSnapshot;
}
export function operationAlerts(s:OperationsSnapshot){
 const alerts:{title:string;detail:string}[]=[];
 if(s.weekly_review+s.daily_review+s.financial_review>0)alerts.push({title:'Entregas precisam de conferência',detail:'Há mensagens ou edições em revisão. Confira o resultado no provedor antes de qualquer reenvio.'});
 if(s.billing_review+s.billing_events_pending>0)alerts.push({title:'Pagamentos precisam de conciliação',detail:'Há pedidos antigos pendentes ou eventos financeiros ainda não processados. Isso não confirma uma cobrança em atraso.'});
 if(s.personalization_calls>=10)alerts.push({title:'Cota de personalização atingida',detail:'Novas gerações precisam aguardar o próximo ciclo diário. Edições já prontas podem continuar sendo entregues.'});
 if(s.news_calls>=40)alerts.push({title:'Cota de análise de notícias atingida',detail:'A coleta precisará aguardar o próximo ciclo diário para novas análises.'});
 if(s.partners_active===0)alerts.push({title:'Diretório sem parceiros ativos',detail:'As edições usam o acesso ao diretório enquanto não houver empresas reais cadastradas e elegíveis.'});
 if(s.runs.some(r=>r.status==='running'&&Date.now()-Date.parse(r.started_at)>15*60000))alerts.push({title:'Execução sem encerramento registrado',detail:'Uma rotina está sem conclusão há mais de 15 minutos. Confira a hospedagem antes de repetir a execução.'});
 return alerts;
}
