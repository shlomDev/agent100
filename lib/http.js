// Browsers send Origin on cross-site POSTs. Reject requests whose Origin host
// differs from the Host they were sent to, so other sites can't put our form
// (and our API key) behind their own pages. Non-browser clients without an
// Origin still pass and are covered by the rate limiter.
export function isCrossOrigin(req) {
  const origin = req.headers?.origin;
  if (!origin) return false;
  const host = req.headers?.['x-forwarded-host'] || req.headers?.host;
  try {
    return new URL(origin).host !== host;
  } catch {
    return true;
  }
}
