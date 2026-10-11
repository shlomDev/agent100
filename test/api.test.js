import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { createNotebookHandler, cleanRows, buildContent } from '../api/notebook.js';
import { createInviteHandler, cleanInvite } from '../api/invite.js';
import { parseJson } from '../lib/vision.js';

const IMG = { data: Buffer.from('fake-jpeg-bytes').toString('base64'), mediaType: 'image/jpeg' };
const ENV = { ANTHROPIC_API_KEY: 'k' };
const res = () => ({ headers: {}, setHeader(k, v) { this.headers[k] = v; }, status(c) { this.statusCode = c; return this; }, json(o) { this.body = o; return this; } });
const allow = async () => ({ ok: true, limit: 60 });

function client(reply, calls = []) {
  return { calls, messages: { create: async (r) => { calls.push(r); return typeof reply === 'function' ? reply(r) : reply; } } };
}
const text = (t, stop = 'end_turn') => ({ stop_reason: stop, content: [{ type: 'text', text: t }] });
const call = async (h, body, headers = {}) => { const r = res(); await h({ method: 'POST', body, headers }, r); return r; };

describe('notebook (#24)', () => {
  test('reads a page into clean rows', async () => {
    const reply = text('```json\n{"rows":[{"name":"משה לוי","amount":"500","note":"","y":0.1,"conf":{"name":0.95,"amount":0.99},"alt":{"name":[],"amount":[]}},{"name":"דנה כהן","amount":360,"y":0.2,"conf":{"name":0.6,"amount":0.7},"alt":{"name":["דינה כהן","דנה כהנא","x"],"amount":[380]}}],"total":860}\n```');
    const h = createNotebookHandler({ env: ENV, getClient: () => client(reply), rateLimit: allow });
    const r = await call(h, { page: IMG });
    assert.equal(r.statusCode, 200);
    assert.equal(r.body.rows.length, 2);
    assert.equal(r.body.rows[0].amount, 500);
    assert.deepEqual(r.body.rows[1].alt, { name: ['דינה כהן', 'דנה כהנא'], amount: [380] });
    assert.equal(r.body.total, 860);
  });

  test('handwriting examples and guest list go to the model before the page', () => {
    const content = buildContent({
      page: IMG,
      examples: [{ image: IMG, text: 'משה לוי · 500' }, { image: IMG, text: '' }],
      names: ['משה לוי', '<b>דנה</b>'],
    });
    const kinds = content.map((c) => (c.type === 'image' ? 'img' : c.text.split(/\s|:/)[0]));
    assert.deepEqual(kinds, ['HANDWRITING', 'img', '↑', 'GUEST', 'PAGE', 'img', 'Return']);
    assert.match(content[3].text, /bדנה\/b/);
  });

  test('rejects missing/odd images and oversized examples before calling the model', async () => {
    const c = client(text('{}'));
    const h = createNotebookHandler({ env: ENV, getClient: () => c, rateLimit: allow });
    assert.equal((await call(h, {})).statusCode, 400);
    assert.equal((await call(h, { page: { data: 'xx', mediaType: 'application/pdf' } })).statusCode, 400);
    assert.equal((await call(h, { page: IMG, examples: [{ image: { data: 'A'.repeat(200_000), mediaType: 'image/jpeg' }, text: 'x' }] })).statusCode, 400);
    assert.equal(c.calls.length, 0);
  });

  test('rate limit, cross-site and missing key', async () => {
    const h = createNotebookHandler({ env: ENV, getClient: () => client(text('{}')), rateLimit: async () => ({ ok: false, limit: 60 }) });
    assert.equal((await call(h, { page: IMG })).statusCode, 429);
    assert.equal((await call(h, { page: IMG }, { origin: 'https://evil.example', host: 'agent100.app' })).statusCode, 403);
    assert.equal((await call(createNotebookHandler({ env: {}, rateLimit: allow }), { page: IMG })).statusCode, 503);
  });

  test('unparseable reply and refusal give a Hebrew error', async () => {
    const bad = createNotebookHandler({ env: ENV, getClient: () => client(text('sorry, cannot')), rateLimit: allow });
    assert.equal((await call(bad, { page: IMG })).statusCode, 502);
    const refuse = createNotebookHandler({ env: ENV, getClient: () => client(text('', 'refusal')), rateLimit: allow });
    const r = await call(refuse, { page: IMG });
    assert.equal(r.statusCode, 422);
    assert.match(r.body.error, /[א-ת]/);
  });

  test('cleanRows clamps and drops junk', () => {
    const out = cleanRows({ rows: [{ name: '<x>', amount: 'abc', y: 7, conf: { name: 3 } }, { name: '', amount: null }], total: 'n/a' });
    assert.deepEqual(out.rows, [{ name: 'x', amount: null, note: '', y: 1, conf: { name: 1, amount: 0 }, alt: { name: [], amount: [] } }]);
    assert.equal(out.total, null);
  });
});

describe('invite (#25)', () => {
  test('extracts event details; bad dates become null', async () => {
    const reply = text('{"eventType":"wedding","people":["נועה ואורי","משפחת לוי"],"date":"2026-11-03","dateText":"3.11.2026","time":"19:30","venue":"אולמי הגן","city":"ראשון לציון","conf":0.9}');
    const h = createInviteHandler({ env: ENV, getClient: () => client(reply), rateLimit: allow });
    const r = await call(h, { image: IMG });
    assert.equal(r.statusCode, 200);
    assert.deepEqual(r.body.people, ['נועה ואורי', 'משפחת לוי']);
    assert.equal(r.body.date, '2026-11-03');
    assert.equal(cleanInvite({ date: 'כ"ג בחשוון', eventType: 'party', time: '7pm' }).date, null);
    assert.equal(cleanInvite({ eventType: 'party' }).eventType, 'other');
  });

  test('requires an image', async () => {
    const h = createInviteHandler({ env: ENV, getClient: () => client(text('{}')), rateLimit: allow });
    assert.equal((await call(h, {})).statusCode, 400);
  });
});

test('parseJson tolerates fences and prose', () => {
  assert.deepEqual(parseJson('here:\n```json\n{"a":1}\n```'), { a: 1 });
  assert.equal(parseJson('nope'), null);
});
