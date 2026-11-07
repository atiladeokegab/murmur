import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createBus, createRegistry, createCtx, mountApp, runAction } from '../public/sdk/index.js';
import { createPhone } from '../public/os/phone.js';
import { fakeDocument } from './fake-dom.js';

test('phone: the shell settings are tools the runner can press and verify', async () => {
  const doc = fakeDocument(), bus = createBus(), registry = createRegistry();
  const s = { sound: true, noLook: false, stops: 0, wheres: 0 };
  const phone = createPhone({ stop: () => { s.stops++; }, where: () => { s.wheres++; }, noLook: (on) => { s.noLook = on; },
    isNoLook: () => s.noLook, sound: (on) => { s.sound = on; }, isSound: () => s.sound });
  registry.register(phone);
  const root = await mountApp(phone, doc.body, { bus });
  const ctxFor = (app) => createCtx({ app, root, bus, kv: null, cursor: { async moveTo() {}, hide() {} }, ask: async () => false });
  const run = (name, params = {}) => runAction({ registry, name, params, bus, ctxFor });
  assert.ok((await run('phone__sound', { on: false })).ok); assert.equal(s.sound, false);
  assert.ok((await run('phone__sound', { on: false })).ok, 'already off: nothing to press, still verified');
  assert.ok((await run('phone__noLook', { on: true })).ok); assert.equal(s.noLook, true);
  assert.ok((await run('phone__where')).ok); assert.equal(s.wheres, 1);
  assert.ok((await run('phone__stop')).ok); assert.equal(s.stops, 1);
  assert.equal((await run('phone__sound', {})).ok, false, 'on is required');
  const names = registry.tools().map((t) => t.name);
  for (const n of ['phone__sound', 'phone__noLook', 'phone__where', 'phone__stop']) assert.ok(names.includes(n), n);
});
