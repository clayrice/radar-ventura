"use client";
import {useActionState,useState} from 'react';
import {label as pt} from '@/lib/labels';
import {saveProfile} from '@/app/actions';
import {sectors,type Profile} from '@/lib/types';
import {objectives,interestAreas,businessModels,aiLevels} from '@/lib/profile-options';

export function ProfileForm({profile,demo=false}:{profile:Profile|null;demo?:boolean}){
 const [state,action,pending]=useActionState(saveProfile,{message:''});
 const [selected,setSelected]=useState<string[]>(profile?.interests||[]);
 const dropdown=(name:string,title:string,options:readonly string[],value?:string|null)=>(
  <label className="field" key={name}>{title}
   <select name={name} required defaultValue={value||''}>
    <option value="" disabled>Selecione uma opção</option>
    {options.map(option=><option key={option} value={option}>{pt(option)}</option>)}
   </select>
  </label>
 );
 return <form action={action}><div className="form-grid">
  <label className="field">Nome da empresa<input name="company" required minLength={2} maxLength={120} defaultValue={profile?.company||''} placeholder="Sua empresa"/></label>
  {dropdown('sector','Em qual setor sua empresa atua?',sectors,profile?.sector)}
  {dropdown('size','Quantas pessoas trabalham na empresa?',['Solo','2–10','11–50','51–200','200+'],profile?.size)}
  {dropdown('business_model','Quem sua empresa atende?',businessModels,profile?.business_model)}
  {dropdown('objective','Qual é seu principal objetivo com IA?',objectives,profile?.objective)}
  {dropdown('ai_level','Como vocês usam IA hoje?',aiLevels,profile?.ai_level)}
  <fieldset className="full" aria-describedby="interests-help"><legend>Quais áreas você quer acompanhar?</legend>
   <p id="interests-help" className="muted">Escolha de uma a três áreas. {selected.length}/3 selecionadas.</p>
   <div className="checkbox-grid">{interestAreas.map(area=><label className="check" key={area}>
    <input type="checkbox" name="interests" value={area} checked={selected.includes(area)} disabled={selected.length>=3&&!selected.includes(area)} onChange={e=>setSelected(e.target.checked?[...selected,area]:selected.filter(value=>value!==area))}/>{area}
   </label>)}</div>
  </fieldset>
  <label className="check full"><input type="checkbox" name="email_opt_in" defaultChecked={profile?.email_opt_in||false}/><span>Quero receber minha edição semanal por email. Posso cancelar o envio a qualquer momento. Minhas escolhas serão usadas para personalizar o conteúdo.</span></label>
 </div><button className="button" disabled={pending||selected.length===0}>{pending?'Salvando…':demo?'Testar minhas escolhas':'Salvar preferências'}</button><p className="form-message" role="status">{state.message}</p></form>;
}
