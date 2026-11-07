// Murmur server: static app + a thin Gemini proxy. node:http, no dependencies.
import http from 'node:http';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as demo from './lib/demo.js';
import * as gemini from './lib/gemini.js';
import * as relay from './lib/relay.js';
import * as agent from './lib/agent/planner.js';

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), 'public');
const KEY = process.env.GEMINI_API_KEY || '';
const PROVIDER = KEY ? 'gemini' : 'demo';
const LIVE_URL = process.env.MURMUR_LIVE_URL || ''; // test only: point the browser at a fake Live server
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8',
  '.woff2': 'font/woff2', '.svg': 'image/svg+xml', '.png': 'image/png', '.json': 'application/json', '.txt': 'text/plain; charset=utf-8',
  '.webmanifest': 'application/manifest+json' };
const PAGES = { '/': 'index.html', '/race': 'race.html', '/inside': 'inside/index.html' };

function send(res, status, body, type = 'application/json') {
  res.writeHead(status, { 'content-type': type, 'cache-control': 'no-store', 'x-content-type-options': 'nosniff' });
  res.end(typeof body === 'string' || Buffer.isBuffer(body) ? body : JSON.stringify(body));
}

async function readJson(req) {
  let size = 0; const chunks = [];
  for await (const c of req) { size += c.length; if (size > 32 * 1024) throw Object.assign(new Error('too big'), { status: 413 }); chunks.push(c); }
  try { return JSON.parse(Buffer.concat(chunks).toString('utf8') || '{}'); }
  catch { throw Object.assign(new Error('bad json'), { status: 400 }); }
}

// Gemini first when a key is set; the demo provider on any failure. Only the error class is logged, never content.
async function withFallback(name, live, offline) {
  if (!KEY) return { ...offline(), provider: 'demo' };
  try { return { ...(await live()), provider: 'gemini' }; }
  catch (e) { console.warn(`[${name}] gemini failed (${e.name}: ${String(e.message).slice(0, 40)}); demo reply`); return { ...offline(), provider: 'demo' }; }
}

const api = {
  async 'POST /api/chat'(body) {
    const text = String(body.text || '').slice(0, 600);
    return withFallback('chat', () => gemini.chat(KEY, text, body.context), () => demo.chat(text));
  },
  async 'POST /api/menu'(body) {
    // Only titles reach the server, never the log: what Murmur learns stays on the phone.
    const info = { part: String(body.part || 'day').slice(0, 12), top: String(body.top || '').slice(0, 60),
      moved: (Array.isArray(body.moved) ? body.moved : []).slice(0, 3).map((s) => String(s).slice(0, 60)) };
    return withFallback('menu', async () => ({ say: await gemini.menuLine(KEY, info) }), () => ({ say: demo.menuLine(info) }));
  },
  // The agent's planner: the browser sends what was said and its registry; a validated plan comes back.
  async 'POST /api/plan'(body) {
    return agent.plan({ key: KEY, utterance: body.utterance, apps: agent.cleanApps(body.apps), context: { app: String(body.context?.app || '').slice(0, 30), workflows: (Array.isArray(body.context?.workflows) ? body.context.workflows : []).slice(0, 20).map((w) => String(w).slice(0, 60)) } });
  },
  async 'POST /api/live-token'() {
    if (LIVE_URL) return { token: 'test', url: LIVE_URL, model: gemini.LIVE_MODEL, voice: gemini.VOICE, persona: gemini.LIVE_PERSONA, tools: gemini.LIVE_TOOLS };
    if (!KEY || process.env.MURMUR_NO_LIVE) throw Object.assign(new Error('live unavailable'), { status: 503 });
    try { return await gemini.liveToken(KEY); }
    catch (e) { console.warn(`[live] token failed (${String(e.message).slice(0, 40)})`); throw Object.assign(new Error('live unavailable'), { status: 503 }); }
  },
  async 'POST /api/tts'(body) {
    if (!KEY) throw Object.assign(new Error('tts unavailable'), { status: 503 });
    try { return await gemini.tts(KEY, String(body.text || '').slice(0, 400)); }
    catch (e) { console.warn(`[tts] failed (${String(e.message).slice(0, 40)})`); throw Object.assign(new Error('tts unavailable'), { status: 503 }); }
  },
};
Object.assign(api, relay.api);

export const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, 'http://x');
  try {
    if (url.pathname === '/health') return send(res, 200, { ok: true, provider: PROVIDER, live: (!!KEY || !!LIVE_URL) && !process.env.MURMUR_NO_LIVE, tts: !!KEY });
    if (url.pathname === '/api/bus/stream' && req.method === 'GET') return relay.stream(req, res);
    const handler = api[`${req.method} ${url.pathname}`];
    if (handler) return send(res, 200, await handler(await readJson(req)));
    if (url.pathname.startsWith('/api/')) return send(res, 404, { error: 'not found' });
    if (req.method !== 'GET' && req.method !== 'HEAD') return send(res, 405, { error: 'method' });
    const rel = PAGES[url.pathname] || decodeURIComponent(url.pathname).replace(/^\/+/, '');
    const file = path.join(ROOT, rel);
    if (!file.startsWith(ROOT + path.sep)) return send(res, 403, 'no', 'text/plain');
    const data = await readFile(file).catch(() => null);
    if (!data) return send(res, 404, 'Not found', 'text/plain');
    res.writeHead(200, { 'content-type': TYPES[path.extname(file)] || 'application/octet-stream',
      'cache-control': 'no-cache', 'x-content-type-options': 'nosniff' });
    res.end(req.method === 'HEAD' ? undefined : data);
  } catch (e) {
    send(res, e.status || 500, { error: e.status ? e.message : 'server error' });
    if (!e.status) console.error('[server]', e.name);
  }
});

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const port = Number(process.env.PORT) || 8080;
  server.listen(port, () => console.log(`Murmur on http://localhost:${port} (provider: ${PROVIDER})`));
}
