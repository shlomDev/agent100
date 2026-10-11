// Verified IL — answers and tools over a reviewed rules dataset.
// Every response is signed (Ed25519) so a buying agent can prove what it got,
// from whom, and from which dataset version. Unreviewed rules are always
// served with verified:false.

import { readFileSync } from 'node:fs';
import { createPrivateKey, createPublicKey, generateKeyPairSync, sign, verify, createHash } from 'node:crypto';

const DATA = JSON.parse(readFileSync(new URL('../data/rules.json', import.meta.url), 'utf8'));
export const RULES = new Map(DATA.rules.map((r) => [r.id, r]));
export const DATASET_VERSION = DATA.version;
const DAY = 86_400_000;

export const DISCLAIMER = {
  he: 'מידע כללי על הדין, לא ייעוץ משפטי.',
  en: 'General legal information, not legal advice.',
};

const isVerified = (rule) => Boolean(rule.reviewed?.by && rule.reviewed?.at);
const addDays = (iso, n) => new Date(Date.parse(iso) + n * DAY).toISOString().slice(0, 10);
const days = (a, b) => Math.round((Date.parse(b) - Date.parse(a)) / DAY);
export const todayIL = (now = new Date()) => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Jerusalem' }).format(now);
const ISO = /^\d{4}-\d{2}-\d{2}$/;

function ruleRef(rule) {
  return { id: rule.id, law: rule.law, verified: isVerified(rule), reviewed: rule.reviewed || null };
}

export function catalog() {
  return DATA.rules.map((r) => ({ id: r.id, topic: r.topic, title: r.title, verified: isVerified(r) }));
}

// --- Tool 1: a fact ---
export function answer(id, lang = 'he') {
  const rule = RULES.get(id);
  if (!rule) return null;
  return {
    kind: 'answer',
    rule: ruleRef(rule),
    title: rule.title[lang] || rule.title.he,
    answer: rule.answer[lang] || rule.answer.he,
    params: rule.params,
    verified: isVerified(rule),
    disclaimer: DISCLAIMER[lang] || DISCLAIMER.he,
  };
}

// --- Tool 2: can this purchase still be cancelled? ---
// input: { channel: 'store'|'online', date (purchase for store / delivery for online), priceIls?, used?, exception?, today? }
const EXCEPTIONS = ['food', 'medicine', 'perishable', 'custom', 'underwear'];
export function checkCancellation(input) {
  const today = input.today && ISO.test(input.today) ? input.today : todayIL();
  const channel = input.channel;
  if (!['store', 'online'].includes(channel)) return { error: 'channel must be "store" or "online"' };
  if (!ISO.test(input.date || '')) return { error: 'date must be YYYY-MM-DD' };
  if (input.date > today) return { error: 'date is in the future' };
  const rule = RULES.get(channel === 'store' ? 'il.consumer.cancel.store.14d' : 'il.consumer.cancel.distance.14d');
  const { days: window, minPriceIls, feePct, feeCapIls } = rule.params;
  const deadline = addDays(input.date, window);
  const elapsed = days(input.date, today);
  const reasons = [];
  let eligible = elapsed <= window;
  if (!eligible) reasons.push(`more than ${window} days since ${channel === 'store' ? 'purchase' : 'delivery'} (${elapsed})`);
  if (channel === 'store') {
    if (input.priceIls != null && Number(input.priceIls) <= minPriceIls) { eligible = false; reasons.push(`price is not above ₪${minPriceIls}`); }
    if (input.used === true) { eligible = false; reasons.push('the goods were used'); }
    if (input.exception && EXCEPTIONS.includes(input.exception)) { eligible = false; reasons.push(`excluded category: ${input.exception}`); }
  }
  const price = Number(input.priceIls);
  const maxFeeIls = Number.isFinite(price) && price > 0 ? Math.min((price * feePct) / 100, feeCapIls) : null;
  return {
    kind: 'cancellation',
    eligible,
    deadline,
    daysLeft: Math.max(0, window - elapsed),
    reasons,
    maxFeeIls: maxFeeIls == null ? null : Math.round(maxFeeIls * 100) / 100,
    unknown: channel === 'store' ? ['used', 'exception', 'priceIls'].filter((k) => input[k] == null) : [],
    rule: ruleRef(rule),
    verified: isVerified(rule),
    today,
    disclaimer: DISCLAIMER.en,
  };
}

// --- Tool 3: does a spam case qualify? (same gate as Zuzei api/_spam.js) ---
export function checkSpam(input) {
  const today = input.today && ISO.test(input.today) ? input.today : todayIL();
  const rule = RULES.get('il.comm.spam.30a');
  const out = (ok, code, extra = {}) => ({ kind: 'spam-eligibility', ok, code, ...extra, rule: ruleRef(rule), verified: isVerified(rule), today, disclaimer: DISCLAIMER.en });
  const { channel, customer, optout, removed, removedOn, first, last, count } = input;
  if (!['sms', 'email'].includes(channel)) return out(false, 'channel');
  if (!['yes', 'no'].includes(customer) || !['yes', 'no', 'unsure'].includes(optout) || !['yes', 'no'].includes(removed)) return out(false, 'missing');
  const n = Number(count);
  if (!Number.isInteger(n) || n < 1 || n > 50 || !ISO.test(first || '') || !ISO.test(last || '') || first > last || last > today) return out(false, 'dates');
  if (first !== last && n < 2) return out(false, 'dates');
  if (customer === 'yes' && removed !== 'yes') return out(false, 'customer', { next: 'Ask the sender to remove you; count only messages after that.' });
  if (optout !== 'no' && removed !== 'yes') return out(false, 'optout', { next: 'Use the opt-out first; count only messages after that.' });
  const removalMatters = customer === 'yes' || optout !== 'no';
  if (removed === 'yes') {
    if (!ISO.test(removedOn || '') || removedOn > today) return out(false, 'missing');
    if (removalMatters && first <= removedOn) return out(false, 'after_removal');
  }
  if (days(first, today) > 90) return out(false, 'stale', { next: 'Include only messages from the last 90 days.' });
  const cap = n * rule.params.perMessageCapIls;
  return out(true, 'eligible', { count: n, claimCapIls: cap, note: 'Courts may award less than the cap.' });
}

// --- Signing ---
// Canonical JSON: keys sorted, so the same payload always signs the same.
export function canonical(v) {
  if (Array.isArray(v)) return `[${v.map(canonical).join(',')}]`;
  if (v && typeof v === 'object') return `{${Object.keys(v).sort().map((k) => `${JSON.stringify(k)}:${canonical(v[k])}`).join(',')}}`;
  return JSON.stringify(v);
}

export function loadKeys(env = process.env) {
  if (env.VERIFIED_SIGNING_KEY) {
    const privateKey = createPrivateKey(env.VERIFIED_SIGNING_KEY.replace(/\\n/g, '\n'));
    return { privateKey, publicKey: createPublicKey(privateKey) };
  }
  // Dev only: an ephemeral key. Signatures won't survive a restart.
  return generateKeyPairSync('ed25519');
}

export function keyId(publicKey) {
  return createHash('sha256').update(publicKey.export({ type: 'spki', format: 'der' })).digest('hex').slice(0, 16);
}

export function signed(payload, keys, { issuer = 'verified-il', now = new Date() } = {}) {
  const body = { ...payload, issuer, dataset: DATASET_VERSION, issuedAt: now.toISOString() };
  const signature = sign(null, Buffer.from(canonical(body)), keys.privateKey).toString('base64');
  return { body, signature, alg: 'Ed25519', keyId: keyId(keys.publicKey) };
}

export function verifySigned({ body, signature }, publicKey) {
  return verify(null, Buffer.from(canonical(body)), publicKey, Buffer.from(signature, 'base64'));
}
