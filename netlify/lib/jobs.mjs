import {timingSafeEqual} from 'node:crypto';

const jobs = new Set(['daily', 'daily-email', 'billing-email', 'weekly', 'instagram']);

function settings() {
  const secret = process.env.CRON_SECRET;
  const origin = new URL(process.env.URL || '');
  if (!secret || secret.length < 32 || origin.protocol !== 'https:') {
    throw new Error('Netlify job configuration unavailable');
  }
  return {secret, origin: origin.origin};
}

// Scheduled functions return quickly; the authenticated background worker waits
// for the existing Next route, whose own lock and feature gates remain in force.
export async function dispatch(job) {
  if (!jobs.has(job)) throw new Error('Unknown job');
  // Keep the dormant schedule from creating background work before launch.
  // The delivery route independently checks the same flags before sending.
  if (job === 'daily-email' && (process.env.DEMO_MODE === 'true' || process.env.EMAIL_SEND_ENABLED !== 'true' || process.env.DAILY_EMAIL_SEND_ENABLED !== 'true')) {
    return new Response(null, {status: 204});
  }
  if (job === 'billing-email' && (process.env.DEMO_MODE === 'true' || process.env.EMAIL_SEND_ENABLED !== 'true' || process.env.BILLING_EMAIL_SEND_ENABLED !== 'true')) return new Response(null, {status: 204});
  const {secret, origin} = settings();
  const response = await fetch(`${origin}/.netlify/functions/radar-job-background`, {
    method: 'POST', headers: {authorization: `Bearer ${secret}`, 'content-type': 'application/json'},
    body: JSON.stringify({job}), redirect: 'error', signal: AbortSignal.timeout(15000),
  });
  if (response.status !== 202) throw new Error(`Job dispatch failed (${response.status})`);
  return new Response(null, {status: 204});
}

export async function runBackground(req) {
  if (req.method !== 'POST') throw new Error('Invalid job method');
  const {secret, origin} = settings();
  const supplied = Buffer.from(req.headers.get('authorization') || '');
  const expected = Buffer.from(`Bearer ${secret}`);
  if (supplied.length !== expected.length || !timingSafeEqual(supplied, expected)) {
    throw new Error('Unauthorized job');
  }
  const {job} = await req.json();
  if (!jobs.has(job)) throw new Error('Unknown job');
  const response = await fetch(`${origin}/api/jobs/${job}`, {
    headers: {authorization: `Bearer ${secret}`}, redirect: 'error', signal: AbortSignal.timeout(65000),
  });
  if (!response.ok) throw new Error(`Job execution failed (${response.status})`);
}
