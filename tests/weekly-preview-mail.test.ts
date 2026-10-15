import test from 'node:test';import assert from 'node:assert/strict';import {build} from 'esbuild';import {mkdtemp,rm} from 'node:fs/promises';import {tmpdir} from 'node:os';import {join} from 'node:path';import {createRequire} from 'node:module';
import {editionEmail} from '../lib/email-template';import {demoEdition} from '../lib/demo';
test('prévia enviada é identificada e aponta à conta em vez de uma edição inexistente',()=>{
 const email=editionEmail({...demoEdition,id:'preview',status:'preview'},'https://radar.example','https://radar.example/unsubscribe');
 assert.ok(email.subject.startsWith('[PRÉVIA]'));assert.ok(email.html.includes('PRÉVIA DE TESTE'));assert.ok(!email.html.includes('/editions/preview'));assert.ok(email.text.includes('Histórico: https://radar.example/account'));
});
test('envio manual semanal exige destinatário de teste e consentimento antes de gastar IA ou enviar',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'weekly-preview-mail-'));const state=globalThis as typeof globalThis&{weeklyMailUser?:{email:string,id:string},weeklyMailConsent?:boolean};
 try{
 const bundle=join(dir,'action.cjs');await build({entryPoints:[new URL('../app/weekly-preview-actions.ts',import.meta.url).pathname],outfile:bundle,bundle:true,platform:'node',format:'cjs',plugins:[{name:'services',setup(b){b.onResolve({filter:/^@\/lib\/(db|daily-mail|ai|unsubscribe)$/},a=>({path:a.path.split('/').at(-1)!,namespace:'fake'}));b.onLoad({filter:/.*/,namespace:'fake'},a=>({loader:'js',contents:a.path==='db'?`export const isDemo=()=>false;export const checked=x=>x.data;export function adminDb(){throw Error('not allowed')};export async function sessionDb(){return {auth:{async getUser(){return {data:{user:globalThis.weeklyMailUser}}}},from(){return {select(){return this},eq(){return this},async maybeSingle(){return {data:{email_opt_in:globalThis.weeklyMailConsent}}}}}}}`:a.path==='daily-mail'?`export const confirmationTestAllowed=email=>email==='tester@example.com';export function sendConfirmationPayload(){throw Error('not allowed')}`:a.path==='ai'?`export function generate(){throw Error('not allowed')}`:`export const unsubscribeToken=()=>'';`}));}}]});
 const {emailWeeklyPreview}=createRequire(import.meta.url)(bundle);
 state.weeklyMailUser={id:'test-user',email:'outside@example.com'};state.weeklyMailConsent=true;assert.match((await emailWeeklyPreview({message:''})).message,/não está disponível/);
 state.weeklyMailUser.email='tester@example.com';state.weeklyMailConsent=false;assert.match((await emailWeeklyPreview({message:''})).message,/Autorize/);
 }finally{delete state.weeklyMailUser;delete state.weeklyMailConsent;await rm(dir,{recursive:true,force:true});}
});
