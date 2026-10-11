// Verified IL API (Vercel function). One entry point, routed by ?tool=:
//   GET  /api/v1?tool=catalog                 free  — rules list, prices, public key
//   GET  /api/v1?tool=answer&id=<rule>&lang=  $0.02 — a rule, signed
//   POST /api/v1?tool=cancellation  {channel, date, priceIls?, used?, exception?}   $0.05
//   POST /api/v1?tool=spam          {channel, customer, optout, removed, removedOn?, first, last, count}  $0.10
// vercel.json maps /v1/<tool> to these. Responses: { body, signature, alg, keyId }.

import { answer, catalog, checkCancellation, checkSpam, keyId, loadKeys, signed } from '../lib/core.js';
import { PRICES, charge, createFreeTier, paymentsEnabled, requirements } from '../lib/x402.js';

export function createHandler({ env = process.env, keys = loadKeys(env), fetchImpl = globalThis.fetch, freeTier } = {}) {
  const free = freeTier || createFreeTier({ perDay: Number(env.VERIFIED_FREE_PER_DAY) || 20 });

  return async function handler(req, res) {
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, X-PAYMENT');
    res.setHeader('Access-Control-Expose-Headers', 'X-PAYMENT-RESPONSE, X-Price-USD');
    if (req.method === 'OPTIONS') return res.status(204).json({});

    const q = req.query || {};
    const tool = String(q.tool || 'catalog');
    let body = req.body;
    if (typeof body === 'string') { try { body = JSON.parse(body); } catch { body = null; } }

    if (tool === 'catalog') {
      return res.status(200).json({
        service: 'Verified IL',
        about: 'Israeli consumer and communications rules as facts, calculations and checks. Every response is signed (Ed25519). Rules not yet reviewed by a lawyer are marked verified:false.',
        prices: Object.fromEntries(Object.entries(PRICES).map(([k, v]) => [k, { usd: v }])),
        payments: paymentsEnabled(env) ? 'x402' : 'free (payments not enabled yet)',
        rules: catalog(),
        keyId: keyId(keys.publicKey),
        publicKey: keys.publicKey.export({ type: 'spki', format: 'pem' }),
      });
    }

    let result;
    if (tool === 'answer') result = answer(String(q.id || ''), q.lang === 'en' ? 'en' : 'he');
    else if (tool === 'cancellation' && req.method === 'POST') result = checkCancellation(body || {});
    else if (tool === 'spam' && req.method === 'POST') result = checkSpam(body || {});
    else return res.status(404).json({ error: 'unknown tool or method; see /v1/catalog' });
    if (!result) return res.status(404).json({ error: 'unknown rule id; see /v1/catalog' });
    if (result.error) return res.status(400).json({ error: result.error });

    res.setHeader('X-Price-USD', String(PRICES[tool]));
    if (paymentsEnabled(env)) {
      const ip = String(req.headers?.['x-real-ip'] || req.headers?.['x-forwarded-for'] || 'unknown').split(',')[0].trim();
      if (!req.headers?.['x-payment'] && free(ip)) {
        res.setHeader('X-Free-Tier', 'true');
      } else {
        const resource = `https://${req.headers?.host || 'localhost'}/v1/${tool}`;
        const paid = await charge(req, requirements(tool, resource, env), { env, fetchImpl });
        if (!paid.ok) return res.status(paid.status).json(paid.body);
        res.setHeader('X-PAYMENT-RESPONSE', Buffer.from(JSON.stringify(paid.settlement)).toString('base64'));
      }
    }
    return res.status(200).json(signed(result, keys));
  };
}

export default createHandler();
