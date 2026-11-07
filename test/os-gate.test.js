import { test } from 'node:test';
import assert from 'node:assert/strict';
import { byHand } from '../public/os/gate.js';
import { createBus, createCtx } from '../public/sdk/index.js';

const rec = () => { const bus = createBus(); const seen = []; bus.on('confirm', (e) => seen.push(e)); return { bus, seen }; };
const never = async () => { throw new Error('no sheet on a hand tap'); };

test('a hand tap on Send is the yes: no sheet, no fingerprint, recorded byHand', async () => {
  const { bus, seen } = rec();
  const pk = { usable: async () => { throw new Error('not for send'); }, confirm: never };
  assert.equal(await byHand({ app: 'messages', gate: 'send', readback: 'Send to Sam', bus, passkey: pk, sheet: never }), true);
  assert.equal(seen.length, 1);
  assert.equal(seen[0].result, true); assert.equal(seen[0].byHand, true); assert.equal('fingerprint' in seen[0], false);
});

test('a hand tap on Pay checks the fingerprint before it pays', async () => {
  for (const ok of [true, false]) {
    const { bus, seen } = rec();
    let asked = 0;
    const pk = { usable: async () => true, confirm: async () => { asked++; return ok; } };
    assert.equal(await byHand({ app: 'shop', gate: 'pay', readback: 'Pay £4', bus, passkey: pk, sheet: never }), ok);
    assert.equal(asked, 1);
    assert.equal(seen[0].fingerprint, true); assert.equal(seen[0].result, ok);
  }
  const { bus } = rec();
  const throws = { usable: async () => true, confirm: async () => { throw new Error('NotAllowedError'); } };
  assert.equal(await byHand({ app: 'shop', gate: 'pay', readback: 'Pay', bus, passkey: throws, sheet: never }), false, 'a cancelled fingerprint pays nothing');
});

test('Pay with no authenticator falls back to the readback sheet, recorded fingerprint:false', async () => {
  for (const yes of [true, false]) {
    const { bus, seen } = rec();
    const pk = { usable: async () => false, confirm: never };
    assert.equal(await byHand({ app: 'shop', gate: 'pay', readback: 'Pay', bus, passkey: pk, sheet: async () => yes }), yes);
    assert.equal(seen[0].fingerprint, false);
  }
});

test('ctx.confirm records the fingerprint the host checked, and {result:false} is a no', async () => {
  for (const [a, result, fp] of [[true, true, undefined], [false, false, undefined], [{ result: true, fingerprint: true }, true, true], [{ result: false, fingerprint: true }, false, true]]) {
    const { bus, seen } = rec();
    const ctx = createCtx({ app: { id: 'shop' }, root: null, bus, kv: null, cursor: null, ask: async () => a });
    assert.equal(await ctx.confirm('pay', 'Pay'), result);
    assert.equal(seen[0].result, result); assert.equal(seen[0].fingerprint, fp);
  }
});
