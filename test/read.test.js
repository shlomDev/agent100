import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import { createReadHandler, buildContent, KINDS } from '../api/read.js';
import { addMonths, addDays, daysUntil, icsCalendar } from '../assets/lib.js';

const IMG = { data: Buffer.from('jpeg').toString('base64'), mediaType: 'image/jpeg' };
const res = () => ({ headers: {}, setHeader(k, v) { this.headers[k] = v; }, status(c) { this.statusCode = c; return this; }, json(o) { this.body = o; return this; } });
const fake = (json, calls = []) => ({ calls, messages: { create: async (r) => { calls.push(r); return { stop_reason: 'end_turn', content: [{ type: 'text', text: JSON.stringify(json) }] }; } } });
const handler = (json, calls) => createReadHandler({ env: { ANTHROPIC_API_KEY: 'k' }, getClient: () => fake(json, calls), rateLimit: async () => ({ ok: true }), today: () => '2026-10-11' });
const post = async (h, body) => { const r = res(); await h({ method: 'POST', headers: {}, body }, r); return r; };

describe('reader (#13, #14, #23)', () => {
  test('bill from pasted SMS text (no image needed)', async () => {
    const calls = [];
    const r = await post(handler({ items: [{ issuer: 'חברת החשמל', type: 'electricity', amount: '312.4', dueDate: '2026-10-20', period: 'אוגוסט-ספטמבר', conf: 0.95 }] }, calls), { kind: 'bill', text: 'חשבון החשמל שלך בסך 312.40 ש"ח לתשלום עד 20.10' });
    assert.equal(r.statusCode, 200);
    assert.deepEqual(r.body.items[0], { issuer: 'חברת החשמל', type: 'electricity', amount: 312.4, dueDate: '2026-10-20', period: 'אוגוסט-ספטמבר', conf: 0.95 });
    assert.match(calls[0].messages[0].content[0].text, /TODAY: 2026-10-11/);
    assert.match(calls[0].system, /Never output ID numbers/);
  });

  test('appointment window is kept; bad times and dates dropped', async () => {
    const r = await post(handler({ items: [{ who: 'בזק', what: 'התקנת אינטרנט', date: '2026-10-14', from: '8:00', to: '12:00', place: 'הרצל 10', conf: 0.9 }, { who: 'x', date: 'יום שלישי', from: 'בבוקר' }] }), { kind: 'appointment', image: IMG });
    assert.equal(r.body.items[0].from, '08:00');
    assert.equal(r.body.items[0].to, '12:00');
    assert.equal(r.body.items[1].date, null);
    assert.equal(r.body.items[1].from, null);
  });

  test('receipt warranty only when printed and sane', async () => {
    const r = await post(handler({ items: [{ store: 'מחסני חשמל', product: 'מכונת כביסה', date: '2026-10-03', amount: 2490, warrantyMonths: 36, conf: 0.9 }, { product: 'כבל', warrantyMonths: 999 }] }), { kind: 'receipt', image: IMG });
    assert.equal(r.body.items[0].warrantyMonths, 36);
    assert.equal(r.body.items[1].warrantyMonths, null);
  });

  test('needs a known kind and an image or text', async () => {
    const h = handler({ items: [] });
    assert.equal((await post(h, { kind: 'tax', text: 'x' })).statusCode, 400);
    assert.equal((await post(h, { kind: 'bill' })).statusCode, 400);
    assert.throws(() => buildContent({ kind: 'bill', image: { data: 'x', mediaType: 'application/pdf' } }));
  });

  test('every kind has a prompt that forbids ID/card/account numbers', () => {
    for (const k of Object.values(KINDS)) assert.match(k.system, /credit-card numbers, bank-account numbers/);
  });
});

describe('dates and calendar', () => {
  test('addMonths keeps month ends sane', () => {
    assert.equal(addMonths('2026-01-31', 1), '2026-02-28');
    assert.equal(addMonths('2026-10-03', 36), '2029-10-03');
    assert.equal(addDays('2026-12-31', 1), '2027-01-01');
    assert.equal(daysUntil('2026-10-20', '2026-10-11'), 9);
  });
  test('timed events use Israel time; all-day events get an evening-before reminder', () => {
    const ics = icsCalendar([{ title: 'טכנאי', date: '2026-10-14', start: '08:00', end: '12:00' }, { title: 'חשמל', date: '2026-10-20' }]);
    assert.match(ics, /DTSTART;TZID=Asia\/Jerusalem:20261014T080000/);
    assert.match(ics, /DTEND;TZID=Asia\/Jerusalem:20261014T120000/);
    assert.match(ics, /TRIGGER:-PT2H/);
    assert.match(ics, /DTSTART;VALUE=DATE:20261020/);
    assert.match(ics, /TRIGGER:-PT15H/);
    assert.equal(ics.match(/BEGIN:VEVENT/g).length, 2);
  });
});
