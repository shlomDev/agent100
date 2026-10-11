// Helpers for the image-reading agents: input checks, the model call, and
// turning the model's reply into JSON. Images are never written anywhere.

import Anthropic from '@anthropic-ai/sdk';

export const DEFAULT_MODEL = 'claude-sonnet-5-5';
export const MEDIA = new Set(['image/jpeg', 'image/png', 'image/webp']);
export const MAX_IMAGE_B64 = 3_400_000; // ~2.5 MB image; Vercel's body limit is 4.5 MB
export const MAX_EXAMPLE_B64 = 120_000;

export class InputError extends Error {}

export function readBody(req) {
  let body = req.body;
  if (typeof body === 'string') {
    try { body = JSON.parse(body); } catch { throw new InputError('בקשה לא תקינה.'); }
  }
  if (!body || typeof body !== 'object' || Array.isArray(body)) throw new InputError('בקשה לא תקינה.');
  return body;
}

export function checkImage(img, max = MAX_IMAGE_B64) {
  if (!img || typeof img !== 'object') throw new InputError('חסרה תמונה.');
  const { data, mediaType } = img;
  if (!MEDIA.has(mediaType)) throw new InputError('אפשר להעלות JPG, PNG או WEBP.');
  if (typeof data !== 'string' || !data || !/^[A-Za-z0-9+/=]+$/.test(data.slice(0, 200))) throw new InputError('התמונה לא תקינה.');
  if (data.length > max) throw new InputError('התמונה גדולה מדי. נסו תמונה קטנה יותר.');
  return { type: 'image', source: { type: 'base64', media_type: mediaType, data } };
}

// First {...} object in the reply (the model is told to answer with JSON only).
export function parseJson(text) {
  const s = String(text || '').replace(/```(?:json)?/g, '');
  const start = s.indexOf('{');
  const end = s.lastIndexOf('}');
  if (start < 0 || end <= start) return null;
  try { return JSON.parse(s.slice(start, end + 1)); } catch { return null; }
}

const FAILED = 'לא הצלחנו לקרוא את התמונה. נסו שוב.';

// -> { data } or { status, error } (Hebrew, safe to show).
export async function askVision(client, { model, system, content, maxTokens = 4000, timeout = 50_000 }) {
  let response;
  try {
    response = await client.messages.create({ model, max_tokens: maxTokens, system, messages: [{ role: 'user', content }] }, { timeout });
  } catch (err) {
    if (err instanceof Anthropic.RateLimitError) return { status: 503, error: 'עומס זמני. נסו שוב בעוד דקה.' };
    if (err instanceof Anthropic.APIConnectionTimeoutError) return { status: 504, error: 'הקריאה לקחה יותר מדי זמן. נסו שוב.' };
    if (err instanceof Anthropic.BadRequestError) return { status: 422, error: 'לא הצלחנו לפתוח את התמונה. נסו צילום אחר.' };
    console.error('Vision call failed', err?.status, err?.message);
    return { status: 502, error: FAILED };
  }
  if (response.stop_reason === 'refusal') return { status: 422, error: 'לא ניתן לעבד את התמונה הזו.' };
  const data = parseJson(response.content.filter((b) => b.type === 'text').map((b) => b.text).join(''));
  if (!data) return { status: 502, error: FAILED };
  return { data };
}

export function send(res, status, payload) {
  res.setHeader('Cache-Control', 'no-store');
  return res.status(status).json(payload);
}

const clamp01 = (v) => (Number.isFinite(Number(v)) ? Math.min(1, Math.max(0, Number(v))) : 0);
export const num = (v) => (v === null || v === '' || !Number.isFinite(Number(v)) ? null : Number(v));
export const str = (v, max) => (typeof v === 'string' ? v.replace(/[<>]/g, '').trim().slice(0, max) : '');
export { clamp01 };
