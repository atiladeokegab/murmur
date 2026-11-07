import test from 'node:test';
import assert from 'node:assert/strict';
import { createShop } from '../public/apps/shop/index.js';
import { act, fakeCtx, fakeRoot } from './hermes-fake.js';

// 10:01 local: eight minutes' prep rounds up to ten past.
const T = new Date(2026, 10, 7, 10, 1, 0).getTime();
async function mounted(os = {}) {
  const app = createShop({ now: () => T });
  const root = fakeRoot();
  app.mount(root, os);
  await app.seed();
  return { app, root };
}

test('every action has describe, hint, params, a gate field and a verify', () => {
  const app = createShop();
  for (const [name, a] of Object.entries(app.actions)) {
    for (const k of ['describe', 'hint']) assert.ok(typeof a[k] === 'string' && a[k], `${name}.${k}`);
    assert.equal(typeof a.verify, 'function', `${name}.verify`);
    assert.equal(a.params?.type, 'object', `${name}.params`);
    assert.ok('gate' in a, `${name}.gate`);
  }
  assert.equal(app.actions.pay.gate, 'pay');
  assert.deepEqual(Object.entries(app.actions).filter(([, a]) => a.gate).map(([n]) => n), ['pay']);
});

test('order my usual reads back the demo line, then pay says ready at ten past', async () => {
  const { app } = await mounted();
  assert.equal(await act(app, 'orderUsual'), true);
  assert.equal(app.actions.pay.readback(app.state()), 'Flat white, Demo Café, £3.20.');
  assert.equal(await act(app, 'pay'), true);
  assert.equal(app.read(), 'Paid. Ready at ten past.');
  const st = app.state();
  assert.equal(st.orders.at(-1).total, 320);
  assert.equal(st.usual['demo-cafe'].count, 7, 'the usual learns from a repeat');
  assert.equal(await act(app, 'track'), true);
});

test('the state and kv hold no card data, only ids and counts', async () => {
  const kvs = fakeCtx().kv;
  const { app } = await mounted({ kv: kvs });
  await act(app, 'orderUsual'); await act(app, 'pay');
  const stored = JSON.stringify(await kvs.getAll('shop'));
  assert.match(stored, /flat-white/);
  assert.doesNotMatch(stored + JSON.stringify(app.state()), /card|cvv|pan|expiry|price/i);
});

test('by hand, Pay asks the OS first and a No pays nothing', async () => {
  let asked = null;
  const { app, root } = await mounted({ confirm: async (q) => { asked = q; return false; } });
  root.querySelector('[data-act="usual"][data-arg="demo-cafe"]').click();
  root.querySelector('[data-act="pay"]').click();
  await new Promise((r) => setImmediate(r));
  assert.deepEqual(asked, { gate: 'pay', readback: 'Flat white, Demo Café, £3.20.' });
  assert.equal(app.state().orders.length, 1, 'only the seeded past order');
  assert.equal(app.state().basket.length, 1);
});

test('with no OS confirm at all, a hand tap on Pay cannot pay', async () => {
  const { app, root } = await mounted({});
  root.querySelector('[data-act="usual"][data-arg="demo-cafe"]').click();
  root.querySelector('[data-act="pay"]').click();
  await new Promise((r) => setImmediate(r));
  assert.equal(app.state().basket.length, 1);
});

test('reorder last, add to basket, and the failures say why in words', async () => {
  const { app } = await mounted();
  assert.equal(await act(app, 'reorderLast'), true);
  assert.equal(app.read(), 'Basket: Espresso and banana bread, Hill Street Roasters, £5.40.');
  assert.equal(await act(app, 'addToBasket', { item: 'croissant' }), true);
  assert.deepEqual(app.state().basket.map((l) => l.id), ['croissant'], 'one shop per basket');
  await assert.rejects(act(app, 'addToBasket', { item: 'caviar' }), /can't find caviar/);
  await assert.rejects(act(app, 'orderUsual', { shop: 'the bank' }), /don't know that shop/);
  await app.reset();
  await assert.rejects(act(app, 'pay'), /basket is empty/);
  await assert.rejects(act(app, 'track'), /Nothing is on its way/);
});

test('after paying, the next order goes back to the shop view through Back', async () => {
  const { app } = await mounted();
  await act(app, 'orderUsual'); await act(app, 'pay');
  const ctx = fakeCtx();
  assert.equal(await act(app, 'orderUsual', { shop: 'Hill Street' }, ctx), true);
  assert.deepEqual(ctx.log, ['back', 'usual']);
  assert.equal(app.place().next, 'pay');
});

test('reset brings the demo data back', async () => {
  const { app } = await mounted();
  await act(app, 'orderUsual'); await act(app, 'pay');
  await app.reset();
  assert.equal(app.state().orders.length, 1);
  assert.equal(app.state().usual['demo-cafe'].count, 6);
  assert.match(app.read(), /Your usual is Flat white, Demo Café, £3.20/);
});
