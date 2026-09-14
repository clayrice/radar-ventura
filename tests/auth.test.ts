import test from 'node:test';
import assert from 'node:assert/strict';
import {authDestination,authCallbackUrl,loginPath} from '../lib/auth-navigation';
test('login preserva destinos de parceiro e assinante inclusive após falha',()=>{
 for(const next of ['/account/parceiro','/account/profile']){
  assert.equal(new URL(authCallbackUrl('https://ventura.example',next)).searchParams.get('next'),next);
  assert.equal(new URL(loginPath(next,'access'),'https://ventura.example').searchParams.get('next'),next);
 }
});
test('login rejeita redirecionamentos externos e caminhos não autorizados',()=>{
 for(const value of ['https://evil.example','//evil.example','/\\evil.example','/%2f%2fevil.example','/account/../api/jobs/daily','/account?next=https://evil.example',null,['/account/parceiro']])assert.equal(authDestination(value),'/account');
});
