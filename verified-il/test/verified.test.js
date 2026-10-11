import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { createPublicKey, generateKeyPairSync } from 'node:crypto';
import { createHandler } from '../api/v1.js';
import { checkCancellation, checkSpam, verifySigned, canonical } from '../lib/core.js';
import { createFreeTier } from '../lib/x402.js';

const keys = generateKeyPairSync('ed25519');
const res = () => ({ headers: {}, setHeader(k, v) { this.headers[k] = v; }, status(c) { this.statusCode = c; return this; }, json(o) { this.body = o; return this; } });
const call = async (h, { method = 'GET', query = {}, body, headers = {} } = {}) => { const r = res(); await h({ method, query, body, headers }, r); return r; };
const TODAY = '2026-10-11';

describe('catalog and signed answers', () => {
  const h = createHandler({ env: {}, keys });

  test('catalog lists rules, prices and the public key; nothing is marked verified yet', async () => {
    const r = await call(h, { query: { tool: 'catalog' } });
    assert.equal(r.body.rules.length, 5);
    assert.ok(r.body.rules.every((x) => x.verified === false));
    assert.equal(r.body.prices.spam.usd, 0.1);
    assert.match(r.body.publicKey, /BEGIN PUBLIC KEY/);
  });

  test('answers are signed; the signature verifies and breaks on tampering', async () => {
    const cat = await call(h, { query: { tool: 'catalog' } });
    const pub = createPublicKey(cat.body.publicKey);
    const r = await call(h, { query: { tool: 'answer', id: 'il.comm.spam.30a', lang: 'en' } });
    assert.equal(r.statusCode, 200);
    assert.equal(r.body.body.verified, false);
    assert.match(r.body.body.answer, /₪1,000 per message/);
    assert.equal(r.body.keyId, cat.body.keyId);
    assert.ok(verifySigned(r.body, pub));
    const forged = { ...r.body, body: { ...r.body.body, verified: true } };
    assert.equal(verifySigned(forged, pub), false);
  });

  test('canonical JSON is key-order independent', () => {
    assert.equal(canonical({ b: 1, a: [2, { d: 1, c: 2 }] }), canonical({ a: [2, { c: 2, d: 1 }], b: 1 }));
  });

  test('unknown rule and unknown tool: 404', async () => {
    assert.equal((await call(h, { query: { tool: 'answer', id: 'nope' } })).statusCode, 404);
    assert.equal((await call(h, { query: { tool: 'lawsuit' } })).statusCode, 404);
  });
});

describe('cancellation calculator', () => {
  test('online, delivered 5 days ago: eligible, deadline in 9 days', () => {
    const r = checkCancellation({ channel: 'online', date: '2026-10-06', today: TODAY, priceIls: 650 });
    assert.equal(r.eligible, true);
    assert.equal(r.deadline, '2026-10-20');
    assert.equal(r.daysLeft, 9);
    assert.equal(r.maxFeeIls, 32.5);
  });
  test('store: too late, too cheap, used or excluded → not eligible, with reasons', () => {
    assert.equal(checkCancellation({ channel: 'store', date: '2026-09-20', today: TODAY }).eligible, false);
    const cheap = checkCancellation({ channel: 'store', date: '2026-10-10', today: TODAY, priceIls: 40 });
    assert.equal(cheap.eligible, false);
    assert.match(cheap.reasons.join(), /above ₪50/);
    assert.equal(checkCancellation({ channel: 'store', date: '2026-10-10', today: TODAY, exception: 'food' }).eligible, false);
    assert.equal(checkCancellation({ channel: 'store', date: '2026-10-10', today: TODAY, priceIls: 3000 }).maxFeeIls, 100);
  });
  test('bad input', () => {
    assert.ok(checkCancellation({ channel: 'tv', date: TODAY }).error);
    assert.ok(checkCancellation({ channel: 'online', date: '2027-01-01', today: TODAY }).error);
  });
});

describe('spam check (same gate as Zuzei)', () => {
  const base = { channel: 'sms', customer: 'no', optout: 'no', removed: 'no', first: '2026-09-20', last: '2026-10-09', count: 4, today: TODAY };
  test('eligible stranger', () => assert.deepEqual([checkSpam(base).ok, checkSpam(base).claimCapIls], [true, 4000]));
  test('blocks the two losing patterns', () => {
    assert.equal(checkSpam({ ...base, customer: 'yes' }).code, 'customer');
    assert.equal(checkSpam({ ...base, optout: 'yes' }).code, 'optout');
    assert.equal(checkSpam({ ...base, first: '2026-06-01' }).code, 'stale');
    assert.equal(checkSpam({ ...base, customer: 'yes', removed: 'yes', removedOn: '2026-09-25' }).code, 'after_removal');
  });
});

describe('x402 payments', () => {
  const env = { X402_PAY_TO: '0x000000000000000000000000000000000000dEaD', X402_FACILITATOR_URL: 'https://facilitator.example' };
  const body = { channel: 'online', date: '2026-10-06', today: TODAY };

  test('payments off: served free with the price in a header', async () => {
    const r = await call(createHandler({ env: {}, keys }), { method: 'POST', query: { tool: 'cancellation' }, body });
    assert.equal(r.statusCode, 200);
    assert.equal(r.headers['X-Price-USD'], '0.05');
  });

  test('free tier first, then 402 with x402 v1 requirements', async () => {
    const h = createHandler({ env, keys, freeTier: createFreeTier({ perDay: 1 }) });
    const first = await call(h, { method: 'POST', query: { tool: 'cancellation' }, body, headers: { 'x-real-ip': '1.1.1.1' } });
    assert.equal(first.statusCode, 200);
    assert.equal(first.headers['X-Free-Tier'], 'true');
    const second = await call(h, { method: 'POST', query: { tool: 'cancellation' }, body, headers: { 'x-real-ip': '1.1.1.1', host: 'api.example' } });
    assert.equal(second.statusCode, 402);
    const req = second.body.accepts[0];
    assert.equal(second.body.x402Version, 1);
    assert.deepEqual([req.scheme, req.network, req.maxAmountRequired, req.payTo, req.resource], ['exact', 'base', '50000', env.X402_PAY_TO, 'https://api.example/v1/cancellation']);
  });

  test('valid payment: verified, settled, answered with X-PAYMENT-RESPONSE', async () => {
    const calls = [];
    const fetchImpl = async (url, init) => {
      calls.push(url);
      const ok = url.endsWith('/verify') ? { isValid: true } : { success: true, transaction: '0xabc', network: 'base', payer: '0xpayer' };
      return { ok: true, json: async () => ok };
    };
    const h = createHandler({ env, keys, fetchImpl, freeTier: () => false });
    const payment = Buffer.from(JSON.stringify({ x402Version: 1, scheme: 'exact', network: 'base', payload: {} })).toString('base64');
    const r = await call(h, { method: 'POST', query: { tool: 'spam' }, body: { channel: 'sms', customer: 'no', optout: 'no', removed: 'no', first: '2026-10-01', last: '2026-10-05', count: 2, today: TODAY }, headers: { 'x-payment': payment } });
    assert.equal(r.statusCode, 200);
    assert.deepEqual(calls, ['https://facilitator.example/verify', 'https://facilitator.example/settle']);
    assert.equal(JSON.parse(Buffer.from(r.headers['X-PAYMENT-RESPONSE'], 'base64')).transaction, '0xabc');
    assert.equal(r.body.body.ok, true);
  });

  test('invalid payment → 402; facilitator down → 502 and nothing charged', async () => {
    const payment = Buffer.from('{}').toString('base64');
    const bad = createHandler({ env, keys, freeTier: () => false, fetchImpl: async () => ({ ok: true, json: async () => ({ isValid: false, invalidReason: 'insufficient_funds' }) }) });
    const r1 = await call(bad, { query: { tool: 'answer', id: 'il.comm.spam.30a' }, headers: { 'x-payment': payment } });
    assert.equal(r1.statusCode, 402);
    assert.equal(r1.body.error, 'insufficient_funds');
    const down = createHandler({ env, keys, freeTier: () => false, fetchImpl: async () => { throw new Error('down'); } });
    const restore = console.error; console.error = () => {};
    const r2 = await call(down, { query: { tool: 'answer', id: 'il.comm.spam.30a' }, headers: { 'x-payment': payment } });
    console.error = restore;
    assert.equal(r2.statusCode, 502);
  });
});
