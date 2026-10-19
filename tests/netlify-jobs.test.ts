import test from 'node:test';
import assert from 'node:assert/strict';
import {dispatch, runBackground} from '../netlify/lib/jobs.mjs';
import dailyEmailSchedule from '../netlify/functions/radar-daily-email.mjs';

test('daily email schedule stays dormant until both delivery gates are enabled', async () => {
  const keys=['EMAIL_SEND_ENABLED','DAILY_EMAIL_SEND_ENABLED','DEMO_MODE','CRON_SECRET','URL'] as const;
  const before=Object.fromEntries(keys.map(key=>[key,process.env[key]]));
  const originalFetch=globalThis.fetch;
  const requests: string[]=[];
  try {
    process.env.CRON_SECRET='s'.repeat(32);
    process.env.URL='https://radar-test.netlify.app';
    globalThis.fetch=(async (url)=>{requests.push(String(url));return new Response(null,{status:202});}) as typeof fetch;
    for(const [email,daily,demo] of [['true','false','false'],['false','true','false'],['true','true','true'],['true','','false']]) {
      process.env.EMAIL_SEND_ENABLED=email;process.env.DAILY_EMAIL_SEND_ENABLED=daily;process.env.DEMO_MODE=demo;
      assert.equal((await dailyEmailSchedule()).status,204);
    }
    assert.equal(requests.length,0);
    process.env.EMAIL_SEND_ENABLED='true';process.env.DAILY_EMAIL_SEND_ENABLED='true';process.env.DEMO_MODE='false';
    assert.equal((await dailyEmailSchedule()).status,204);
    assert.deepEqual(requests,['https://radar-test.netlify.app/.netlify/functions/radar-job-background']);
    globalThis.fetch=(async (url)=>{requests.push(String(url));return new Response(null,{status:200});}) as typeof fetch;
    await runBackground(new Request('https://radar-test.netlify.app/.netlify/functions/radar-job-background',{
      method:'POST',headers:{authorization:`Bearer ${process.env.CRON_SECRET}`,'content-type':'application/json'},body:JSON.stringify({job:'daily-email'}),
    }));
    assert.equal(requests.at(-1),'https://radar-test.netlify.app/api/jobs/daily-email');
  } finally {
    globalThis.fetch=originalFetch;
    for(const key of keys){if(before[key]===undefined)delete process.env[key];else process.env[key]=before[key];}
  }
});

test('Netlify jobs authenticate, restrict destinations and preserve failed executions', async () => {
  const before = {secret: process.env.CRON_SECRET, url: process.env.URL, fetch: globalThis.fetch};
  const requests: string[] = [];
  try {
    process.env.CRON_SECRET = 's'.repeat(32);
    process.env.URL = 'https://radar-test.netlify.app';
    globalThis.fetch = (async (url, options) => {
      requests.push(String(url));
      assert.equal(new Headers(options?.headers).get('authorization'), `Bearer ${process.env.CRON_SECRET}`);
      return new Response(null, {status: String(url).includes('/.netlify/') ? 202 : 200});
    }) as typeof fetch;
    const request = (job: string, token = process.env.CRON_SECRET) => new Request('https://radar-test.netlify.app/.netlify/functions/radar-job-background', {
      method: 'POST', headers: {authorization: `Bearer ${token}`, 'content-type': 'application/json'}, body: JSON.stringify({job}),
    });
    await assert.rejects(runBackground(request('weekly', 'wrong')), /Unauthorized/);
    await assert.rejects(runBackground(request('https://attacker.example')), /Unknown job/);
    assert.equal(requests.length, 0);
    assert.equal((await dispatch('weekly')).status, 204);
    await runBackground(request('weekly'));
    assert.deepEqual(requests, ['https://radar-test.netlify.app/.netlify/functions/radar-job-background', 'https://radar-test.netlify.app/api/jobs/weekly']);
    globalThis.fetch = (async () => new Response(null, {status: 500})) as typeof fetch;
    await assert.rejects(runBackground(request('daily')), /execution failed/);
    await assert.rejects(dispatch('daily'), /dispatch failed/);
    process.env.URL = 'http://radar-test.netlify.app';
    await assert.rejects(dispatch('weekly'), /configuration unavailable/);
  } finally {
    globalThis.fetch = before.fetch;
    if (before.secret === undefined) delete process.env.CRON_SECRET; else process.env.CRON_SECRET = before.secret;
    if (before.url === undefined) delete process.env.URL; else process.env.URL = before.url;
  }
});
