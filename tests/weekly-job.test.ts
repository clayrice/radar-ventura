import test from 'node:test';import assert from 'node:assert/strict';
import {build} from 'esbuild';import {mkdtemp,rm} from 'node:fs/promises';import {tmpdir} from 'node:os';import {join} from 'node:path';import {createRequire} from 'node:module';
test('rotina semanal recusa chamadas públicas e exige segredo configurado antes de executar',async()=>{
 const dir=await mkdtemp(join(tmpdir(),'weekly-job-')),before=process.env.CRON_SECRET;
 try{
 const bundle=join(dir,'route.cjs');await build({entryPoints:[new URL('../app/api/jobs/weekly/route.ts',import.meta.url).pathname],outfile:bundle,bundle:true,platform:'node',format:'cjs',plugins:[{name:'job',setup(b){b.onResolve({filter:/^@\/lib\/jobs$/},()=>({path:'jobs',namespace:'test'}));b.onLoad({filter:/.*/,namespace:'test'},()=>({contents:'export async function runWeekly(){globalThis.weeklyExecutions=(globalThis.weeklyExecutions||0)+1;return {status:"completed",generated:1,sent:1}}',loader:'js'}));}}]});
 const {GET}=createRequire(import.meta.url)(bundle);const state=globalThis as typeof globalThis&{weeklyExecutions?:number};state.weeklyExecutions=0;
 delete process.env.CRON_SECRET;assert.equal((await GET(new Request('https://radar.example/api/jobs/weekly'))).status,503);
 process.env.CRON_SECRET='x'.repeat(32);
 for(const authorization of ['', 'Bearer wrong'])assert.equal((await GET(new Request('https://radar.example/api/jobs/weekly',{headers:{authorization}}))).status,401);
 assert.equal(state.weeklyExecutions,0);
 const r=await GET(new Request('https://radar.example/api/jobs/weekly',{headers:{authorization:`Bearer ${process.env.CRON_SECRET}`}}));assert.equal(r.status,200);assert.equal(state.weeklyExecutions,1);
 }finally{if(before===undefined)delete process.env.CRON_SECRET;else process.env.CRON_SECRET=before;await rm(dir,{recursive:true,force:true});}
});
