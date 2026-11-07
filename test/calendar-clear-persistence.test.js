// Calendar clear: exercise the real SDK action against persistence failure and latency.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createBus, createRegistry, createCtx, mountApp, runAction } from '../public/sdk/index.js';
import { fakeDocument } from './fake-dom.js';
import calendar from '../public/apps/calendar/index.js';

function memoryKV() {
  const values = new Map();
  let mode = 'normal', pending = null;
  return {
    async get(key) { return structuredClone(values.get(key)); },
    set(key, value) {
      if (mode === 'reject') {
        const write = Promise.reject(new Error('storage denied'));
        write.catch(() => {}); // Let the behavior assertion inspect failure without an unhandled-rejection side channel.
        return write;
      }
      if (mode === 'defer') return new Promise((resolve) => { pending = () => {
        if (value === undefined) values.delete(key); else values.set(key, structuredClone(value));
        pending = null;
        resolve();
      }; });
      if (value === undefined) values.delete(key); else values.set(key, structuredClone(value));
      return Promise.resolve();
    },
    mode(value) { mode = value; },
    pending() { return !!pending; },
    finish() { assert.ok(pending, 'a persistence write is pending'); pending(); },
  };
}

async function mount(kv, { confirm = async () => true } = {}) {
  const doc = fakeDocument(), bus = createBus(), registry = createRegistry();
  const said = [];
  registry.register(calendar);
  const root = await mountApp(calendar, doc.body, { kv, bus, confirm, say: async (text) => { said.push(text); } });
  await calendar.seed();
  const ctxFor = (app) => createCtx({ app, root, bus, kv, cursor: { async moveTo() {}, hide() {} },
    ask: async () => true, signal: new AbortController().signal });
  const run = () => runAction({ registry, name: 'calendar__clear', params: {}, bus, ctxFor });
  return { root, run, bus, said, s: () => calendar.state() };
}

async function seeded() {
  const kv = memoryKV();
  const p = await mount(kv);
  await calendar.reset();
  return { ...p, kv };
}

async function remount(kv) {
  const p = await mount(kv);
  return p.s().events;
}

test('a failed clear write cannot report success or lose the stored events', async () => {
  const p = await seeded();
  const before = p.s().events;
  p.kv.mode('reject');

  const result = await p.run();
  assert.equal(result.ok, false, 'a task cannot verify a clear that was not saved');
  assert.match(result.reason, /couldn't save.*nothing was deleted/i);
  assert.equal(p.bus.log.filter((e) => e.name === 'step:verified').length, 0);
  assert.deepEqual(p.s().events, before, 'failed persistence leaves the current calendar intact');

  p.kv.mode('normal');
  assert.deepEqual(await remount(p.kv), before, 'the prior calendar remains after reload');
});

test('a clear waits for its write before success and stays empty after reload', async () => {
  const p = await seeded();
  p.kv.mode('defer');
  let settled = false;
  const running = p.run().then((result) => { settled = true; return result; });

  for (let i = 0; i < 100 && !p.kv.pending(); i++) await new Promise((resolve) => setImmediate(resolve));
  assert.ok(p.kv.pending(), 'the clear reached persistence');
  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(settled, false, 'success waits for the storage write');

  p.kv.finish();
  const result = await running;
  assert.equal(result.ok, true);
  assert.deepEqual(p.s().events, []);
  p.kv.mode('normal');
  assert.deepEqual(await remount(p.kv), [], 'the empty calendar survives reload');
});

test('a trusted manual No leaves the calendar unchanged', async () => {
  const asked = [];
  const p = await seeded();
  // Re-mount with the hand-tap confirmation hook, as the shell supplies it.
  const manual = await mount(p.kv, { confirm: async (q) => { asked.push(q); return false; } });
  const before = manual.s().events;
  manual.root.querySelector('#cal-clear').dispatchEvent({ type: 'click', isTrusted: true });
  await new Promise((resolve) => setImmediate(resolve));

  assert.deepEqual(asked, [{ gate: 'delete', readback: 'Delete all 3 events from your calendar?' }]);
  assert.deepEqual(manual.s().events, before);
});

test('a trusted manual clear reports a failed write without deleting events', async () => {
  const p = await seeded();
  const manual = await mount(p.kv);
  const before = manual.s().events;
  p.kv.mode('reject');

  manual.root.querySelector('#cal-clear').dispatchEvent({ type: 'click', isTrusted: true });
  await new Promise((resolve) => setImmediate(resolve));
  assert.deepEqual(manual.s().events, before);
  assert.deepEqual(manual.said, ["I couldn't save that, so nothing was deleted."]);

  p.kv.mode('normal');
  assert.deepEqual(await remount(p.kv), before);
});
