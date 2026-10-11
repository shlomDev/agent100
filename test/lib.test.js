import { test, describe } from 'node:test';
import assert from 'node:assert/strict';
import {
  normalizeHe, nameTokens, similarity, bestMatches, amountLooksOdd, reviewReasons,
  totalMismatch, toCSV, matchInvite, icsEvent, sum,
} from '../assets/lib.js';

describe('Hebrew names', () => {
  test('normalizes niqqud, final letters and punctuation', () => {
    assert.equal(normalizeHe('שָׁלוֹם'), 'שלומ');
    assert.equal(normalizeHe('כ"ץ'), 'כ צ');
    assert.equal(normalizeHe('  לוין-כהן  '), 'לוינ כהנ');
  });

  test('drops filler words and splits "ו" between names', () => {
    assert.deepEqual(nameTokens('משפחת לוי'), ['לוי']);
    assert.deepEqual(nameTokens('משה ודנה לוי'), ['משה', 'דנה', 'לוי']);
  });

  test('similar spellings score high, different people low', () => {
    assert.ok(similarity('משה לוי', 'משה לוי') === 1);
    assert.ok(similarity('משה לוי', 'משה לוין') > 0.8);
    assert.ok(similarity('משפחת כהן', 'כהן') > 0.9);
    assert.ok(similarity('משה לוי', 'רחל אברהם') < 0.5);
  });

  test('bestMatches ranks the guest list', () => {
    const list = ['משה לוי', 'משה לוין', 'דנה כהן', 'יוסי מזרחי'];
    const top = bestMatches('משה לוו', list, 2);
    assert.equal(top.length, 2);
    assert.ok(top[0].name.startsWith('משה'));
  });
});

describe('amounts and review', () => {
  test('common gift sums are fine, odd ones flagged', () => {
    for (const a of [180, 360, 500, 520, 1000, 270]) assert.equal(amountLooksOdd(a), false, a);
    for (const a of [137, 0, -50, 12000, 'x']) assert.equal(amountLooksOdd(a), true, a);
  });

  test('a clear row needs no review; doubtful parts are named', () => {
    const clear = { name: 'משה לוי', amount: 500, conf: { name: 0.97, amount: 0.99 } };
    assert.deepEqual(reviewReasons(clear), []);
    assert.deepEqual(reviewReasons({ name: 'משה לוי', amount: 137, conf: { name: 0.6, amount: 0.95 } }), ['name-unsure', 'amount-odd']);
    assert.deepEqual(reviewReasons({ name: '', amount: null }), ['name-missing', 'amount-missing']);
  });

  test('with a guest list, names not on it are flagged', () => {
    const row = { name: 'משה לוויי', amount: 500, conf: { name: 0.95, amount: 0.95 } };
    assert.ok(reviewReasons(row, { names: ['משה לוי', 'דנה כהן'] }).includes('name-not-in-list'));
    assert.deepEqual(reviewReasons({ ...row, name: 'משה לוי' }, { names: ['משה לוי'] }), []);
  });

  test('page totals catch misreads', () => {
    const rows = [{ amount: 500 }, { amount: 360 }, { amount: 180 }];
    assert.equal(sum(rows), 1040);
    assert.equal(totalMismatch(rows, 1040), null);
    assert.deepEqual(totalMismatch(rows, 1220), { written: 1220, counted: 1040, diff: 180 });
    assert.equal(totalMismatch(rows, null), null);
  });
});

describe('export and invitations', () => {
  test('CSV has a BOM, Hebrew headers, quoting and a total', () => {
    const csv = toCSV([{ name: 'כהן, דנה', amount: 500, note: 'צ\'ק' }, { name: 'משה "מוישה" לוי', amount: 360 }], { title: 'החתונה שלנו' });
    assert.ok(csv.startsWith('﻿'));
    assert.match(csv, /שם,סכום,הערה/);
    assert.match(csv, /"כהן, דנה",500/);
    assert.match(csv, /"משה ""מוישה"" לוי",360/);
    assert.match(csv, /"סה""כ",860/);
  });

  test('invitation people are matched against saved notebooks', () => {
    const notebooks = [
      { id: 'w', title: 'החתונה שלנו', date: '2023-06-01', rows: [{ name: 'משה ודנה לוי', amount: 500 }, { name: 'יוסי כהן', amount: 360 }] },
      { id: 'b', title: 'בר המצווה של נועם', date: '2025-02-10', rows: [{ name: 'משפחת לוי', amount: 300 }] },
    ];
    const hits = matchInvite(['דנה לוי', 'אבי רוזן'], notebooks);
    assert.equal(hits.length, 2);
    assert.equal(hits[0].row.amount, 500);
    assert.equal(matchInvite(['רונית ברק'], notebooks).length, 0);
  });

  test('calendar file has an all-day event and a reminder', () => {
    const ics = icsEvent({ title: 'החתונה של משה ודנה', date: '2026-11-03', uid: 'x' });
    assert.match(ics, /DTSTART;VALUE=DATE:20261103/);
    assert.match(ics, /DTEND;VALUE=DATE:20261104/);
    assert.match(ics, /BEGIN:VALARM/);
  });
});
