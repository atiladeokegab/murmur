import { test } from 'node:test';
import assert from 'node:assert/strict';
import { byHand, checkFingerprint, payAttempt } from '../public/os/gate.js';
import { createBus, createCtx } from '../public/sdk/index.js';

const rec = () => { const bus = createBus(); const seen = []; bus.on('confirm', (e) => seen.push(e)); return { bus, seen }; };

test('a hand tap on send, call or delete still shows the readback sheet, without the grace', async () => {
  for (const gate of ['send', 'call', 'delete']) for (const yes of [true, false]) {
    const { bus, seen } = rec();
    let asked = null;
    const sheet = async (q) => { asked = q; return yes; };
    assert.equal(await byHand({ app: 'messages', gate, readback: 'Send to Sam', bus, sheet }), yes);
    assert.deepEqual(asked, { gate, readback: 'Send to Sam', grace: false });
    assert.equal(seen[0].result, yes); assert.equal(seen[0].byHand, true);
  }
});

test('a hand tap on Pay: the sheet carries the fingerprint result onto the bus', async () => {
  for (const ok of [true, false]) {
    const { bus, seen } = rec();
    assert.equal(await byHand({ app: 'shop', gate: 'pay', readback: 'Pay £4', bus, sheet: async () => ({ result: ok, fingerprint: ok }) }), ok);
    assert.equal(seen[0].fingerprint, ok); assert.equal(seen[0].result, ok);
  }
});

const fp = (over = {}) => {
  const said = [], calls = { confirm: 0 };
  const passkey = { has: () => false, available: async () => true, confirm: async () => { calls.confirm++; return true; }, ...over };
  return { said, calls, run: (o = {}) => checkFingerprint({ passkey, say: (t) => said.push(t), ...o }) };
};

test('pay fails closed: no authenticator pays nothing and asks for no credential', async () => {
  const f = fp({ available: async () => false });
  assert.equal(await f.run(), false);
  assert.equal(f.calls.confirm, 0);
  assert.deepEqual(f.said, ["This phone can't check a fingerprint, so I can't pay."]);
  const g = fp({ available: async () => { throw new Error('no WebAuthn'); } });
  assert.equal(await g.run(), false, 'a throwing check is a no');
});

test('pay with no passkey yet: making one is the fingerprint ask, and it must succeed', async () => {
  for (const [res, want] of [[true, true], [false, false]]) {
    const f = fp({ confirm: async () => { f.calls.confirm++; return res; } });
    assert.equal(await f.run(), want); assert.equal(f.calls.confirm, 1);
  }
  const c = fp({ confirm: async () => { throw new Error('NotAllowedError'); } });
  assert.equal(await c.run(), false, 'a cancelled fingerprint pays nothing');
  assert.deepEqual(c.said, ['No fingerprint, so nothing was paid.']);
});

test('pay with a fingerprint that never answers times out and frees the agent', async () => {
  const f = fp({ has: () => true, confirm: () => new Promise(() => {}) });
  assert.equal(await f.run({ wait: async () => {} }), false);
  assert.deepEqual(f.said, ['No fingerprint, so nothing was paid.']);
});

test('ctx.confirm records the fingerprint the host checked, and {result:false} is a no', async () => {
  for (const [a, result, fp] of [[true, true, undefined], [false, false, undefined], [{ result: true, fingerprint: true }, true, true], [{ result: false, fingerprint: true }, false, true]]) {
    const { bus, seen } = rec();
    const ctx = createCtx({ app: { id: 'shop' }, root: null, bus, kv: null, cursor: null, ask: async () => a });
    assert.equal(await ctx.confirm('pay', 'Pay'), result);
    assert.equal(seen[0].result, result); assert.equal(seen[0].fingerprint, fp);
  }
});

test('Yes, then Stop or Back before the fingerprint returns: a late fingerprint yes pays nothing (Atlas P1)', async () => {
  for (const how of ['Stop', 'Back']) {
    let uv;
    const a = payAttempt(() => new Promise((res) => { uv = res; }));
    a.cancel(); // ${how}
    uv(true); // the fingerprint says yes, too late
    assert.equal(await a.result, false, how);
  }
  const ok = payAttempt(async () => true);
  assert.equal(await ok.result, true, 'no Stop: the fingerprint pays');
  ok.cancel();
  assert.equal(await ok.result, true, 'a Stop after the pay changes nothing');
  assert.equal(await payAttempt(async () => { throw new Error('cancelled'); }).result, false, 'a failed check pays nothing');
});
