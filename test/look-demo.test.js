globalThis.webkitSpeechRecognition ||= function Rec() {}; // the phone can hear: the welcome is the talking one
import test from 'node:test';
import assert from 'node:assert/strict';
import { createBus, createRegistry, createCtx, appKv, mountApp, runAction, loadApps } from '../public/sdk/index.js';
import { browserKV } from '../public/ports/browser-kv.js';
import look from '../public/apps/look/index.js';
import { createDemo, bindDemo, CONTROLS } from '../public/os/demo/index.js';
import { firstOpen, rearm, FIRST_WORDS } from '../public/os/onboard/index.js';
import { fakeDocument, fakeStorage } from './fake-dom.js';

const memKv = () => { const m = new Map(); return { get: async (k) => m.get(k), set: async (k, v) => (v === undefined ? m.delete(k) : m.set(k, v)) }; };

async function phone() {
  const doc = fakeDocument();
  const docListeners = {};
  doc.addEventListener = (t, fn) => (docListeners[t] ||= []).push(fn);
  doc.keyEv = (e) => (docListeners.keydown || []).forEach((fn) => fn({ target: doc.body, ...e }));
  doc.key = (key) => doc.keyEv({ key });
  const bus = createBus(), registry = createRegistry();
  await loadApps(registry, ['hello']);
  registry.register(look);
  const port = browserKV({ storage: fakeStorage(), prefix: 'murmur' });
  const roots = {};
  for (const app of registry.list()) { roots[app.id] = await mountApp(app, doc.body, { kv: appKv(app.id, port), bus, say: (text) => bus.emit('say', { text }) }); await app.seed(); }
  const ctxFor = (app) => createCtx({ app, root: roots[app.id], bus, kv: appKv(app.id, port), cursor: { async moveTo() {}, hide() {} }, ask: async () => true });
  const run = (name, params, n, of) => runAction({ registry, name, params, bus, ctxFor, n, of });
  const said = [], board = { day: 7, async reset() { this.day = 1; }, async nextMorning() { this.day++; } };
  const onboard = { kv: memKv() };
  const demo = createDemo({ registry, bus, run, board, onboard, say: async (t) => said.push(t) });
  return { doc, bus, registry, run, demo, board, onboard, said };
}

test('first open says one sentence, only once, and reset re-arms it', async () => {
  const kv = memKv(), said = [];
  const say = async (t) => said.push(t);
  assert.equal(await firstOpen({ kv, say }), true);
  assert.equal(await firstOpen({ kv, say }), false);
  assert.deepEqual(said, [FIRST_WORDS]);
  assert.equal(FIRST_WORDS, "Hi, I'm Murmur. I run this phone for you by voice. Tap anywhere and speak. Try saying: read my messages.");
  await rearm({ kv });
  assert.equal(await firstOpen({ kv, say }), true);
});

test('reset puts every app and the board back, and re-arms first open', async () => {
  const { demo, run, registry, board, onboard, said } = await phone();
  await run('hello__write', { text: 'late' });
  await run('look__textBigger', {});
  await firstOpen({ kv: onboard.kv, say: async () => {} });
  await demo.reset();
  assert.equal(registry.get('hello').state().draft, '');
  assert.equal(registry.get('look').state().size, 100);
  assert.equal(board.day, 1);
  assert.equal(await onboard.kv.get('said'), undefined);
  assert.equal(said.at(-1), 'Reset. Day 1.');
});

test('next morning moves the board on a day; mode flips who speaks through the look action', async () => {
  const { demo, board, registry, bus, said } = await phone();
  await demo.nextMorning();
  assert.equal(board.day, 8);
  await demo.mode();
  assert.equal(registry.get('look').state().speaker, 'reader');
  assert.ok(bus.log.some((e) => e.name === 'step:verified' && e.action === 'look__whoSpeaks'));
  assert.deepEqual(said.filter((t) => /speaks|Who speaks/.test(t)), ['My screen reader speaks.'], 'Mode says its row once');
  await demo.mode();
  assert.equal(registry.get('look').state().speaker, 'murmur');
  assert.equal(said.at(-1), 'Murmur speaks.');
});

test('replay re-runs the last task plan, gates included', async () => {
  const { demo, bus, registry, said } = await phone();
  await demo.replay();
  assert.equal(said.at(-1), 'Nothing to replay yet.');
  bus.emit('task:start', { task: 't-1', utterance: 'text Sam', plan: [{ name: 'hello__write', params: { text: 'On my way' } }, { name: 'hello__send', params: {} }] });
  await demo.replay();
  assert.deepEqual(registry.get('hello').state().sent, ['On my way']);
  assert.ok(bus.log.some((e) => e.name === 'confirm' && e.gate === 'send'), 'the replayed send still asked');
});

test('the panel opens on three taps on the clock or Shift+D, and 1 to 4 run the controls', async () => {
  const { doc } = await phone();
  const clock = doc.createElement('time'); doc.body.append(clock);
  const ran = [];
  const spy = Object.fromEntries(CONTROLS.map((c) => [c.key, async () => ran.push(c.key)]));
  let t = 0;
  const { panel } = bindDemo(clock, spy, { now: () => t });
  assert.equal(panel.hidden, true);
  assert.equal(panel.getAttribute('role'), 'dialog');
  clock.click(); t += 1000; clock.click(); t += 1000; clock.click();
  assert.equal(panel.hidden, true, 'three slow taps do nothing');
  t += 100; clock.click();
  assert.equal(panel.hidden, false, 'three taps inside 1.5 s open it');
  assert.equal(doc.activeElement.textContent, '1. Reset');
  doc.key('2');
  assert.equal(panel.hidden, true, 'a control closes the panel first');
  doc.key('2');
  assert.deepEqual(ran, ['nextMorning'], 'number keys do nothing while the panel is shut');
  doc.keyEv({ key: 'D', shiftKey: true }); doc.key('4');
  doc.keyEv({ key: 'D', shiftKey: true }); panel.querySelector('#demo-mode').click();
  doc.keyEv({ key: 'D', shiftKey: true }); doc.key('5');
  await new Promise((r) => setTimeout(r, 0));
  assert.deepEqual(ran, ['nextMorning', 'replay', 'mode', 'planner']);
});
