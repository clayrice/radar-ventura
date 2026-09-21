"use client";
import {useActionState} from 'react';
import {login,loginGoogle} from '@/app/actions';
export function LoginForm({next,googleEnabled}:{next:string;googleEnabled:boolean}){
 const [state,action,pending]=useActionState(login,{message:''});
 const [googleState,googleAction,googlePending]=useActionState(loginGoogle,{message:''});
 return <div>
  {googleEnabled&&<form action={googleAction}>
   <input type="hidden" name="next" value={next}/>
   <button className="button outline" disabled={googlePending||pending}>{googlePending?'Conectando…':'Continuar com Google'}</button>
   <p className="form-message" role="status">{googleState.message}</p>
  </form>}
  {googleEnabled&&<p>Ou continue com seu email</p>}
  <form action={action}>
   <input type="hidden" name="next" value={next}/>
   <label className="field">Seu email<input name="email" type="email" autoComplete="email" required placeholder="voce@empresa.com.br"/></label>
   <button className="button" disabled={pending||googlePending}>{pending?'Enviando…':'Receber meu link de acesso ↗'}</button>
   <p className="form-message" role="status">{state.message}</p>
  </form>
 </div>;
}
