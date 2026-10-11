// Shared logic for Agent 100 pages. Pure functions: run in the browser
// (as an ES module) and in Node tests. No network, no storage here.

// ---------- Hebrew names ----------
const FINALS = { 'ך': 'כ', 'ם': 'מ', 'ן': 'נ', 'ף': 'פ', 'ץ': 'צ' };
const NOISE = new Set(['משפחת', 'משפ', 'מש', 'ומשפחתו', 'ומשפחתה', 'ומשפחתם', 'הזוג', 'מר', 'גב', 'גברת', 'ד"ר', 'דר']);

export function normalizeHe(s) {
  return String(s || '')
    .replace(/[֑-ׇ]/g, '') // niqqud and cantillation
    .replace(/[ךםןףץ]/g, (c) => FINALS[c])
    .replace(/["'״׳`.,:;()\-–—]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}

// Tokens without filler words; "ו" joining two names ("משה ודנה") is split off.
export function nameTokens(s) {
  return normalizeHe(s)
    .split(' ')
    .map((t) => (t.length > 2 && t.startsWith('ו') ? t.slice(1) : t))
    .filter((t) => t && !NOISE.has(t));
}

function levenshtein(a, b) {
  if (a === b) return 0;
  const m = a.length, n = b.length;
  if (!m) return n;
  if (!n) return m;
  let prev = Array.from({ length: n + 1 }, (_, j) => j);
  for (let i = 1; i <= m; i++) {
    const cur = [i];
    for (let j = 1; j <= n; j++) {
      cur[j] = Math.min(prev[j] + 1, cur[j - 1] + 1, prev[j - 1] + (a[i - 1] === b[j - 1] ? 0 : 1));
    }
    prev = cur;
  }
  return prev[n];
}

const ratio = (a, b) => (a || b ? 1 - levenshtein(a, b) / Math.max(a.length, b.length) : 1);

// 0..1. Token-wise: each token of the shorter name finds its best partner.
export function similarity(a, b) {
  const A = nameTokens(a), B = nameTokens(b);
  if (!A.length || !B.length) return 0;
  const [small, big] = A.length <= B.length ? [A, B] : [B, A];
  const per = small.map((t) => Math.max(...big.map((u) => ratio(t, u))));
  const tokenScore = per.reduce((x, y) => x + y, 0) / small.length;
  const whole = ratio(A.join(' '), B.join(' '));
  const coverage = small.length / big.length; // "לוי" vs "משה לוי" is weaker
  return Math.max(whole, tokenScore * (0.75 + 0.25 * coverage));
}

export function bestMatches(name, list, k = 3, min = 0.6) {
  return list
    .map((cand) => ({ name: cand, score: similarity(name, cand) }))
    .filter((m) => m.score >= min)
    .sort((x, y) => y.score - x.score)
    .slice(0, k);
}

// ---------- amounts ----------
// Common Israeli gift sums. Anything not a round number is worth a second look.
export const COMMON_GIFTS = [100, 150, 180, 200, 250, 260, 300, 360, 400, 450, 500, 520, 540, 600, 700, 720, 800, 900, 1000, 1200, 1500, 1800, 2000, 2500, 3000];

export function amountLooksOdd(amount) {
  if (amount == null || amount === '') return false;
  const n = Number(amount);
  if (!Number.isFinite(n) || n <= 0) return true;
  if (COMMON_GIFTS.includes(n)) return false;
  return n % 10 !== 0 || n > 10000;
}

// ---------- review ----------
export const CONF_OK = 0.85;

// Why a row needs the user's eyes ([] = it doesn't).
export function reviewReasons(row, { names = [] } = {}) {
  const reasons = [];
  if (!row.name) reasons.push('name-missing');
  else if ((row.conf?.name ?? 1) < CONF_OK) reasons.push('name-unsure');
  if (row.amount == null) reasons.push('amount-missing');
  else if ((row.conf?.amount ?? 1) < CONF_OK) reasons.push('amount-unsure');
  if (amountLooksOdd(row.amount)) reasons.push('amount-odd');
  if (names.length && row.name) {
    const top = bestMatches(row.name, names, 1, 0)[0];
    if (!top || top.score < 0.92) reasons.push('name-not-in-list');
  }
  return reasons;
}

export const sum = (rows) => rows.reduce((t, r) => t + (Number(r.amount) || 0), 0);

// A written page total that doesn't match the rows means something was misread.
export function totalMismatch(rows, total) {
  if (total == null || !Number.isFinite(Number(total))) return null;
  const s = sum(rows);
  return s === Number(total) ? null : { written: Number(total), counted: s, diff: Number(total) - s };
}

// ---------- export ----------
const csvCell = (v) => {
  const s = String(v ?? '');
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

// UTF-8 with BOM so Excel shows Hebrew correctly.
export function toCSV(rows, { title = '' } = {}) {
  const lines = [];
  if (title) lines.push(csvCell(title));
  lines.push(['שם', 'סכום', 'הערה'].map(csvCell).join(','));
  for (const r of rows) lines.push([r.name, r.amount ?? '', r.note || ''].map(csvCell).join(','));
  lines.push(['סה"כ', sum(rows), ''].map(csvCell).join(','));
  return '﻿' + lines.join('\r\n');
}

// ---------- invitations ----------
// Which saved records match the people on an invitation.
export function matchInvite(people, notebooks, min = 0.8) {
  const out = [];
  for (const nb of notebooks) {
    for (const row of nb.rows || []) {
      let best = 0;
      for (const p of people) best = Math.max(best, similarity(p, row.name));
      if (best >= min) out.push({ notebook: { id: nb.id, title: nb.title, date: nb.date }, row, score: Math.round(best * 100) / 100 });
    }
  }
  return out.sort((a, b) => b.score - a.score);
}

// ---------- calendar ----------
const icsText = (v) => String(v).replace(/[\\;,]/g, (m) => '\\' + m).replace(/\n/g, '\\n');

export function icsEvent({ title, date, description = '', uid = `${Date.now()}@agent100` }) {
  const d = date.replace(/-/g, '');
  const next = new Date(Date.parse(date) + 86_400_000).toISOString().slice(0, 10).replace(/-/g, '');
  return [
    'BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Agent100//HE', 'CALSCALE:GREGORIAN',
    'BEGIN:VEVENT', `UID:${uid}`, `DTSTAMP:${new Date().toISOString().replace(/[-:]/g, '').slice(0, 15)}Z`,
    `DTSTART;VALUE=DATE:${d}`, `DTEND;VALUE=DATE:${next}`,
    `SUMMARY:${icsText(title)}`, `DESCRIPTION:${icsText(description)}`,
    'BEGIN:VALARM', 'TRIGGER:-PT15H', 'ACTION:DISPLAY', `DESCRIPTION:${icsText(title)}`, 'END:VALARM',
    'END:VEVENT', 'END:VCALENDAR',
  ].join('\r\n');
}
