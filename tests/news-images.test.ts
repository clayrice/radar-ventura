import test from 'node:test';import assert from 'node:assert/strict';import {feedCover} from '../lib/news-images';
test('capa aceita anexos de imagem e mantém crédito fornecido pela fonte',()=>{
 assert.deepEqual(feedCover({enclosure:{url:'https://images.example.com/cover.jpg',type:'image/jpeg'}}),{cover_url:'https://images.example.com/cover.jpg',cover_credit:null,cover_caption:null});
 assert.equal(feedCover({mediaContent:[{$:{url:'https://images.example.com/a.png',medium:'image'},'media:credit':['Fotógrafa / Agência']}]}).cover_credit,'Fotógrafa / Agência');
});
test('capa não usa anexos de áudio, URLs locais ou protocolos inseguros',()=>{
 for(const url of ['http://example.com/image.jpg','https://127.0.0.1/image.jpg','https://192.168.1.1/a','javascript:alert(1)'])assert.deepEqual(feedCover({enclosure:{url,type:'image/jpeg'}}),{});
 assert.deepEqual(feedCover({enclosure:{url:'https://example.com/a.mp3',type:'audio/mpeg'}}),{});
});
