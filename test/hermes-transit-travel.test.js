import test from 'node:test';
import assert from 'node:assert/strict';
import { createTransit } from '../public/apps/transit/index.js';
import { createTravel } from '../public/apps/travel/index.js';
import { checkContract, phone } from './hermes-fake.js';

async function transitAt(clock) { const app = createTransit({ now: () => clock.t }); return { app, ...(await phone([app])) }; }

test('Transit: contract, and the demo line at seed time', async () => {
  checkContract(assert, createTransit(), []);
  const clock = { t: new Date(2026, 10, 7, 8, 30).getTime() };
  const { app, run } = await transitAt(clock);
  assert.ok((await run('transit__nextBus')).ok);
  assert.equal(app.read(), 'The 25 leaves in four minutes from the stop by the library.');
  clock.t += 3 * 60e3;
  assert.equal(app.read(), 'The 25 leaves in one minute from the stop by the library.');
  clock.t += 2 * 60e3;
  assert.equal(app.read(), 'The 25 leaves in eleven minutes from the stop by the library.', 'missed it: the next one');
});

test('Transit: directions and when to leave, by name, through Back', async () => {
  const clock = { t: new Date(2026, 10, 7, 8, 30).getTime() };
  const { app, run, taps } = await transitAt(clock);
  assert.ok((await run('transit__directions', { place: "Mum's" })).ok);
  assert.match(app.read(), /^Walk five minutes to the stop on Market Street\. Take the 8 toward Elm Park, nine stops\./);
  taps.length = 0;
  assert.ok((await run('transit__whenToLeave', { place: 'work' })).ok);
  assert.deepEqual(taps, ['Back to Transit', 'When to leave for Work']);
  assert.equal(app.read(), "Leave in one minute to catch the 25 at eight thirty-four. You'll be at work by eight forty-eight.");
  assert.match((await run('transit__directions', { place: 'the moon' })).reason, /don't have that place saved/);
  assert.match((await run('transit__nextBus', { route: '99' })).reason, /No 99 stops near you/);
  assert.ok((await run('transit__nextBus', { route: 'the 8' })).ok);
  assert.equal(app.read(), 'The 8 leaves in nine minutes from the stop on Market Street.');
});

test('Travel: three flights in three sentences, book the 9:40 through the pay gate', async () => {
  checkContract(assert, createTravel(), ['hold']);
  const app = createTravel();
  const { run, asked } = await phone([app], { answers: [true] });
  assert.ok((await run('travel__findFlights', { from: 'London', to: 'Lisbon', day: 'Friday' })).ok);
  assert.match(app.read(), /^Three flights Friday\. Northline at six fifty-five.*Tagus Air at nine forty.*Atlantica at two twenty/);
  assert.ok((await run('travel__pick', { flight: 'the 9:40' })).ok);
  assert.ok((await run('travel__hold')).ok);
  assert.deepEqual(asked.map((q) => [q.gate, q.readback]), [['pay', 'Tagus Air, Friday at nine forty from Heathrow to Lisbon, £88, held for 24 hours.']]);
  assert.equal(app.read(), 'Held: Tagus Air, Friday at nine forty, for 24 hours. Nothing is charged.');
  assert.ok((await run('travel__pick', { flight: 'second' })).ok, 'pick again goes back to the list');
  assert.ok((await run('travel__findFlights', { to: 'Lisbon', day: 'Saturday' })).ok, 'a new search from a flight');
});

test('Travel: a No holds nothing, refusals are in words, reset clears', async () => {
  const app = createTravel();
  const { run, press, asked } = await phone([app], { answers: [false, false, true] });
  assert.match((await run('travel__pick', { flight: '9:40' })).reason, /Find the flights first/);
  assert.match((await run('travel__findFlights', { to: 'Paris' })).reason, /only find flights from London to Lisbon/);
  assert.match((await run('travel__findFlights', { to: 'Lisbon', day: 'Monday' })).reason, /Which day/);
  await run('travel__findFlights', { to: 'Lisbon' });
  assert.match((await run('travel__pick', { flight: 'the 11:00' })).reason, /There's no the 11:00/);
  await run('travel__pick', { flight: 'third' });
  assert.equal((await run('travel__hold')).cancelled, true);
  assert.equal(app.state().held, null);
  await press('travel', 'Hold this flight');
  assert.equal(app.state().held, null, 'a No on the sheet after a hand tap holds nothing');
  await press('travel', 'Hold this flight');
  assert.equal(app.state().held.id, 'AT118', "a hand tap holds only after the sheet's yes (fingerprint inside it)");
  assert.deepEqual(asked.filter((q) => q.byHand).map((q) => q.gate), ['pay', 'pay']);
  await app.reset();
  assert.equal(app.state().view, 'search');
});

test('travel: "book the 9:40" picks and holds in one step; "hold it" with nothing open says why, in words', async () => {
  const { createTravel } = await import('../public/apps/travel/index.js');
  const app = createTravel();
  const { run, asked } = await phone([app], { answers: [true] });
  const none = await run('travel__hold');
  assert.equal(none.ok, false); assert.equal(none.reason, 'Find the flights first.'); assert.equal(asked.length, 0);
  await run('travel__findFlights', { to: 'Lisbon', day: 'Friday' });
  assert.match((await run('travel__hold', { flight: 'it' })).reason, /^Which flight\? There's the 06:55, the 09:40, the 14:20\.$/);
  assert.ok((await run('travel__hold', { flight: 'the 9:40' })).ok);
  assert.equal(app.state().held.id, 'TA311');
  assert.match(asked[0].readback, /^Tagus Air, Friday at nine forty from Heathrow/);
});
