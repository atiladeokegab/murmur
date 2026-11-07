import test from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { readFile } from 'node:fs/promises';
import { resolve, sep } from 'node:path';
import { installProbe } from './probe.js';
import { checkTrace } from './check.js';

const html = `<!doctype html><meta charset="utf-8"><main id="host"></main><script type="module">
import { createBus, createRegistry, createCtx, createCursor, appKv, mountApp, runAction } from '/sdk/index.js';
import hello from '/apps/hello/index.js';
const bus = createBus(), registry = createRegistry(); registry.register(hello);
const taskBus = { on: (...args) => bus.on(...args), emit: (name, event = {}) => bus.emit(name, { task: 't-probe-sdk', ...event }) };
const kv = appKv('hello'), cursor = createCursor(document);
const root = await mountApp(hello, document.querySelector('#host'), { bus: taskBus, kv, say() {} });
await hello.reset();
let pending = null;
const host = { ask({ app, gate, readback }) { return new Promise((resolve) => {
  const dialog = document.createElement('dialog'); dialog.id = 'sheet';
  const line = document.createElement('p'); line.textContent = readback;
  dialog.append(line, ...['Send', 'No'].map((label, i) => { const button = document.createElement('button'); button.className = i ? 'choice no' : 'choice yes'; button.textContent = label; return button; }));
  document.body.append(dialog); pending = { kind: 'confirm', app, gate, readback };
  dialog.querySelector('.yes').addEventListener('click', () => { dialog.close(); pending = null; resolve(true); });
  dialog.querySelector('.no').addEventListener('click', () => { dialog.close(); pending = null; resolve(false); });
  dialog.showModal();
}); } };
const ctxFor = (app) => createCtx({ app, root, bus: taskBus, kv, cursor, ask: (q) => host.ask(q) });
const run = (name, params) => runAction({ registry, name, params, bus: taskBus, ctxFor });
window.murmur = { bus, registry, host, sheet: { pending: () => pending }, ready: Promise.resolve(), agent: { hear: (text) => run('hello__write', { text }) } };
window.probeAppOs = { bus: taskBus, kv, say() {} }; window.probeAppRoot = root;
window.evalRun = run;
</script>`;

async function browserPackage() {
  const moduleName = process.env.PLAYWRIGHT || 'playwright';
  try { return await import(moduleName); }
  catch (error) { throw new Error(`Set PLAYWRIGHT to the installed Playwright module (${moduleName}): ${error.message}`); }
}

test('probe records real SDK action, delayed verification, new confirmation sheet, and a blocked real control', { timeout: 20000 }, async () => {
  const { chromium } = await browserPackage();
  const root = resolve(import.meta.dirname, '../../public');
  const serverErrors = [];
  const server = http.createServer(async (req, res) => {
    try {
      const url = new URL(req.url, 'http://127.0.0.1');
      if (url.pathname === '/probe.html') { res.writeHead(200, { 'content-type': 'text/html' }); return res.end(html); }
      const file = resolve(root, `.${decodeURIComponent(url.pathname)}`);
      if (!file.startsWith(root + sep)) { res.writeHead(403); return res.end(); }
      const data = await readFile(file);
      const type = file.endsWith('.js') ? 'text/javascript' : 'application/octet-stream';
      res.writeHead(200, { 'content-type': type }); res.end(data);
    } catch (error) { serverErrors.push(String(error?.stack || error)); res.writeHead(404); res.end(); }
  });
  await new Promise((resolve, reject) => { server.once('error', reject); server.listen(0, '127.0.0.1', resolve); });
  const browser = await chromium.launch({ headless: true });
  try {
    const page = await browser.newPage();
    const errors = [];
    const requests = [];
    page.on('pageerror', (error) => errors.push(error.message));
    page.on('requestfailed', (request) => requests.push(`${request.url()}: ${request.failure()?.errorText}`));
    page.on('response', (response) => { if (response.status() >= 400) requests.push(`${response.status()} ${response.url()}`); });
    await page.goto(`http://127.0.0.1:${server.address().port}/probe.html`, { waitUntil: 'load' });
    try { await installProbe(page); }
    catch (error) { throw new Error(`${error.message}; page errors: ${errors.join(' | ')}; failed requests: ${requests.join(' | ')}; server errors: ${serverErrors.join(' | ')}`); }

    await page.evaluate(() => {
      const action = window.murmur.registry.get('hello').actions.write;
      const verify = action.verify;
      action.verify = function (...args) { return new Promise((resolve, reject) => setTimeout(() => {
        try { resolve(verify.apply(this, args)); } catch (error) { reject(error); }
      }, 100)); };
      window.pendingRun = window.murmur.agent.hear('Write a message');
      window.murmur.bus.emit('step:start', { task: 'later-task', action: 'other__wait', app: 'other', n: 1, of: 1, params: {}, gate: null });
    });
    await page.waitForFunction(() => window.__eval.trace.some((item) => item.kind === 'verify'));
    const first = await page.evaluate(async () => ({ trace: window.__eval.trace, state: window.__eval.snapshot(), result: await window.pendingRun }));
    const started = first.trace.find((item) => item.kind === 'bus' && item.name === 'step:start' && item.action === 'hello__write');
    const verified = first.trace.find((item) => item.kind === 'verify' && item.action === 'hello__write');
    assert.ok(started && verified, 'the SDK emitted a start and invoked the app verifier');
    assert.equal(verified.scope, started.scope, 'an async verify retains its initiating step after another step starts');
    assert.deepEqual(first.state.hello, { draft: 'Write a message', sent: [], lastSent: null });
    assert.equal(first.result.ok, true);
    assert.deepEqual(checkTrace(first.trace, { requiresVerifiedStep: true }), []);

    await page.evaluate(() => window.__eval.clear());
    await page.evaluate(() => { window.pendingRun = window.evalRun('hello__send', {}); });
    await page.waitForFunction(() => document.querySelector('#sheet')?.open === true);
    await page.waitForTimeout(600);
    assert.equal(await page.locator('#sheet p').textContent(), 'Send to Sam: Write a message');
    await page.locator('#sheet .yes').click();
    const sent = await page.evaluate(async () => { const result = await window.pendingRun; return { trace: window.__eval.trace, state: window.__eval.snapshot(), result }; });
    const gate = sent.trace.find((item) => item.kind === 'gate:open');
    const confirm = sent.trace.find((item) => item.kind === 'bus' && item.name === 'confirm' && item.result === true);
    const readback = sent.trace.find((item) => item.kind === 'readback');
    assert.ok(gate && confirm, 'the dynamically-created real sheet opened and confirmed');
    assert.equal(gate.scope, confirm.scope);
    assert.ok(readback?.same, 'the readback matched the actual registered action readback');
    assert.ok(gate.at <= confirm.at && confirm.at - gate.at >= 500);
    assert.equal(sent.state.hello.lastSent, 'Write a message', JSON.stringify({ state: sent.state, trace: sent.trace }));
    assert.equal(sent.result.ok, true, JSON.stringify(sent.trace));
    assert.deepEqual(checkTrace(sent.trace, { requiresVerifiedStep: true }), []);

    await page.evaluate(() => window.__eval.clear());
    await page.evaluate(() => window.__eval.breakControl('[data-app="hello"] textarea'));
    await page.evaluate(async () => {
      const app = window.murmur.registry.get('hello');
      document.querySelector('[data-app="hello"] textarea').remove();
      await app.mount(window.probeAppRoot, window.probeAppOs);
    });
    await page.evaluate(() => { window.pendingRun = window.murmur.agent.hear('Write an update'); });
    await page.waitForFunction(() => window.__eval.trace.some((item) => item.kind === 'fault'));
    const broken = await page.evaluate(async () => { const result = await window.pendingRun; return { trace: window.__eval.trace, state: window.__eval.snapshot(), result }; });
    assert.equal(broken.state.hello.draft, 'Write a message', JSON.stringify({ trace: broken.trace, result: broken.result, state: broken.state }));
    assert.equal(broken.result.ok, false);
    assert.ok(broken.trace.some((item) => item.kind === 'bus' && item.name === 'step:failed'));
    assert.ok(!broken.trace.some((item) => item.kind === 'bus' && item.name === 'step:verified'));
    assert.deepEqual(checkTrace(broken.trace, { fault: 'block-reply-input' }), []);
    assert.deepEqual(errors, []);

    await page.evaluate(() => window.murmur.bus.emit('say', { kind: 'verify', name: 'step:verified', text: 'fixture' }));
    const forged = await page.evaluate(() => window.__eval.trace.at(-1));
    assert.equal(forged.kind, 'bus');
    assert.equal(forged.name, 'say');
    assert.equal(forged.text, 'fixture');
  } finally {
    await browser.close();
    await new Promise((resolve) => server.close(resolve));
  }
});
