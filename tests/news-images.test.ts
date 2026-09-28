import test from 'node:test';import assert from 'node:assert/strict';import {feedCover,pageCover} from '../lib/news-images';
test('capa aceita anexos de imagem e mantém crédito fornecido pela fonte',()=>{
 assert.deepEqual(feedCover({enclosure:{url:'https://images.example.com/cover.jpg',type:'image/jpeg'}}),{cover_url:'https://images.example.com/cover.jpg',cover_credit:null,cover_caption:null});
 assert.equal(feedCover({mediaContent:[{$:{url:'https://images.example.com/a.png',medium:'image'},'media:credit':['Fotógrafa / Agência']}]}).cover_credit,'Fotógrafa / Agência');
});
test('capa não usa anexos de áudio, URLs locais ou protocolos inseguros',()=>{
 for(const url of ['http://example.com/image.jpg','https://127.0.0.1/image.jpg','https://192.168.1.1/a','javascript:alert(1)'])assert.deepEqual(feedCover({enclosure:{url,type:'image/jpeg'}}),{});
 assert.deepEqual(feedCover({enclosure:{url:'https://example.com/a.mp3',type:'audio/mpeg'}}),{});
});
test('capa aceita media:thumbnail quando o feed não traz media:content',()=>{
 assert.equal(feedCover({mediaThumbnail:[{$:{url:'https://images.example.com/thumb.jpg'}}]}).cover_url,'https://images.example.com/thumb.jpg');
});
test('capa recupera og:image e legenda da reportagem',async()=>{
 const html='<html><head><meta property="og:image" content="https://cdn.example.com/capa.jpg?x=1&amp;y=2"><meta property="og:image:alt" content="Executiva apresenta produto"></head></html>';
 const fetcher=async()=>new Response(html,{status:200,headers:{'content-type':'text/html'}});
 const cover=await pageCover('https://news.example.com/materia',['news.example.com'],fetcher as typeof fetch);
 assert.deepEqual(cover,{cover_url:'https://cdn.example.com/capa.jpg?x=1&y=2',cover_caption:'Executiva apresenta produto',cover_credit:null});
});
test('capa da página recusa fonte fora da lista permitida',async()=>{
 let called=false;const fetcher=async()=>{called=true;return new Response('');};
 assert.deepEqual(await pageCover('https://evil.example/materia',['news.example.com'],fetcher as typeof fetch),{});assert.equal(called,false);
});
