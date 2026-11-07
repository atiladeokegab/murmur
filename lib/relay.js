// The bus relay: the phone POSTs bus events, /inside listens over Server-Sent Events. No dependencies.
// Rooms keep judges' phones off the projector: only a phone opened with ?room=stage (or #stage) forwards, and
// /inside?room=stage shows only that room. shortcut: in-memory rings of the last MAX events per room, one instance only.
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
// The contract's bus events (os/contract.md §6); 'reset' clears the room's ring.
const TYPES = new Set(EVENTS);

const rings = new Map(); // room -> events
const screens = new Map(); // room -> the phone's latest mirror:frame line; never in the ring, so a replay is one frame
const clients = new Map(); // res -> room
const listeners = new Set(); // in-process subscribers (the MCP adapter waiting for a remote:result)
/** Hear remote:run and remote:result as they pass. Returns the unsubscribe. */
export function listen(fn) { listeners.add(fn); return () => listeners.delete(fn); }
/** Is anything (a phone, /stage, /inside) listening in this room? */
export const watching = (room) => [...clients.values()].includes(room);
export const roomOf = (url) => { const r = url.searchParams.get('room') || ''; return /^[\w-]{1,32}$/.test(r) ? r.toLowerCase() : null; };
const ringOf = (room) => { if (!rings.has(room)) rings.set(room, []); return rings.get(room); };

export function publish(e, room) {
  if (!room || !e || typeof e !== 'object' || !TYPES.has(e.type)) return false;
  const ev = { ...e, at: Date.now() }, ring = ringOf(room);
  if (ev.type === 'mirror:frame') {
    if (typeof ev.html !== 'string') return false;
    const line = `data: ${JSON.stringify(ev)}\n\n`;
    screens.set(room, line);
    for (const [res, r] of clients) if (r === room && !(res.writableLength > 1e6)) res.write(line); // a stalled laptop skips frames, never buffers them
    return true;
  }
  if (ev.type === 'remote:hear') { // typed on /stage for the phone: sent live, never kept, so a rejoin never re-runs it
    if (typeof ev.text !== 'string' || !ev.text.trim()) return false;
    const line = `data: ${JSON.stringify({ type: ev.type, text: ev.text.slice(0, 300), at: ev.at })}\n\n`;
    for (const [res, r] of clients) if (r === room) res.write(line);
    return true;
  }
  if (ev.type === 'remote:run' || ev.type === 'remote:result') { // the MCP adapter's call and the phone's answer: live, never kept
    if (typeof ev.id !== 'string' || ev.id.length > 64) return false;
    const line = `data: ${JSON.stringify(ev)}\n\n`;
    for (const [res, r] of clients) if (r === room) res.write(line);
    for (const fn of listeners) fn(ev, room);
    return true;
  }
  if (ev.type === 'reset') ring.length = 0;
  ring.push(ev);
  if (ring.length > MAX) ring.splice(0, ring.length - MAX);
  const line = `data: ${JSON.stringify(ev)}\n\n`;
  for (const [res, r] of clients) if (r === room) res.write(line);
  return true;
}

// Mounted onto server.js's api table; the body is already size-capped and parsed there.
export const api = {
  async 'POST /api/bus'(body, room) {
    // remote:run drives the phone's GUI: only the server's MCP adapter publishes it, never a browser POST
    const list = (Array.isArray(body?.events) ? body.events.slice(0, 50) : [body]).filter((e) => e?.type !== 'remote:run');
    return { accepted: list.filter((e) => publish(e, room)).length };
  },
};

export function stream(req, res, room = 'stage') {
  res.writeHead(200, { 'content-type': 'text/event-stream', 'cache-control': 'no-store', connection: 'keep-alive', 'x-content-type-options': 'nosniff' });
  res.write(': joined\n\n'); // send the headers now, so a fresh /inside shows Joined without waiting for the first ping
  for (const ev of ringOf(room)) res.write(`data: ${JSON.stringify(ev)}\n\n`);
  if (screens.has(room)) res.write(screens.get(room)); // a new laptop sees the phone at once
  clients.set(res, room);
  const ping = setInterval(() => res.write(': ping\n\n'), 15e3);
  req.on('close', () => { clearInterval(ping); clients.delete(res); });
}

export const _rings = rings, _screens = screens; // tests only
