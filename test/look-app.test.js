import test from 'node:test';
import assert from 'node:assert/strict';
import { createBus, createRegistry, createCtx, appKv, mountApp, runAction, controlName } from '../public/sdk/index.js';
import { browserKV } from '../public/ports/browser-kv.js';
import { createToolkit } from '../public/vendor/toolkit/index.js';
import { readLook } from '../public/look.js';
import look, { settings, routeSay, onSettings } from '../public/apps/look/index.js';
import { fakeDocument, fakeStorage } from './fake-dom.js';

// One phone with Your look mounted, a real Librarian on a fake localStorage, and a scripted ask-first sheet.
const doc = fakeDocument();
const bus = createBus();
const registry = createRegistry();
registry.register(look);
const port = browserKV({ storage: fakeStorage(), prefix: 'murmur' });
const { librarian, datastore } = createToolkit({ kv: browserKV({ storage: fakeStorage() }) });
await datastore.runMigrations();
const said = [];
const root = await mountApp(look, doc.body, { kv: appKv('look', port), bus, librarian, datastore, say: async (text) => { said.push(text); } });
await look.seed();
const answers = [];
const asked = [];
const taps = [];
const ctxFor = (app) => createCtx({ app, root, bus, kv: appKv(app.id, port), cursor: { async moveTo(el, n) { taps.push(n); }, hide() {} },
  ask: async (q) => { asked.push(q); return answers.shift() ?? false; } });
const run = (name, params = {}) => runAction({ registry, name, params, bus, ctxFor });

test('every action is declared with doing, describe and hint, and the tools exist', () => {
  for (const [k, a] of Object.entries(look.actions)) {
    for (const f of ['describe', 'doing', 'hint']) assert.ok(a[f], `${k}.${f}`);
    const words = a.doing.split(/\s+/).length;
    assert.ok(words >= 2 && words <= 5, `${k}.doing is 2 to 5 words`);
  }
  const names = registry.tools().map((t) => t.name);
  for (const n of ['look__textBigger', 'look__whoSpeaks', 'look__howMuch', 'look__learning', 'look__whatYouKnow', 'look__forget']) assert.ok(names.includes(n), n);
  assert.match(registry.tools().find((t) => t.name === 'look__forget').description, /asked first: delete/);
});

test('rows are real buttons that name their current value', () => {
  assert.equal(controlName(root.querySelector('#look-size-more')), 'Text: bigger. Now 100 percent');
  assert.equal(root.querySelector('#look-size-less').getAttribute('aria-disabled'), 'true');
  assert.equal(root.querySelector('#look-speaker-murmur').getAttribute('aria-pressed'), 'true');
  assert.equal(root.querySelector('#look-theme-auto').getAttribute('aria-pressed'), 'true', 'a fresh profile chooses no colours: it follows the phone');
  assert.equal(root.querySelector('h2').textContent, 'Your look');
});

test('text bigger applies on touch, says itself, and stops at 400 percent', async () => {
  assert.equal((await run('look__textBigger')).ok, true);
  assert.equal(settings().size, 150);
  assert.ok(!said.includes('Text: bigger. Now 150 percent.'), "the agent's press is quiet: its done line says the change");
  root.querySelector('#look-size-less').click(); // a tap by hand says itself
  await new Promise((r) => setTimeout(r, 10));
  assert.equal(said.at(-1), 'Text: smaller. Now 100 percent.');
  assert.equal((await run('look__setText', { percent: 400 })).ok, true);
  assert.equal(controlName(root.querySelector('#look-size-more')), 'Text: bigger. Now 400 percent');
  const r = await run('look__textBigger');
  assert.equal(r.ok, false);
  assert.match(r.reason, /isn't available/);
  assert.equal((await run('look__setText', { percent: 200 })).ok, true);
  assert.equal((await readLook(librarian)).size, 200, 'written to the toolkit ability profile');
  assert.equal(look.state().size, 200);
});

test('colours, voice speed and how much Murmur does are voice actions verified by state', async () => {
  const seen = [];
  const off = onSettings((s) => seen.push(s.theme));
  assert.equal((await run('look__colours', { colours: 'yellow' })).ok, true);
  off();
  assert.deepEqual(seen, ['yellow']);
  assert.ok(!said.includes('Colours: Yellow on black.'));
  assert.equal((await run('look__voiceFaster')).ok, true);
  assert.equal(settings().rate, 1.25);
  assert.equal((await run('look__howMuch', { mode: 'teach' })).ok, true);
  assert.equal(settings().agency, 'teach');
  assert.equal((await run('look__howMuch', { mode: 'loud' })).ok, false, 'an unknown mode is refused by the schema');
});

test('who speaks: in screen-reader mode Murmur is silent and the one status region is live; never both', async () => {
  const status = doc.createElement('div');
  const spoken = [];
  const speak = async (t) => { spoken.push(t); };
  await routeSay('Murmur talks', { speak, status });
  assert.deepEqual([spoken, status.getAttribute('aria-live')], [['Murmur talks'], 'off']);
  assert.equal((await run('look__whoSpeaks', { who: 'reader' })).ok, true);
  await routeSay('Sent.', { speak, status });
  assert.deepEqual(spoken, ['Murmur talks'], 'no audio in screen-reader mode');
  assert.deepEqual([status.textContent, status.getAttribute('aria-live')], ['Sent.', 'polite']);
  await run('look__whoSpeaks', { who: 'murmur' });
});

test('stop learning pauses the Librarian; what do you know reads memory in plain words; forget asks first', async () => {
  await librarian.logObservation({ type: 'agent-task', data: { app: 'messages', success: true }, text: 'messages' });
  await librarian.logObservation({ type: 'agent-task', data: { app: 'messages', success: true }, text: 'messages' });
  assert.equal((await run('look__learning', { on: false })).ok, true);
  assert.equal((await librarian.getProfile()).memoryPaused, true);
  assert.deepEqual(await librarian.logObservation({ type: 'agent-task', data: { app: 'transit' } }), { logged: false, reason: 'paused' });
  assert.equal((await run('look__whatYouKnow')).ok, true);
  assert.match(look.state().known[0], /^Messages: 2 times, mostly (in the|at) /);
  assert.ok(said.includes('I know one thing. Say forget that to remove the first.'));
  answers.push(false);
  const no = await run('look__forget');
  assert.equal(no.cancelled, true);
  assert.match(asked.at(-1).readback, /^Forget this: Messages: 2 times/);
  assert.equal(look.state().known.length, 1, 'a no forgets nothing');
  answers.push(true);
  assert.equal((await run('look__forget')).ok, true);
  assert.deepEqual(look.state().known, []);
  assert.equal((await datastore.get('mine.episodicLog')).entries.length, 0);
  await run('look__learning', { on: true });
  assert.equal((await librarian.getProfile()).memoryPaused, false);
});

test('reset puts every row back to its default', async () => {
  await look.reset();
  assert.deepEqual(settings(), { size: 100, rate: 1.15, theme: 'auto', speaker: 'murmur', agency: 'ask', learning: true });
  assert.equal(look.state().known, null);
  assert.match(look.read(), /^Your look\. Text 100 percent, colours match my phone/);
});
