import test from 'node:test';import assert from 'node:assert/strict';
import {mediaFileError,mediaInput,ownsMediaPath} from '../lib/partner-media';
const user='11111111-1111-4111-8111-111111111111';
const slide={path:`${user}/0`,kind:'image',caption:'Como podemos ajudar'};
test('vitrine aceita slides e um vídeo de capa, com limite de seis materiais',()=>{
 assert.equal(mediaInput.safeParse([{...slide,kind:'video'},{...slide,path:`${user}/1`}]).success,true);
 for(const input of [[slide,slide],[slide,{...slide,path:`${user}/1`,kind:'video'}],[{...slide,kind:'video'},{...slide,path:`${user}/1`,kind:'video'}],[{...slide,caption:''}],Array.from({length:7},(_,n)=>({...slide,path:`${user}/${n}`}))])assert.equal(mediaInput.safeParse(input).success,false);
 assert.equal(mediaInput.safeParse([]).success,true);
});
test('envio limita tamanho e tipos de arquivo sem aceitar apresentações executáveis',()=>{
 assert.equal(mediaFileError('image/jpeg',5*1024*1024),null);
 assert.equal(mediaFileError('video/mp4',40*1024*1024),null);
 for(const [type,size] of [['image/svg+xml',100],['text/html',100],['application/pdf',100],['image/png',0],['image/png',5*1024*1024+1],['video/webm',40*1024*1024+1]] as const)assert.ok(mediaFileError(type,size));
});
test('cada parceiro só pode salvar caminhos dos próprios seis slots',()=>{
 assert.equal(ownsMediaPath(`${user}/5`,user),true);
 for(const path of [`${user}/6`,`${user}/0/extra`,`${user}/../0`,'outro/0',`https://example.com/${user}/0`])assert.equal(ownsMediaPath(path,user),false);
});
