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
 assert.ok(!body.html.includes('<script>'));assert.equal((body.text.match(/https:\/\/radar.example\/arquivo#article-/g)||[]).length,3);
 assert.ok(body.text.includes('Cancelar inscrição'));assert.throws(()=>dailyEmail('date',stories.slice(1),null,'https://radar.example','cancel'));
 assert.throws(()=>dailyEmail('date',stories,null,'http://radar.example','cancel'));
});
test('daily database: private subscribers, cooldown, reconfirmation, consent and unique deliveries',async()=>{
 const db=new PGlite();try{
 await db.exec('create role anon;create role authenticated;create role service_role bypassrls;');
 await db.exec(await readFile(new URL('../supabase/migrations/018_daily_subscribers.sql',import.meta.url),'utf8'));
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
