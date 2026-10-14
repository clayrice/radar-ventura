import test from 'node:test';
import assert from 'node:assert/strict';
import {billingEnabled} from '../lib/billing-config';
test('ativação semanal exige configuração completa e não libera outros produtos',()=>{
 const keys=['BILLING_ENABLED','BILLING_PRODUCTS','ASAAS_API_KEY','ASAAS_ENV','ASAAS_WEBHOOK_TOKEN','APP_URL'];
 const previous=Object.fromEntries(keys.map(k=>[k,process.env[k]]));
 try{
 Object.assign(process.env,{BILLING_ENABLED:'true',BILLING_PRODUCTS:'weekly',ASAAS_API_KEY:'fake-test',ASAAS_ENV:'production',ASAAS_WEBHOOK_TOKEN:'x'.repeat(32),APP_URL:'https://radar.example'});
 assert.equal(billingEnabled('weekly'),true);assert.equal(billingEnabled(),true);
 for(const p of ['roadmap','catalog','connections','strategic','unknown'])assert.equal(billingEnabled(p),false);
 for(const k of keys){const value=process.env[k];delete process.env[k];assert.equal(billingEnabled('weekly'),false,k);process.env[k]=value;}
 process.env.ASAAS_ENV='invalid';assert.equal(billingEnabled('weekly'),false);
 process.env.ASAAS_ENV='sandbox';assert.equal(billingEnabled('weekly'),true);
 process.env.BILLING_ENABLED='false';assert.equal(billingEnabled('weekly'),false);
 }finally{for(const k of keys){if(previous[k]===undefined)delete process.env[k];else process.env[k]=previous[k];}}
});
