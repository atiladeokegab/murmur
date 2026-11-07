// The bus relay: the phone POSTs bus events, /inside listens over Server-Sent Events. No dependencies.
// shortcut: one shared room per server and an in-memory ring of the last MAX events; add a session code if two phones demo at once.
import { EVENTS } from '../public/sdk/bus.js';

export const MAX = 500;

// Who may use the bus. A POST must come from this page (a forged `heard` would show on /inside), and when
// MURMUR_TOKEN is set both sides must carry it: the POST as x-murmur-token, the stream as ?t= (EventSource sends no headers).
export function allowed(req, url, token = process.env.MURMUR_TOKEN || '') {
  if (token && (req.headers['x-murmur-token'] || url.searchParams.get('t')) !== token) return false;
  if (req.method !== 'POST') return true;
  const site = req.headers['sec-fetch-site'];
  if (site) return site === 'same-origin';
  try { return new URL(req.headers.origin).host === req.headers.host; } catch { return false; }
}
// The contract's bus events (os/contract.md §6), plus 'reset', which clears the ring.
const TYPES = new Set([...EVENTS, 'reset']);

const ring = [];
const clients = new Set();

export function publish(e) {
  if (!e || typeof e !== 'object' || !TYPES.has(e.type)) return false;
  const ev = { ...e, at: Date.now() };
  if (ev.type === 'reset') ring.length = 0;
  ring.push(ev);
  if (ring.length > MAX) ring.splice(0, ring.length - MAX);
  const line = `data: ${JSON.stringify(ev)}\n\n`;
  for (const res of clients) res.write(line);
  return true;
}

// Mounted onto server.js's api table; the body is already size-capped and parsed there.
export const api = {
  async 'POST /api/bus'(body) {
    const list = Array.isArray(body?.events) ? body.events.slice(0, 50) : [body];
    return { accepted: list.filter(publish).length };
  },
};

export function stream(req, res) {
  res.writeHead(200, { 'content-type': 'text/event-stream', 'cache-control': 'no-store', connection: 'keep-alive', 'x-content-type-options': 'nosniff' });
  res.write(': joined\n\n'); // send the headers now, so a fresh /inside shows Joined without waiting for the first ping
  for (const ev of ring) res.write(`data: ${JSON.stringify(ev)}\n\n`);
  clients.add(res);
  const ping = setInterval(() => res.write(': ping\n\n'), 15e3);
  req.on('close', () => { clearInterval(ping); clients.delete(res); });
}

export const _ring = ring; // tests only
