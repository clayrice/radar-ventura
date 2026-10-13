import test from 'node:test';
import assert from 'node:assert/strict';
import {dailyToken,validDailyToken,dailyEmail} from '../lib/daily-email-core';
import {PGlite} from '@electric-sql/pglite';
import {readFile} from 'node:fs/promises';
const secret='a'.repeat(32),id='subscriber',nonce='nonce';
test('daily confirmation and unsubscribe tokens cannot be forged, interchanged or reused after nonce rotation',()=>{
 const token=dailyToken('confirm',id,nonce,secret);
 assert.ok(validDailyToken('confirm',id,nonce,token,secret));
 assert.equal(validDailyToken('unsubscribe',id,nonce,token,secret),false);
 assert.equal(validDailyToken('confirm',id,'rotated',token,secret),false);
 assert.equal(validDailyToken('confirm','other',nonce,token,secret),false);
 assert.equal(validDailyToken('confirm',id,nonce,'invalid',secret),false);
 assert.throws(()=>dailyToken('confirm',id,nonce,'short'));
});
test('daily email requires three stories and links to the website with escaped content',()=>{
 const stories=Array.from({length:3},(_,i)=>({id:String(i),title:'<script>alert(1)</script>',summary:'Resumo',source_name:'Fonte',source_url:'https://source.example/a',published_at:'2026-10-09',category:'Business',sectors:[]}));
 const body=dailyEmail('2026-10-09',stories,null,'https://radar.example','https://radar.example/cancel');
 assert.ok(!body.html.includes('<script>'));assert.equal((body.text.match(/https:\/\/radar.example\/arquivo\?edicao=2026-10-09#article-/g)||[]).length,3);
 assert.ok(body.text.includes('Cancelar inscrição'));assert.throws(()=>dailyEmail('date',stories.slice(1),null,'https://radar.example','cancel'));
 assert.throws(()=>dailyEmail('date',stories,null,'http://radar.example','cancel'));
});
test('daily database: private subscribers, cooldown, reconfirmation, consent and unique deliveries',async()=>{
 const db=new PGlite();try{
 await db.exec('create role anon;create role authenticated;create role service_role bypassrls;');
 await db.exec(await readFile(new URL('../supabase/migrations/020_daily_subscribers.sql',import.meta.url),'utf8'));
 const first=(await db.query<any>("select * from request_daily_signup('test@example.com')")).rows[0];assert.equal(first.status,'pending');assert.ok(first.consent_at);
 assert.equal((await db.query("select * from request_daily_signup('test@example.com')")).rows.length,0);
 await db.exec("update daily_subscribers set requested_at=now()-interval '11 minutes',status='unsubscribed'");
 const again=(await db.query<any>("select * from request_daily_signup('test@example.com')")).rows[0];assert.notEqual(again.nonce,first.nonce);assert.equal(again.status,'pending');
 await db.exec("update daily_subscribers set status='active',requested_at=now()-interval '11 minutes'");
 assert.equal((await db.query("select * from request_daily_signup('test@example.com')")).rows.length,0);
 await db.exec(`insert into daily_deliveries(subscriber_id,radar_date,payload) values('${first.id}','2026-10-09','{}')`);
 await assert.rejects(db.exec(`insert into daily_deliveries(subscriber_id,radar_date,payload) values('${first.id}','2026-10-09','{}')`));
 await db.exec('set role anon');await assert.rejects(db.query('select * from daily_subscribers'));await assert.rejects(db.query("select * from request_daily_signup('bad@example.com')"));
 }finally{await db.close();}
});


test('edição por e-mail mantém todos os parágrafos, imagens, créditos, leitura brasileira e ordem do site',()=>{
 const articles=[
 {id:'business',title:'Negócio',summary:'Primeiro parágrafo.\n\nSegundo parágrafo completo.',brazil_impact:'Aplicação na empresa brasileira.',source_name:'Jornal A',source_url:'https://source.example/a',cover_url:'https://source.example/photo.png',cover_caption:'Foto da reportagem.',cover_credit:'Autora / Jornal A',published_at:'2026-10-09',category:'Business',sectors:[]},
 {id:'launch',title:'ChatGPT ganha novos recursos',summary:'Todos os detalhes do lançamento.\n\nLimites e contexto.',brazil_impact:'Teste com sua equipe.',source_name:'Jornal B',source_url:'https://source.example/b',published_at:'2026-10-09',category:'Big launches',sectors:[]},
 {id:'guide',title:'Guia',summary:'Método publicado.',brazil_impact:'Cuidados antes de começar.',source_name:'Jornal C',source_url:'https://source.example/c',published_at:'2026-10-09',category:'Guides',sectors:[]}
 ];
 const body=dailyEmail('2026-10-09',articles,null,'https://radar.example','https://radar.example/cancel');
 for(const a of articles){assert.ok(body.text.includes(a.summary));assert.ok(body.text.includes(a.brazil_impact));assert.ok(body.html.includes(a.brazil_impact));assert.ok(body.text.includes(a.source_url));}
 assert.ok(body.html.includes('Segundo parágrafo completo.'));assert.ok(body.html.includes('Limites e contexto.'));
 assert.ok(body.html.includes('src="https://source.example/photo.png"'));assert.ok(body.html.includes('Autora / Jornal A'));assert.ok(body.html.includes('Foto da reportagem.'));
 assert.ok(body.text.indexOf('ChatGPT ganha')<body.text.indexOf('Negócio'));
 assert.ok(body.text.includes('/arquivo?edicao=2026-10-09#edition-2026-10-09'));
 assert.ok(!body.html.includes('IA com <em'));assert.ok(!body.html.includes('linear-gradient'));
});
