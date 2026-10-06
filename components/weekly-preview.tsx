"use client";
import {useActionState} from 'react';
import {previewWeekly,type PreviewState} from '@/app/weekly-preview-actions';
import {EditionView} from './edition-view';
export function WeeklyPreview(){const [state,action,pending]=useActionState<PreviewState,FormData>(previewWeekly,{message:''});return <section className="panel"><h2>Experimente sua edição</h2><p>Uma prévia personalizada com matérias dos últimos sete dias. Sem cobrança ou envio de email. Aguarde dez minutos entre os testes.</p><form action={action}><button className="button" disabled={pending}>{pending?'Preparando sua edição…':'Gerar minha prévia'}</button></form><p role="status" className="form-message">{state.message}</p>{state.edition&&<><p className="notice">PRÉVIA · NÃO ENVIADA · Não representa a edição semanal agendada.</p><EditionView edition={state.edition}/></>}</section>}
