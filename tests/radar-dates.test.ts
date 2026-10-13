import test from 'node:test';
import assert from 'node:assert/strict';
import edition from '../data/radar/edition.json';
import {formatRadarDate,groupEditions,radarDate} from '../lib/radar-dates';
import type {Article} from '../lib/types';

test('data editorial respeita o fuso de Brasília',()=>{
 assert.equal(radarDate(new Date('2026-09-23T02:30:00Z')),'2026-09-22');
 assert.equal(radarDate(new Date('2026-09-23T03:30:00Z')),'2026-09-23');
 assert.equal(formatRadarDate('2026-09-21'),'21 de setembro de 2026');
});

test('arquivo agrupa notícias por edição e ordena da mais recente',()=>{
 const base=edition.articles[0] as Article;
 const groups=groupEditions([
  {...base,id:'old',radar_date:'2026-09-21'},
  {...base,id:'new-a',radar_date:'2026-09-23'},
  {...base,id:'new-b',radar_date:'2026-09-23'},
  {...base,id:'missing',radar_date:null}
 ]);
 assert.deepEqual(groups.map(group=>[group.date,group.articles.length]),[['2026-09-23',2],['2026-09-21',1]]);
});

test('arquivo inclui notícias publicadas hoje para os links do e-mail e exclui datas futuras',async()=>{
 const {build}=await import('esbuild');const {mkdtemp,rm}=await import('node:fs/promises');const {tmpdir}=await import('node:os');const {join}=await import('node:path');const {createRequire}=await import('node:module');
 const dir=await mkdtemp(join(tmpdir(),'radar-archive-'));
 try{
 const output=join(dir,'data.cjs');
 await build({entryPoints:[new URL('../lib/data.ts',import.meta.url).pathname],outfile:output,bundle:true,platform:'node',format:'cjs',plugins:[{name:'db-boundary',setup(b){
 b.onResolve({filter:/^(server-only|\.\/db)$/},a=>({path:a.path,namespace:'stub'}));
 b.onLoad({filter:/.*/,namespace:'stub'},a=>({loader:'js',contents:a.path==='server-only'?'':`export const isDemo=()=>false;export const isEditorialPreview=()=>false;export const publicDb=()=>globalThis.__archiveDb;export const checked=r=>{if(r.error)throw Error(r.error.message);return r.data;};`}));
 }}]});
 const today=radarDate(),next=new Date(new Date(today+'T12:00:00Z').getTime()+86400000).toISOString().slice(0,10);
 const base=edition.articles[0] as Article;
 const rows=[{...base,id:'today',status:'published',radar_date:today},{...base,id:'future',status:'published',radar_date:next},{...base,id:'draft',status:'draft',radar_date:today},{...base,id:'permanent',status:'published',radar_date:'2000-01-01'}];
 (globalThis as any).__archiveDb={from(){let predicates:((r:any)=>boolean)[]=[];const q:any={select(){return q},eq(k:string,v:string){predicates.push(r=>r[k]===v);return q},lt(k:string,v:string){predicates.push(r=>r[k]<v);return q},lte(k:string,v:string){predicates.push(r=>r[k]<=v);return q},order(){return q},limit(){return q},then(resolve:any,reject:any){return Promise.resolve({data:rows.filter(r=>predicates.every(f=>f(r))),error:null}).then(resolve,reject);}};return q;}};
 const data=createRequire(import.meta.url)(output),groups=await data.archiveEditions();
 assert.ok(groups.some((g:any)=>g.date===today&&g.articles.some((a:any)=>a.id==='today')));
 assert.ok(!groups.some((g:any)=>g.articles.some((a:any)=>a.id==='future'||a.id==='draft')));
 const old=await data.archiveEditions('2000-01-01');assert.deepEqual(old.map((g:any)=>g.date),['2000-01-01']);assert.equal(old[0].articles[0].id,'permanent');assert.deepEqual(await data.archiveEditions(next),[]);
 }finally{delete (globalThis as any).__archiveDb;await rm(dir,{recursive:true,force:true});}
});
