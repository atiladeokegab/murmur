import test from 'node:test';
import assert from 'node:assert/strict';
import { createTransit } from '../public/apps/transit/index.js';
import { createTravel } from '../public/apps/travel/index.js';
import { act, fakeCtx, fakeRoot } from './hermes-fake.js';

const contract = (app, gated) => {
  for (const [name, a] of Object.entries(app.actions)) {
    for (const k of ['describe', 'hint']) assert.ok(typeof a[k] === 'string' && a[k], `${name}.${k}`);
    assert.equal(typeof a.verify, 'function', `${name}.verify`);
    assert.equal(a.params?.type, 'object');
    assert.ok('gate' in a);
  }
  assert.deepEqual(Object.entries(app.actions).filter(([, a]) => a.gate).map(([n]) => n), gated);
  for (const k of ['mount', 'read', 'place', 'state', 'seed', 'reset']) assert.equal(typeof app[k], 'function', k);
};

function transitAt(clock) {
  const app = createTransit({ now: () => clock.t });
  const root = fakeRoot();
  app.mount(root); app.seed();
  return { app, root };
}

test('Transit: contract, and the demo line at seed time', async () => {
  const clock = { t: new Date(2026, 10, 7, 8, 30).getTime() };
  const { app } = transitAt(clock);
  contract(app, []);
  assert.equal(await act(app, 'nextBus'), true);
  assert.equal(app.read(), 'The 25 leaves in four minutes from the stop by the library.');
  clock.t += 3 * 60e3;
  assert.equal(app.read(), 'The 25 leaves in one minute from the stop by the library.');
  clock.t += 2 * 60e3;
  assert.equal(app.read(), 'The 25 leaves in eleven minutes from the stop by the library.', 'missed it: the next one');
});

test('Transit: directions and when to leave, by name, through Back', async () => {
  const clock = { t: new Date(2026, 10, 7, 8, 30).getTime() };
  const { app } = transitAt(clock);
  assert.equal(await act(app, 'directions', { place: "Mum's" }), true);
  assert.match(app.read(), /^Walk five minutes to the stop on Market Street\. Take the 8 toward Elm Park, nine stops\./);
  const ctx = fakeCtx();
  assert.equal(await act(app, 'whenToLeave', { place: 'work' }, ctx), true);
  assert.deepEqual(ctx.log, ['back', 'leave']);
  assert.equal(app.read(), "Leave in one minute to catch the 25 at eight thirty-four. You'll be at work by eight forty-eight.");
  await assert.rejects(act(app, 'directions', { place: 'the moon' }), /don't have that place saved/);
  await assert.rejects(act(app, 'nextBus', { route: '99' }), /No 99 stops near you/);
  assert.equal(await act(app, 'nextBus', { route: 'the 8' }), true);
  assert.match(app.read(), /^The 8 leaves in nine minutes from the stop on Market Street\.$/);
});

async function travel(os = {}) {
  const app = createTravel();
  const root = fakeRoot();
  app.mount(root, os); app.seed();
  return { app, root };
}

test('Travel: three flights in three sentences, book the 9:40, hold readback', async () => {
  const { app } = await travel();
  contract(app, ['hold']);
  assert.equal(await act(app, 'findFlights', { from: 'London', to: 'Lisbon', day: 'Friday' }), true);
  const r = app.read();
  assert.equal(r.split('. ').length - 1 >= 3, true);
  assert.match(r, /^Three flights Friday\. Northline at six fifty-five/);
  assert.equal(await act(app, 'pick', { flight: 'the 9:40' }), true);
  assert.equal(app.actions.hold.readback(app.state()), 'Tagus Air, Friday at nine forty from Heathrow to Lisbon, £88, held for 24 hours.');
  assert.equal(await act(app, 'hold'), true);
  assert.equal(app.read(), 'Held: Tagus Air, Friday at nine forty, for 24 hours. Nothing is charged.');
  assert.equal(await act(app, 'pick', { flight: 'second' }), true, 'pick again goes back to the list');
});

test('Travel: refusals in words, and a hand Hold asks the OS', async () => {
  let asked = null;
  const { app, root } = await travel({ confirm: async (q) => { asked = q; return false; } });
  await assert.rejects(act(app, 'pick', { flight: '9:40' }), /Find the flights first/);
  await assert.rejects(act(app, 'findFlights', { to: 'Paris' }), /only find flights from London to Lisbon/);
  await assert.rejects(act(app, 'findFlights', { to: 'Lisbon', day: 'Monday' }), /Which day/);
  await act(app, 'findFlights', { to: 'Lisbon' });
  await assert.rejects(act(app, 'pick', { flight: 'the 11:00' }), /There's no the 11:00/);
  root.querySelector('[data-act="pick"][data-arg="AT118"]').click();
  root.querySelector('[data-act="hold"]').click();
  await new Promise((r) => setImmediate(r));
  assert.equal(asked.gate, 'pay');
  assert.equal(app.state().held, null);
  app.reset();
  assert.equal(app.state().view, 'search');
});
