import test from 'node:test';
import assert from 'node:assert/strict';
import {build} from 'esbuild';
import {mkdtemp,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createRequire} from 'node:module';

// Provider boundaries are stubbed; the production search, validation and persistence flow runs.
type Row=Record<string,any>;
function database(initial:Row[]){
 const tables:Record<string,Row[]>={articles:initial,sources:[],radar_candidates:[]};
 return {tables,from(table:string){
  let filters:((r:Row)=>boolean)[]=[],limit=Infinity,action='select',payload:any,options:any={};
  const q:any={select(_?:string,o?:any){options=o||{};return q;},eq(k:string,v:any){filters.push(r=>r[k]===v);return q;},in(k:string,v:any[]){filters.push(r=>v.includes(r[k]));return q;},lt(k:string,v:any){filters.push(r=>r[k]<v);return q;},lte(k:string,v:any){filters.push(r=>r[k]<=v);return q;},gte(k:string,v:any){filters.push(r=>r[k]>=v);return q;},order(){return q;},limit(n:number){limit=n;return q;},update(p:any){action='update';payload=p;return q;},upsert(p:any){action='upsert';payload=p;return q;},then(resolve:any,reject:any){
   try{let rows=tables[table].filter(r=>filters.every(f=>f(r))).slice(0,limit);
    if(action==='update')for(const r of rows)Object.assign(r,payload);
    if(action==='upsert')for(const r of payload){if(!tables[table].some(x=>x.radar_date===r.radar_date&&x.article_id===r.article_id))tables[table].push(r);}
    return Promise.resolve({data:options.head?null:structuredClone(rows),count:rows.length,error:null}).then(resolve,reject);
   }catch(e){return Promise.reject(e).then(resolve,reject);}
  }};return q;
 }};
}
const evidence='Uma reportagem independente documentou como a equipe mudou suas tarefas após avaliar a ferramenta.';
const good={title:'Uma mudança documentada',summary:('Uma reportagem apresenta fatos verificáveis e contexto suficiente sobre a decisão da empresa.\n\n').repeat(3).trim(),brazil_impact:'O empreendedor brasileiro pode usar esse exemplo como ponto de partida para avaliar uma tarefa específica da equipe.',category:'Business',sectors:['Retail'],publish:true,human_angle:evidence,perspective_evidence:evidence,business_relevance:80,reader_interest:80,launch_importance:0};
const article=(id:string,days:number,status='queued'):Row=>({id,title:id,source_id:id,source_kind:'press',source_name:'Fonte',excerpt:evidence,attempts:0,status,published_at:new Date(Date.now()-days*86400000).toISOString(),next_attempt_at:new Date(0).toISOString()});

test('pipeline real amplia busca, exclui rejeição/erro, retoma sem publicar quarto item',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'radar-flow-'));const bundle=join(dir,'flow.cjs');
 try{
 await build({entryPoints:[new URL('../lib/daily-radar.ts',import.meta.url).pathname],outfile:bundle,bundle:true,platform:'node',format:'cjs',logLevel:'silent',plugins:[{name:'provider-boundaries',setup(b){
  b.onResolve({filter:/^(server-only|\.\/db|\.\/ai)$/},args=>({path:args.path,namespace:'test-provider'}));
  b.onLoad({filter:/.*/,namespace:'test-provider'},args=>({contents:args.path==='server-only'?'':args.path==='./db'?`export const adminDb=()=>{};export const checked=r=>{if(r.error)throw new Error(r.error.message);return r.data;};`:`export const generate=async(_schema,_name,_instructions,input)=>globalThis.__radarGenerate(input);`,loader:'js'}));
 }}]});
 const flow=createRequire(import.meta.url)(bundle);
 const calls:string[]=[];
 (globalThis as any).__radarGenerate=async(input:Row)=>{calls.push(input.title);if(input.title==='failed')throw new Error('provider timeout');return {...good,publish:input.title!=='rejected'};};
 const db=database([article('recent',0.1),article('rejected',0.2),article('failed',0.3),article('older',2),article('oldest',6),article('spare',8)]);
 const progress:Row[]=[];const date='2026-10-06';
 const outcome=await flow.fillRadar(db,date,0,Date.now()+200000,async(m:Row)=>progress.push(m));
 assert.equal(outcome.reason,'portal_target_reached');
 assert.equal(db.tables.articles.filter(r=>r.status==='published').length,3);
 assert.equal(db.tables.articles.find(r=>r.id==='rejected')!.status,'rejected');
 assert.equal(db.tables.articles.find(r=>r.id==='failed')!.status,'queued');
 assert.ok(progress.some(r=>r.search_stage>=2));
 assert.ok(!calls.includes('spare'));
 const counts=await flow.radarCounts(db,date);assert.equal(counts.rejected,1);assert.equal(counts.errors,1);assert.equal(counts.published,3);
 const before=calls.length;
 await flow.fillRadar(db,date,outcome.stage,Date.now()+200000,async()=>{});
 assert.equal(calls.length,before);assert.equal(db.tables.articles.filter(r=>r.status==='published').length,3);
 // A time budget interruption never pretends the target was met.
 const short=database([article('waiting',0.1)]);
 const interrupted=await flow.fillRadar(short,date,0,Date.now()+1000,async()=>{});
 assert.equal(interrupted.reason,'time_budget_exhausted');assert.equal(await flow.portalCount(short,date),0);
 }finally{delete (globalThis as any).__radarGenerate;await rm(dir,{recursive:true,force:true});}
});
