// npm run smoke: unit tests, then the real server on the demo provider. Non-zero exit on any failure.
import { spawnSync, spawn } from 'node:child_process';
import { readdirSync } from 'node:fs';
import assert from 'node:assert/strict';

const t0 = Date.now();
const tests = readdirSync('test').filter((f) => f.endsWith('.test.js')).map((f) => `test/${f}`);
const run = spawnSync(process.execPath, ['--test', ...tests], { stdio: 'inherit', timeout: 60000 });
if (run.status !== 0) { console.error(`smoke: unit tests failed (${run.status})`); process.exit(1); }

const port = 18000 + Math.floor(Math.random() * 1000);
const env = { ...process.env, PORT: String(port) };
delete env.GEMINI_API_KEY;
const server = spawn(process.execPath, ['server.js'], { env, stdio: ['ignore', 'pipe', 'inherit'] });
const base = `http://localhost:${port}`;
const get = (p, init) => fetch(base + p, { ...init, signal: AbortSignal.timeout(5000) });
const post = (p, body) => get(p, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });

// A real boot: unit tests and fetches missed a TDZ that stopped the shell. Playwright from PLAYWRIGHT or the npx cache.
async function browserBoot() {
  let pw;
  for (const p of [process.env.PLAYWRIGHT, '/home/atilade/.npm/_npx/e41f203b7505f1fb/node_modules/playwright/index.mjs', 'playwright']) {
    if (!p) continue;
    try { pw = await import(p); break; } catch { /* try the next */ }
  }
  if (!pw) { console.log('smoke: SKIPPED the browser boot (no Playwright found)'); return; }
  const browser = await pw.chromium.launch();
  try {
    const page = await browser.newPage({ viewport: { width: 390, height: 757 } });
    const errors = [];
    page.on('pageerror', (e) => errors.push(e.message));
    await page.goto(`${base}/?quiet`);
    await page.waitForSelector('html[data-ready="true"]', { timeout: 10000 }).catch(() => errors.push('never ready'));
    assert.deepEqual(errors, [], 'the shell boots in a browser with no page errors');
    // Mirror privacy: a hidden (or display:none) Writer draft never appears in a frame; what is on screen does.
    const leak = await page.evaluate(async () => {
      const { frameOf } = await import('/os/mirror.js');
      const pane = Object.assign(document.createElement('section'), { id: 'app-writer-test', hidden: true });
      const off = Object.assign(document.createElement('div'), { style: 'display:none' });
      const a = document.createElement('textarea'), b = document.createElement('div');
      a.value = 'SECRET-DRAFT-1'; b.contentEditable = 'true'; b.textContent = 'SECRET-DRAFT-2';
      pane.append(a); off.append(b);
      const shown = Object.assign(document.createElement('p'), { textContent: 'VISIBLE-LINE' });
      document.body.append(pane, off, shown);
      const f = frameOf(document); pane.remove(); off.remove(); shown.remove();
      return { leaked: /SECRET-DRAFT/.test(f.html), shown: f.html.includes('VISIBLE-LINE') };
    });
    assert.deepEqual(leak, { leaked: false, shown: true }, 'a hidden draft never leaves the phone in a mirror frame');
    console.log('smoke: browser boot ok');
  } finally { await browser.close(); }
}

try {
  for (let i = 0; ; i++) {
    try { await get('/health'); break; } catch { if (i > 50) throw new Error('server did not start'); await new Promise((r) => setTimeout(r, 100)); }
  }
  assert.deepEqual(await (await get('/health')).json(), { ok: true, provider: 'demo', live: false, tts: false });
  assert.equal((await post('/api/live-token', {})).status, 503, 'no live without a key');
  assert.equal((await post('/api/tts', { text: 'hi' })).status, 503, 'no tts without a key');
  const menu = await (await post('/api/menu', { part: 'evening', top: 'Read my notes', moved: ['Order beans'] })).json();
  assert.match(menu.say, /^Evening\. Order beans moved up/);
  const chat = await (await post('/api/chat', { text: 'order my usual beans' })).json();
  assert.deepEqual(chat.action, { type: 'pay', item: 'beans' });
  assert.equal(chat.provider, 'demo');
  const page = await get('/');
  assert.equal(page.status, 200);
  assert.match(await page.text(), /Tap to talk/);
  const race = await get('/race');
  assert.equal(race.status, 200);
  assert.match(await race.text(), /Start both/);
  for (const p of ['/os/shell.js', '/os/gate.js', '/os/wire.js', '/sound/index.js', '/os/panel.js', '/app.js', '/app.css', '/race.js', '/lib/race.js', '/lib/gestures.js', '/look.js', '/ports/browser-kv.js', '/vendor/toolkit/index.js', '/fonts/martian-mono.woff2']) {
    assert.equal((await get(p)).status, 200, p);
  }
  assert.equal((await get('/../server.js')).status !== 200, true, 'no path traversal');
  assert.equal((await get('/%2e%2e/server.js')).status !== 200, true, 'no encoded traversal');
  assert.equal((await post('/api/chat', 'x'.repeat(40000))).status, 413);
  await browserBoot();
  console.log(`smoke: ok in ${((Date.now() - t0) / 1000).toFixed(1)} s`);
} catch (e) {
  console.error('smoke: FAILED', e.message);
  process.exitCode = 1;
} finally {
  server.kill();
}
