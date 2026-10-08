import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile,readdir} from 'node:fs/promises';
import {PGlite} from '@electric-sql/pglite';
import {editionOutcome,SEARCH_STAGES,retryDelay} from '../lib/daily-run-core';
import {editorialDecision} from '../lib/editorial';

test('conclusão exige exatamente três publicações confirmadas em cada canal',()=>{
 for(let portal=0;portal<5;portal++)for(let instagram=0;instagram<5;instagram++){
  assert.equal(editionOutcome(portal,instagram,2).status==='completed',portal===3&&instagram===3);
 }
 assert.equal(editionOutcome(4,3,3).status,'blocked');
 assert.equal(editionOutcome(3,2,2,'instagram_pending').reason,'instagram_pending');
 assert.equal(editionOutcome(1,0,0,'news_daily_budget_exhausted').status,'pending');
 assert.deepEqual(SEARCH_STAGES.map(s=>s.days),[1,3,7,14]);
 assert.ok(retryDelay(2)>retryDelay(1));assert.ok(retryDelay(100)<=300000);
});
test('rejeição editorial e evidência ausente continuam impedindo publicação',()=>{
 const evidence='Uma reportagem documentou como a equipe mudou suas tarefas após avaliar a ferramenta.';
 const output={title:'Título',summary:('Um parágrafo com conteúdo suficiente para passar a validação editorial.\n\n').repeat(3).trim(),brazil_impact:'Uma reflexão fundamentada para as empresas brasileiras sobre a decisão discutida no material. '.repeat(2),category:'Business' as const,sectors:['Retail' as const],publish:false,human_angle:evidence,perspective_evidence:evidence,business_relevance:90,reader_interest:90,launch_importance:0};
 assert.equal(editorialDecision(output,'press',evidence).publish,false);
 assert.equal(editorialDecision({...output,publish:true},'press','Trecho sem evidência').publish,false);
 assert.equal(editorialDecision({...output,publish:true},'primary',evidence).publish,false);
});
test('banco bloqueia quarta notícia, preserva reexecução e isola edição/cota',async()=>{
 const db=new PGlite();
 try{
 await db.exec(`create role anon;create role authenticated;create role service_role bypassrls;create schema auth;create table auth.users(id uuid primary key);create function auth.uid() returns uuid language sql stable as $$select null::uuid$$;create schema storage;create table storage.buckets(id text primary key,name text,public boolean,file_size_limit bigint,allowed_mime_types text[]);create table storage.objects(id uuid primary key default gen_random_uuid(),bucket_id text,name text);alter table storage.objects enable row level security;`);
 for(const name of (await readdir(new URL('../supabase/migrations/',import.meta.url))).sort())await db.exec((await readFile(new URL('../supabase/migrations/'+name,import.meta.url),'utf8')).replace('create extension if not exists pgcrypto;',''));
 await db.exec(`insert into sources(id,name,url,kind) values('test','Fonte','https://example.com','press');`);
 const insert=async(n:number,date='2026-10-06')=>db.query(`insert into articles(source_id,source_name,source_url,title,title_key,excerpt,published_at,status,radar_date,human_angle,perspective_attribution,perspective_evidence) values('test','Fonte',$1,'Título',$2,$3,now(),'published',$4,$3,'Fonte',$3) returning id`,[`https://example.com/${n}`,`key-${n}`,'Trecho de evidência com mais de trinta caracteres para o teste.',date]);
 for(let n=1;n<=3;n++)await insert(n);
 await assert.rejects(insert(4),/radar_daily_capacity_reached/);
 await db.exec(`update articles set summary='Correção sem republicação' where title_key='key-1'`);
 assert.equal((await db.query(`select id from articles where status='published' and radar_date='2026-10-06'`)).rows.length,3);
 await db.exec(`insert into radar_editions(radar_date) values('2026-10-06');`);
 await assert.rejects(db.exec(`update radar_editions set status='completed' where radar_date='2026-10-06'`),/publication_images_missing/);
 await db.exec(`update articles set cover_url='https://example.com/art.jpg' where title_key in ('key-1','key-2');`);
 await assert.rejects(db.exec(`update radar_editions set status='completed' where radar_date='2026-10-06'`),/publication_instagram_missing/);
 await db.exec(`insert into instagram_posts(article_id,account_id,radar_date,slot,title,caption,source_name,status,image_url)
 select id,'123',radar_date,row_number() over(order by title_key),'Título','Legenda','Fonte','published','https://example.com/post.jpg' from articles where radar_date='2026-10-06';`);
 await db.exec(`update radar_editions set status='completed' where radar_date='2026-10-06';`);
 await assert.rejects(db.exec(`update instagram_posts set image_url=null where slot=1`),/instagram_requires_art/);
 await insert(5,'2026-10-07');
 await assert.rejects(db.exec(`update articles set radar_date='2026-10-06' where title_key='key-5'`),/radar_daily_capacity_reached/);
 for(let n=0;n<40;n++)assert.equal((await db.query<{ok:boolean}>('select reserve_news_call() as ok')).rows[0].ok,true);
 assert.equal((await db.query<{ok:boolean}>('select reserve_news_call() as ok')).rows[0].ok,false);
 assert.equal((await db.query<{ok:boolean}>('select reserve_ai_call() as ok')).rows[0].ok,true);
 await db.exec(`set role anon`);await assert.rejects(db.exec('select * from radar_editions'));await assert.rejects(db.exec('select reserve_news_call()'));await db.exec('reset role');
 }finally{await db.close();}
});

test('duas artes são obrigatórias mesmo com Instagram completo',()=>{
 for(let covers=0;covers<=3;covers++)assert.equal(editionOutcome(3,3,covers).status==='completed',covers>=2);
 assert.equal(editionOutcome(3,3,1).reason,'publication_images_missing');
});
