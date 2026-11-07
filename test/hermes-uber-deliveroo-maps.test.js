import test from 'node:test';
import assert from 'node:assert/strict';
import { createUber } from '../public/apps/uber/index.js';
import { createDeliveroo } from '../public/apps/deliveroo/index.js';
import { createMaps } from '../public/apps/maps/index.js';
import apps from '../public/apps/apps.js';
import { PHONE_APPS } from '../public/agent/phone-apps.js';
import { checkContract, phone } from './hermes-fake.js';

test('registered on the board; the acted-out stand-ins are gone so the real apps win', () => {
  for (const id of ['uber', 'deliveroo', 'maps']) assert.ok(apps.includes(id), id);
  assert.deepEqual(PHONE_APPS.filter((a) => /^(uber|deliveroo|maps)$/i.test(a.name)), []);
});

test('Uber: how far is a car, then a car home through the pay gate; a No books nothing', async () => {
  checkContract(assert, createUber(), ['bookHome']);
  const app = createUber();
  const { run, asked } = await phone([app], { answers: [false, true] });
  assert.ok((await run('uber__howFar')).ok);
  assert.equal(app.read(), 'The nearest car is six minutes away. A car home is about £14.20, eighteen minutes.');
  assert.equal((await run('uber__bookHome')).cancelled, true);
  assert.equal(app.state().booked, null);
  assert.ok((await run('uber__bookHome')).ok);
  assert.deepEqual(asked.map((q) => q.gate), ['pay', 'pay']);
  assert.match(asked[0].readback, /^A car home to 14 Larkspur Row, Stratford, about £14\.20/);
  assert.match(app.read(), /^Booked: Dami in a grey hatchback.*Nothing is charged\.$/);
});

test('Deliveroo: my usual from Pasta Corner, then order it through the pay gate', async () => {
  checkContract(assert, createDeliveroo(), ['order']);
  const app = createDeliveroo();
  const { run, asked } = await phone([app], { answers: [true] });
  assert.ok((await run('deliveroo__usual')).ok);
  assert.equal(app.read(), 'Your usual: Penne arrabbiata and Garlic bread from Pasta Corner, £14.50 with delivery.');
  assert.ok((await run('deliveroo__order')).ok);
  assert.deepEqual(asked.map((q) => [q.gate, q.readback]), [['pay', 'Penne arrabbiata and Garlic bread from Pasta Corner, £14.50 with delivery.']]);
  assert.match(app.read(), /^Ordered from Pasta Corner\. Arriving in about thirty minutes/);
});

test('Maps: directions home, how far is a place, and an unknown place in words', async () => {
  checkContract(assert, createMaps(), []);
  const app = createMaps();
  const { run } = await phone([app]);
  assert.ok((await run('maps__directions', { place: 'home' })).ok);
  assert.match(app.read(), /^Home is eighteen minutes on foot\. Head north on Station Approach\./);
  assert.ok((await run('maps__howFar', { place: 'the library' })).ok);
  assert.equal(app.read(), 'Quayside Library is a mile and a half away, thirty minutes on foot.');
  assert.ok((await run('maps__howFar', { place: 'Fennel Street Market' })).ok);
  assert.match((await run('maps__howFar', { place: 'the moon' })).reason, /^I don't have the moon on the map\./);
});
