// Guards for /api/*: the URL is public on Cloud Run and every route can spend the Gemini key.
// 1. A shared device token (MURMUR_TOKEN) in the x-murmur-token header; unset = open, for local work.
// 2. A per-IP rate limit and a daily cap on model calls, each a 429 with a sentence the phone can say.
import { timingSafeEqual, createHash } from 'node:crypto';

const digest = (s) => createHash('sha256').update(String(s)).digest();

/** The client's IP. Cloud Run's front end appends the real address last; earlier entries are the client's say-so. */
export function clientIp(req) {
  const xff = String(req.headers['x-forwarded-for'] || '').split(',').map((s) => s.trim()).filter(Boolean);
  return xff.at(-1) || req.socket?.remoteAddress || 'unknown';
}

/**
 * @param {{ token?: () => string, perMinute?: number, dailyCap?: number, now?: () => number }} o
 * @returns {(req, { model: boolean }) => null | { status, error, say }} with .spend(): one more model call, false at the cap
 */
export function createGuard({ token = () => process.env.MURMUR_TOKEN || '', perMinute = Number(process.env.MURMUR_RATE_PER_MIN) || 40,
  dailyCap = Number(process.env.MURMUR_DAILY_CAP) || 1500, now = () => Date.now() } = {}) {
  const hits = new Map(); // ip -> [timestamps in the last minute]
  let day = '', modelCalls = 0;
  const spend = () => {
    const today = new Date(now()).toISOString().slice(0, 10);
    if (today !== day) { day = today; modelCalls = 0; }
    if (modelCalls >= dailyCap) return false;
    modelCalls++;
    return true;
  };
  function check(req, { model = false } = {}) {
    const want = token();
    if (want && !timingSafeEqual(digest(req.headers['x-murmur-token'] || ''), digest(want))) {
      return { status: 401, error: 'token', say: "This phone isn't set up for Murmur yet. Open the link with your code once." };
    }
    const t = now(), ip = clientIp(req);
    const recent = (hits.get(ip) || []).filter((x) => t - x < 60000);
    if (recent.length >= perMinute) { hits.set(ip, recent); return { status: 429, error: 'rate', say: "That's a lot at once. Give me a minute, then try again." }; }
    recent.push(t);
    hits.set(ip, recent);
    if (hits.size > 5000) hits.clear(); // shortcut: crude memory bound; fine for one demo instance
    if (model && !spend()) return { status: 429, error: 'cap', say: "I've used today's thinking allowance. Simple commands still work until tomorrow." };
    return null;
  }
  check.spend = spend;
  return check;
}
