// From shlomDev/zuzei api/_ratelimit.js.
// Per-IP daily rate limit backed by Upstash Redis (REST API, no SDK).
// Works with either Upstash's own env var names or Vercel KV / Marketplace ones.
// Without Redis configured it falls back to an in-memory counter, which only
// protects a single warm instance — fine for local dev, not for production.

import { createHash } from 'node:crypto';

const DAY_SECONDS = 86_400;

export function clientIp(req) {
  const h = req.headers || {};
  const real = h['x-real-ip'];
  if (real) return String(real).trim();
  const fwd = h['x-forwarded-for'];
  if (fwd) return String(fwd).split(',')[0].trim();
  return req.socket?.remoteAddress || 'unknown';
}

// Date in Israel, so the daily window resets at local midnight.
function israelDay(now) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Jerusalem' }).format(now);
}

export function secondsUntilIsraelMidnight(now = new Date()) {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-GB', {
      timeZone: 'Asia/Jerusalem',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hourCycle: 'h23',
    })
      .formatToParts(now)
      .map((p) => [p.type, Number(p.value)]),
  );
  return DAY_SECONDS - (parts.hour * 3600 + parts.minute * 60 + parts.second);
}

function hashIp(ip, salt) {
  return createHash('sha256').update(`${salt}:${ip}`).digest('hex').slice(0, 32);
}

function positiveInt(value, fallback) {
  const n = Number.parseInt(value, 10);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}

// `name` and `limit` give other callers (e.g. the Telegram bot, per chat) their
// own counters; the defaults are the per-IP letter limiter used by /api/generate.
export function createRateLimiter({
  env = process.env,
  fetchImpl = globalThis.fetch,
  now = () => new Date(),
  name = 'rl',
  limit,
} = {}) {
  const url = env.UPSTASH_REDIS_REST_URL || env.KV_REST_API_URL;
  const token = env.UPSTASH_REDIS_REST_TOKEN || env.KV_REST_API_TOKEN;
  const perIp = limit ?? positiveInt(env.A100_DAILY_LIMIT, 5);
  const globalCap = positiveInt(env.A100_GLOBAL_DAILY_LIMIT, 0); // 0 = off, shared by all named limiters
  const salt = env.A100_IP_SALT || 'a100';
  const memory = new Map();
  let memoryDay = null;

  if ((!url || !token) && name === 'rl') {
    console.warn('Rate limit: Redis not configured, using in-memory counter');
  }

  async function incr(keys) {
    if (url && token) {
      const commands = keys.flatMap((k) => [
        ['INCR', k],
        ['EXPIRE', k, String(DAY_SECONDS + 3600), 'NX'],
      ]);
      const res = await fetchImpl(`${url.replace(/\/$/, '')}/pipeline`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify(commands),
      });
      if (!res.ok) throw new Error(`Upstash HTTP ${res.status}`);
      const out = await res.json();
      return keys.map((_, i) => {
        const r = out[i * 2];
        if (r?.error) throw new Error(`Upstash: ${r.error}`);
        return Number(r?.result);
      });
    }
    return keys.map((k) => {
      const n = (memory.get(k) || 0) + 1;
      memory.set(k, n);
      return n;
    });
  }

  // Returns { ok, limit, remaining, retryAfter }. Fails open if Redis is down,
  // so an Upstash outage doesn't take the app down (the Anthropic spend limit
  // is the backstop).
  return async function check(ip) {
    const t = now();
    const day = israelDay(t);
    if (memoryDay !== day) {
      memory.clear();
      memoryDay = day;
    }
    const keys = [`a100:${name}:${day}:${hashIp(ip, salt)}`];
    if (globalCap) keys.push(`a100:rl:${day}:all`);
    let counts;
    try {
      counts = await incr(keys);
    } catch (err) {
      console.error('Rate limit check failed, allowing request', err.message);
      return { ok: true, limit: perIp, remaining: perIp };
    }
    const retryAfter = secondsUntilIsraelMidnight(t);
    if (counts[0] > perIp) return { ok: false, scope: 'ip', limit: perIp, remaining: 0, retryAfter };
    if (globalCap && counts[1] > globalCap) {
      return { ok: false, scope: 'global', limit: perIp, remaining: 0, retryAfter };
    }
    return { ok: true, limit: perIp, remaining: perIp - counts[0] };
  };
}
