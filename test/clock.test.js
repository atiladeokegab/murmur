import test from 'node:test';
import assert from 'node:assert/strict';
import { createBus, createRegistry, createCtx, appKv, mountApp, runAction } from '../public/sdk/index.js';
import { browserKV } from '../public/ports/browser-kv.js';
import { demoPlan } from '../public/agent/demo-plan.js';
import { describeRegistry } from '../public/agent/plan.js';
import clock, { env, lengthOf, timeOf, words } from '../public/apps/clock/index.js';
import appIds from '../public/apps/apps.js';
import { fakeDocument, fakeStorage } from './fake-dom.js';

// A fake clock: Saturday 7 Nov 2026, 14:41 local, and timers that fire only on advance(ms).
const T0 = new Date(2026, 10, 7, 14, 41).getTime();
let now = T0, due = [], dings = 0;
Object.assign(env, {
  now: () => now,
  after: (ms, fn) => { const t = { at: now + ms, fn }; due.push(t); return t; },
  cancel: (t) => { due = due.filter((x) => x !== t); },
  ding: () => { dings++; },
});
const advance = (ms) => { now += ms; for (const t of due.filter((x) => x.at <= now)) { due = due.filter((x) => x !== t); t.fn(); } };

async function phone() {
  now = T0; due = []; dings = 0;
  const doc = fakeDocument(), bus = createBus(), registry = createRegistry();
  registry.register(clock);
  const kv = appKv('clock', browserKV({ storage: fakeStorage(), prefix: 'murmur' }));
  const root = await mountApp(clock, doc.body, { kv, bus, say: (text) => bus.emit('say', { text }) });
  await clock.reset();
  const ctxFor = (app) => createCtx({ app, root, bus, kv, cursor: { async moveTo() {}, hide() {} }, ask: async () => false, signal: new AbortController().signal });
  const run = (name, params) => runAction({ registry, name, params, bus, ctxFor, n: 1, of: 1 });
  const said = () => bus.log.filter((e) => e.name === 'say').map((e) => e.payload?.text ?? e.text);
  return { root, run, said, registry, s: () => clock.state() };
}

test('clock: on the board, a real heading, nothing gated', async () => {
  assert.ok(appIds.includes('clock'));
  const { root } = await phone();
  assert.equal(root.querySelector('h2').textContent, 'Clock');
  for (const [k, a] of Object.entries(clock.actions)) assert.equal(a.gate, null, k);
});

test('clock: lengths and times as said', () => {
  assert.equal(lengthOf('10 minutes'), 6e5);
  assert.equal(lengthOf('ten minutes'), 6e5);
  assert.equal(lengthOf('half an hour'), 18e5);
  assert.equal(lengthOf('an hour and a half'), 54e5);
  assert.equal(lengthOf('twenty five minutes'), 15e5);
  assert.equal(lengthOf('soon'), 0);
  assert.equal(words(54e5), '1 hour 30 minutes');
  assert.deepEqual(timeOf('7'), { h: 7, m: 0 });
  assert.deepEqual(timeOf('6:30 pm'), { h: 18, m: 30 });
  assert.deepEqual(timeOf('seven'), { h: 7, m: 0 });
  assert.equal(timeOf('later'), null);
});

test('clock: set a 10 minute timer, how long is left, and it ends with the earcon and a line', async () => {
  const p = await phone();
  assert.equal((await p.run('clock__setTimer', { length: '10 minutes' })).ok, true);
  assert.equal(p.said().at(-1), 'Timer set: 10 minutes.');
  advance(4 * 6e4);
  assert.equal((await p.run('clock__timeLeft', {})).ok, true);
  assert.equal(p.said().at(-1), '6 minutes left on your 10 minute timer.');
  advance(6 * 6e4 - 1);
  assert.equal(dings, 0, 'not a millisecond early');
  advance(1);
  assert.equal(dings, 1);
  assert.equal(p.said().at(-1), "Time's up. Your 10 minute timer is done.");
  assert.equal(p.s().timer, null);
  assert.equal((await p.run('clock__setTimer', { length: 'soon' })).ok, false, 'not a length');
});

test('clock: cancel says what it cancelled, and the earcon never fires', async () => {
  const p = await phone();
  await p.run('clock__setTimer', { length: 'half an hour' });
  assert.equal((await p.run('clock__cancelTimer', {})).ok, true);
  assert.equal(p.said().at(-1), 'Cancelled your 30 minute timer.');
  advance(36e5);
  assert.equal(dings, 0);
  assert.equal((await p.run('clock__cancelTimer', {})).ok, false, 'nothing to cancel');
});

test('clock: wake me at 7 sets 7 am tomorrow and rings then; the time is said', async () => {
  const p = await phone();
  assert.equal((await p.run('clock__setAlarm', { time: '7' })).ok, true);
  assert.equal(p.said().at(-1), 'Alarm set for 7 am.');
  advance(new Date(2026, 10, 8, 7, 0).getTime() - now);
  assert.equal(dings, 1);
  assert.equal(p.said().at(-1), "Good morning. It's 7 am.");
  assert.equal((await p.run('clock__time', {})).ok, true);
  assert.equal(p.said().at(-1), "It's 7 am.");
});

test('clock: every say phrase plans to its own clock__ tool', async () => {
  const { registry } = await phone();
  const apps = describeRegistry(registry);
  for (const [k, a] of Object.entries(clock.actions)) {
    assert.deepEqual(demoPlan(a.say, apps).plan.map((x) => x.tool), [`clock__${k}`], a.say);
  }
  assert.deepEqual(demoPlan('Set a timer for 10 minutes', apps).plan[0].params, { length: '10 minutes' });
  assert.deepEqual(demoPlan('Wake me at 7', apps).plan[0].params, { time: '7' });
});
