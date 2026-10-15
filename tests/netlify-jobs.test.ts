import test from 'node:test';
import assert from 'node:assert/strict';
import {dispatch, runBackground} from '../netlify/lib/jobs.mjs';

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
