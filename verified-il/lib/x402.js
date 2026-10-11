// x402 (v1) for Verified IL: a paid call without payment gets HTTP 402 with
// PaymentRequirements; a call with an X-PAYMENT header is verified and settled
// through a facilitator (e.g. Coinbase CDP) before we answer.
//
// OFF by default: without X402_PAY_TO and X402_FACILITATOR_URL every call is
// served free (with an X-Price-USD header saying what it would cost).
// Check field names against the current x402 spec before going live.

// Native USDC on Base mainnet. Verify before enabling payments.
export const USDC_BASE = '0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913';

// Price per call in USD. Facts are cheap; computed results cost more.
export const PRICES = { answer: 0.02, cancellation: 0.05, spam: 0.1 };

export const paymentsEnabled = (env = process.env) => Boolean(env.X402_PAY_TO && env.X402_FACILITATOR_URL);

export function requirements(tool, resource, env = process.env) {
  return {
    scheme: 'exact',
    network: env.X402_NETWORK || 'base',
    maxAmountRequired: String(Math.round(PRICES[tool] * 1e6)), // USDC has 6 decimals
    resource,
    description: `Verified IL: ${tool}`,
    mimeType: 'application/json',
    payTo: env.X402_PAY_TO || '',
    maxTimeoutSeconds: 60,
    asset: env.X402_ASSET || USDC_BASE,
    extra: { name: 'USD Coin', version: '2' },
  };
}

async function facilitator(env, fetchImpl, path, body) {
  const headers = { 'Content-Type': 'application/json' };
  if (env.X402_FACILITATOR_TOKEN) headers.Authorization = `Bearer ${env.X402_FACILITATOR_TOKEN}`;
  const res = await fetchImpl(env.X402_FACILITATOR_URL.replace(/\/$/, '') + path, {
    method: 'POST', headers, body: JSON.stringify(body), signal: AbortSignal.timeout(15000),
  });
  if (!res.ok) throw new Error(`facilitator ${path} HTTP ${res.status}`);
  return res.json();
}

// -> { ok: true, settlement } or { status, body } to send back.
export async function charge(req, reqs, { env = process.env, fetchImpl = globalThis.fetch } = {}) {
  const header = req.headers?.['x-payment'];
  if (!header) return { status: 402, body: { x402Version: 1, accepts: [reqs], error: 'X-PAYMENT header is required' } };
  let paymentPayload;
  try {
    paymentPayload = JSON.parse(Buffer.from(String(header), 'base64').toString('utf8'));
  } catch {
    return { status: 400, body: { x402Version: 1, accepts: [reqs], error: 'X-PAYMENT is not valid base64 JSON' } };
  }
  const request = { x402Version: 1, paymentPayload, paymentRequirements: reqs };
  try {
    const v = await facilitator(env, fetchImpl, '/verify', request);
    if (!v.isValid) return { status: 402, body: { x402Version: 1, accepts: [reqs], error: v.invalidReason || 'payment invalid' } };
    const s = await facilitator(env, fetchImpl, '/settle', request);
    if (!s.success) return { status: 402, body: { x402Version: 1, accepts: [reqs], error: s.errorReason || 'settlement failed' } };
    return { ok: true, settlement: { success: true, transaction: s.transaction, network: s.network, payer: s.payer } };
  } catch (err) {
    console.error('x402 facilitator error', err.message);
    return { status: 502, body: { error: 'payment facilitator unavailable, nothing was charged' } };
  }
}

// Free calls per IP per day before payment is required (per instance, in memory).
export function createFreeTier({ perDay = 20, now = () => Date.now() } = {}) {
  const seen = new Map();
  let day = null;
  return (ip) => {
    const d = new Date(now()).toISOString().slice(0, 10);
    if (d !== day) { seen.clear(); day = d; }
    const n = (seen.get(ip) || 0) + 1;
    seen.set(ip, n);
    return n <= perDay;
  };
}
