// Dev only: the shell end to end in Chromium. PLAYWRIGHT=<pkg> node scripts/flow-os.mjs [url] [outdir]
// With no agent on the branch, a task is driven the way the runner does it: task:start, runAction per step, task:done.
import { existsSync } from 'node:fs';
const { chromium } = await import(process.env.PLAYWRIGHT || 'playwright');
const url = process.argv[2] || 'http://localhost:8080/?quiet';
const out = process.argv[3] || 'shots';
const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 390, height: 757 } });
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
// A module from a branch not merged here (no file under public/) is skipped by the shell; anything else is an error.
const absent = (u) => { try { return !existsSync(`public${new URL(u).pathname}`); } catch { return false; } };
page.on('console', (m) => { if (m.type() === 'error' && !/Failed to load resource/.test(m.text()) && !/did not load: .*imported module: (\S+)/.test(m.text())) errors.push(m.text()); });
page.on('console', (m) => { const u = /did not load: .*imported module: (\S+)/.exec(m.text())?.[1]; if (u && !absent(u)) errors.push(m.text()); });
page.on('response', (r) => { if (r.status() >= 400 && !absent(r.url())) errors.push(`${r.status()} ${r.url()}`); });
const check = (name, ok, got = '') => { console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}${got ? `: ${got}` : ''}`); if (!ok) errors.push(name); };
const ready = () => page.waitForSelector('html[data-ready="true"]');
await page.goto(url); await ready();
await page.evaluate(() => localStorage.clear());
await page.reload(); await ready();
const focused = () => page.evaluate(() => document.activeElement?.id || document.activeElement?.textContent?.trim().slice(0, 40));

const tiles = await page.locator('#board .tile').count();
check('board has a Now tile on top', await page.locator('#board li.now:first-child .tile').count() === 1, `${tiles} tiles`);
check('first open says the one onboarding line', /Tap anywhere and tell me/.test(await page.locator('#say').textContent()));

await page.locator('#board .tile').first().click();
check('a tile opens its app and focuses its heading', await page.evaluate(() => document.activeElement.tagName === 'H2' && !document.querySelector('#app-hello').hidden));
check('the place line shows', (await page.locator('#place').textContent()).length > 0, await page.locator('#place').textContent());
await page.goBack(); await page.waitForTimeout(100);
check('Back closes the app', await page.evaluate(() => !document.querySelector('#board-view').hidden && document.querySelector('#app-hello').hidden));

await page.evaluate(() => { window.murmur.open('hello'); window.murmur.home(); window.murmur.open('hello'); });
await page.waitForTimeout(300);
check('closing then opening at once keeps one Back entry', await page.evaluate(() => history.state?.d === 1 && !document.querySelector('#app-hello').hidden));
await page.goBack(); await page.waitForTimeout(100);
check('and Back still closes it', await page.evaluate(() => !document.querySelector('#board-view').hidden));

// A task the way the runner drives it.
const task = (yes) => page.evaluate(async (yes) => {
  const { runAction } = await import('/sdk/index.js');
  const { bus, registry, host } = window.murmur;
  const c = new AbortController();
  window.task = c;
  bus.emit('task:start', { task: 't1', utterance: "Tell Sam I'm ten minutes late", plan: [] });
  const ctxFor = (app) => host.ctxFor(app, c.signal);
  const a = await runAction({ registry, name: 'hello__write', params: { text: "I'm ten minutes late." }, bus, ctxFor, n: 1, of: 2 });
  window.sheetSeen = null;
  const p = runAction({ registry, name: 'hello__send', params: {}, bus, ctxFor, n: 2, of: 2 });
  await new Promise((r) => setTimeout(r, 300));
  window.sheetSeen = host.sheet.pending();
  window.earlyYes = host.sheet.yes(); // inside the 0.5 s grace: ignored
  await new Promise((r) => setTimeout(r, 300));
  if (yes) document.querySelector('#sheet-yes').click(); else document.querySelector('#sheet-no').click();
  const b = await p;
  bus.emit('task:done', { task: 't1', ms: 1800, ok: a.ok && b.ok, line: b.ok ? 'Sent to Sam.' : b.reason, undo: b.ok ? null : { label: 'the draft', until: Date.now() + 8000 } });
  return { a, b };
}, yes);

const started = page.waitForFunction(() => document.activeElement?.id === 'stop');
const run = task(true);
await started;
check('focus moves to Stop on task start', true, await page.locator('#stop').getAttribute('aria-label'));
check('the Stop bar is at least 96 px', (await page.locator('#stop').boundingBox()).height >= 96);
await page.waitForSelector('dialog[open]');
await page.screenshot({ path: `${out}/os-gate.png` });
const r = await run;
const seen = await page.evaluate(() => [window.sheetSeen, window.earlyYes]);
check('the gate sheet asked with the readback', seen[0]?.kind === 'confirm' && seen[0].gate === 'send' && /Sam/.test(seen[0].readback), seen[0]?.readback);
check('a yes in the first 0.5 s is ignored', seen[1] === false);
check('both steps verified after the tap on Send', r.a.ok && r.b.ok);
check('the Done line shows and takes focus', /Sent to Sam/.test(await page.locator('#done-line').textContent()) && (await focused()) === 'done-line');
check('ticks list both steps', (await page.locator('#ticks li.ok').count()) === 2);
await page.screenshot({ path: `${out}/os-done.png` });

const run2 = task(false);
const r2 = await run2;
check('a No on the sheet sends nothing', !r2.b.ok && r2.b.cancelled, r2.b.reason);
check('the Done line offers Undo with focus', (await focused()) === 'undo');
await page.goBack(); await page.waitForTimeout(100);
check('Back after a task goes home', await page.evaluate(() => !document.querySelector('#board-view').hidden));

// Your look is an app (build-look's), opened from the link under the board
await page.locator('#look-link').click(); await page.waitForSelector('#app-look:not([hidden])');
check('Your look opens as an app with focus on its heading', await page.evaluate(() => document.activeElement?.id === 'look-h'));
for (const k of ['speaker-murmur', 'speaker-reader', 'agency-ask', 'agency-just', 'agency-teach', 'size-more', 'theme-yellow', 'learning']) {
  check(`Your look has ${k}`, await page.locator(`#look-${k}`).count() === 1);
}
await page.locator('#look-agency-just').click(); await page.waitForTimeout(150);
check('agency reaches the shell', await page.evaluate(() => window.murmur.host.agency()) === 'just');
await page.locator('#look-speaker-reader').click(); await page.waitForTimeout(150);
check('screen reader mode makes the status region polite', await page.locator('#say').getAttribute('aria-live') === 'polite');
await page.locator('#look-speaker-murmur').click(); await page.waitForFunction(() => document.querySelector('#say').getAttribute('aria-live') === 'off', null, { timeout: 6000 }) /* in reader mode the last line holds up to 4 s for TalkBack */.catch(() => {});
const live = await page.locator('#say').getAttribute('aria-live');
check('Murmur mode turns the region off', live === 'off', live);
await page.goBack(); await page.waitForTimeout(100);
check('Back closes Your look', await page.evaluate(() => !document.querySelector('#board-view').hidden));
check('Your look is not a board tile', await page.locator('#board .tile[data-app="look"]').count() === 0);
check('Phone settings are one tap from the board', await page.locator('#phone-link').count() === 1);
const native = await page.evaluate(async () => {
  const { runAction } = await import('/sdk/index.js');
  const { bus, registry, host } = window.murmur;
  const c = new AbortController();
  const run = (name, params) => runAction({ registry, name, params, bus, ctxFor: (app) => host.ctxFor(app, c.signal) });
  const off = await run('phone__sound', { on: false });
  const muted = registry.get('phone').state().sound === false;
  const on = await run('phone__sound', { on: true });
  const where = await run('phone__where', {});
  const names = registry.tools().map((t) => t.name).filter((n) => n.startsWith('phone__') || n.startsWith('look__'));
  window.murmur.home();
  return { ok: off.ok && muted && on.ok && where.ok, names, why: JSON.stringify({ off, muted, on, where }) };
});
check('the agent reaches the shell settings as tools (phone__*, look__*)', native.ok && native.names.includes('phone__noLook') && native.names.includes('phone__stop') && native.names.some((n) => n.startsWith('look__')), native.why);

// Demo controls: three taps on the day (build-look's panel)
for (let i = 0; i < 3; i++) await page.locator('#day').click();
check('three taps on the day open the demo controls', await page.locator('#demo-panel').isVisible());
await page.locator('#demo-reset').click(); await page.waitForTimeout(300);
check('reset empties the hello app', await page.evaluate(() => window.murmur.registry.get('hello').state().draft === ''));

// 400%
await page.goto(url.replace('?quiet', '?quiet&zoom=4')); await ready();
await page.locator('#board .tile').first().click();
const wide = await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1);
check('400% reflows without sideways scroll', wide);
await page.screenshot({ path: `${out}/os-400.png` });

check('no page errors', !errors.length, errors.join(' | '));
await browser.close();
process.exit(errors.length ? 1 : 0);
