import test from 'node:test';
import assert from 'node:assert/strict';
import { createShop } from '../public/apps/shop/index.js';
import { checkContract, phone } from './hermes-fake.js';

// 10:01 local: eight minutes' prep rounds up to ten past.
const T = new Date(2026, 10, 7, 10, 1, 0).getTime();
const shopPhone = async (o) => { const app = createShop({ now: () => T }); return { app, ...(await phone([app], o)) }; };

test('Shop follows the contract: doing, hint, readback on pay, no undo on pay', () => {
  checkContract(assert, createShop(), ['pay']);
});

test('order my usual, then pay through the gate: the demo lines, and the usual learns', async () => {
  const { app, run, asked, taps, bus } = await shopPhone({ answers: [true] });
  assert.deepEqual(await run('shop__orderUsual'), { ok: true, params: {} });
  assert.deepEqual((await run('shop__pay')).ok, true);
  assert.deepEqual(asked.map((q) => q.readback), ['Flat white, Demo Café, £3.20.']);
  assert.equal(app.read(), 'Paid. Ready at ten past.');
  assert.equal(app.state().orders.at(-1).total, 320);
  assert.equal(app.state().usual['demo-cafe'].count, 7);
  assert.deepEqual(taps, ['Your usual: Flat white, Demo Café, £3.20', 'Pay £3.20 with your fingerprint']);
  assert.ok((await run('shop__track')).ok);
  assert.equal(bus.log.filter((e) => e.name === 'confirm').length, 1);
});

test('a No at the gate pays nothing', async () => {
  const { app, run } = await shopPhone({ answers: [false] });
  await run('shop__orderUsual');
  const r = await run('shop__pay');
  assert.equal(r.ok, false); assert.equal(r.cancelled, true);
  assert.equal(app.state().orders.length, 1);
  assert.equal(app.state().basket.length, 1);
});

test('kv and state hold only ids and counts, no card data', async () => {
  const { app, run, port } = await shopPhone({ answers: [true] });
  await run('shop__orderUsual'); await run('shop__pay');
  const stored = JSON.stringify(await port.getAll('app.shop'));
  assert.match(stored, /flat-white/);
  assert.doesNotMatch(stored + JSON.stringify(app.state()), /card|cvv|expiry|price/i);
});

test('by hand: the person taps their usual and Pay, and that tap is their yes', async () => {
  const { app, press, asked } = await shopPhone();
  press('shop', 'Your usual: Flat white');
  press('shop', 'Pay £3.20');
  assert.equal(app.read(), 'Paid. Ready at ten past.');
  assert.equal(asked.length, 0);
});

test('reorder, add, and failures in words', async () => {
  const { app, run } = await shopPhone();
  assert.ok((await run('shop__reorderLast')).ok);
  assert.equal(app.read(), 'Basket: Espresso and banana bread, Hill Street Roasters, £5.40.');
  assert.ok((await run('shop__addToBasket', { item: 'croissant' })).ok);
  assert.deepEqual(app.state().basket.map((l) => l.id), ['croissant'], 'one shop per basket');
  assert.match((await run('shop__addToBasket', { item: 'caviar' })).reason, /can't find caviar/);
  assert.match((await run('shop__orderUsual', { shop: 'the bank' })).reason, /don't know that shop/);
  await app.reset();
  assert.equal((await run('shop__pay')).ok, false);
  assert.match((await run('shop__track')).reason, /Nothing is on its way/);
});

test('after paying, the next order goes back through Back; reset brings the demo back', async () => {
  const { app, run, taps } = await shopPhone({ answers: [true] });
  await run('shop__orderUsual'); await run('shop__pay');
  taps.length = 0;
  assert.ok((await run('shop__orderUsual', { shop: 'Hill Street' })).ok);
  assert.deepEqual(taps, ['Back to the shops', 'Your usual: House beans, 250 grams, Hill Street Roasters, £11']);
  assert.equal(app.place().next, 'pay');
  await app.reset();
  assert.equal(app.state().orders.length, 1);
  assert.equal(app.state().usual['demo-cafe'].count, 6);
});

test('a person\'s press moves focus to the new view\'s first line, not the top of the page', async () => {
  const { doc, roots, press } = await shopPhone();
  const usual = [...roots.shop.all()].find((n) => n.tagName === 'BUTTON' && n.textContent.startsWith('Your usual'));
  usual.focus();
  press('shop', 'Your usual: Flat white');
  assert.ok(roots.shop.contains(doc.activeElement) && doc.activeElement.tagName !== 'BUTTON');
  assert.equal(doc.activeElement.textContent, 'Shop, Demo Café');
});
