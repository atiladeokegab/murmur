import test from 'node:test';
import assert from 'node:assert/strict';
import { createBus, createRegistry, createCtx, appKv, mountApp, runAction, controlName } from '../public/sdk/index.js';
import { browserKV } from '../public/ports/browser-kv.js';
import places, { findPlace } from '../public/apps/places/index.js';
import calendar from '../public/apps/calendar/index.js';
import appIds from '../public/apps/apps.js';
import { describeRegistry } from '../public/agent/plan.js';
import { demoPlan } from '../public/agent/demo-plan.js';
import { fakeDocument, fakeStorage } from './fake-dom.js';

async function phone() {
  const doc = fakeDocument(), bus = createBus(), registry = createRegistry();
  registry.register(places);
  const kv = appKv('places', browserKV({ storage: fakeStorage(), prefix: 'murmur' }));
  const root = await mountApp(places, doc.body, { kv, bus, say: (text) => bus.emit('say', { text }) });
  await places.reset();
  const ctxFor = (app) => createCtx({ app, root, bus, kv, cursor: { async moveTo() {}, hide() {} }, ask: async () => false, choose: async () => null, signal: new AbortController().signal });
  const run = (name, params) => runAction({ registry, name, params, bus, ctxFor, n: 1, of: 1 });
  const said = () => bus.log.filter((e) => e.name === 'say').map((e) => e.payload?.text ?? e.text).at(-1);
  return { root, run, said, s: () => places.state() };
}

const MORE = "800 metres. Walking: 10 minutes at your usual pace. Bus 24 from the stop outside: 4 minutes, every 8 minutes. Route: left out of the door, straight on for 400 metres, cross at the lights, it's on your right.";

test('places: on the board, read-only, every action has describe, doing and hint', async () => {
  assert.ok(appIds.includes('places'));
  const { root } = await phone();
  assert.equal(root.querySelector('h2').textContent, 'Places');
  for (const [k, a] of Object.entries(places.actions)) {
    assert.equal(a.gate ?? null, null, k);
    assert.ok(a.describe && a.hint, k);
    assert.ok(a.doing.split(' ').length >= 2 && a.doing.split(' ').length <= 5, k);
  }
});

test("places: how far is short; tell me more is the co-designer's line", async () => {
  const { run, said, s } = await phone();
  const r = await run('places__howFar', { place: 'shopping centre' });
  assert.equal(r.ok, true);
  assert.equal(said(), 'A 10-minute walk.');
  assert.equal(r.more, MORE);
  assert.equal(s().open, 'shopping');
  assert.equal(places.read(), 'The shopping centre. A 10-minute walk.');
  assert.equal((await run('places__howFar', { place: "Mum's house" })).ok, true);
  assert.equal(said(), 'A 30-minute walk, or 9 minutes on bus 12.');
  const bad = await run('places__howFar', { place: 'the moon' });
  assert.equal(bad.ok, false);
  assert.match(bad.reason, /I don't know the moon/);
});

test('places: route, step by step', async () => {
  const { run, said, s, root } = await phone();
  const r = await run('places__route', { place: 'the shopping centre' });
  assert.equal(r.ok, true);
  assert.equal(said(), "Left out of the door, straight on for 400 metres, cross at the lights, it's on your right.");
  assert.equal(r.more, MORE);
  assert.equal(s().view, 'route');
  assert.equal(root.querySelector('#places-route').children.length, 4, 'each step is its own item');
  assert.equal((await run('places__route', { place: 'cafe' })).ok, true, 'from one open place to another, no accent needed');
  assert.equal(s().open, 'cafe');
});

test("places: what's nearby lists the three nearest", async () => {
  const { run, said, s } = await phone();
  const r = await run('places__nearby', {});
  assert.equal(r.ok, true);
  assert.equal(said(), 'Nearest: the café on the corner, 2 minutes; the pharmacy, 4 minutes; the park, 6 minutes.');
  assert.deepEqual(s().nearby, ['cafe', 'pharmacy', 'park']);
  assert.match(r.more, /^The café on the corner: 150 metres, 2 minutes' walk\. Open now, until 5 pm\./);
});

test('places: open now and opening hours, at the fixed Monday 09:00', async () => {
  const { run, said } = await phone();
  let r = await run('places__hours', { place: 'pharmacy' });
  assert.equal(r.ok, true);
  assert.equal(said(), 'Open now, until 6 pm.');
  assert.match(r.more, /^Open 9 am to 6 pm every day\. 300 metres\./);
  await run('places__hours', { place: 'library' });
  assert.equal(said(), 'Closed now. Opens at 10 am.');
  await run('places__hours', { place: 'station' });
  assert.equal(said(), 'Open now, until midnight.');
  r = await run('places__hours', { place: 'mum' });
  assert.equal(said(), "Mum's house has no opening hours.");
});

test('places: findPlace hears names loosely', () => {
  const list = places.state().places;
  for (const [q, id] of [['the shopping centre', 'shopping'], ['shops', 'shopping'], ["Mum's", 'mum'], ['the café on the corner', 'cafe'], ['chemist', 'pharmacy']]) assert.equal(findPlace(list, q)?.id, id, q);
  assert.equal(findPlace(list, 'the moon'), null);
});

test('places: every say phrase plans to its own places__ tool', () => {
  const apps = describeRegistry([calendar, places]);
  for (const [said, tool, place] of [
    ['How far is the shopping centre?', 'places__howFar', 'shopping centre'],
    ["How far is Mum's house?", 'places__howFar', "Mum's house"],
    ["What's the route to the library?", 'places__route', 'library'],
    ['Route to the station', 'places__route', 'station'],
    ["What's nearby?", 'places__nearby', undefined],
    ['Is the pharmacy open now?', 'places__hours', 'pharmacy'],
    ['When does the café on the corner open?', 'places__hours', 'café on the corner'],
  ]) {
    const p = demoPlan(said, apps);
    assert.equal(p.kind, 'task', said);
    assert.deepEqual(p.plan.map((x) => x.tool), [tool], said);
    assert.equal(p.plan[0].params.place, place, said);
  }
  // Transit keeps "directions to" when it is on the phone.
  const withTransit = describeRegistry([places, { id: 'transit', name: 'Transit', actions: { directions: { params: { type: 'object', properties: { place: { type: 'string' } } } } } }]);
  assert.equal(demoPlan('Directions to the station', withTransit).plan[0].tool, 'transit__directions');
});

test("places: a person's own tap keeps focus in the app and hears the answer; names don't run together", async () => {
  const doc = fakeDocument(), bus = createBus();
  const heard = [];
  const kv = appKv('places', browserKV({ storage: fakeStorage(), prefix: 'murmur' }));
  const root = await mountApp(places, doc.body, { kv, bus, say: (t) => heard.push(t) });
  await places.reset();
  const lib = root.querySelector('#places-library');
  assert.equal(controlName(lib), 'The library. An 8-minute walk.');
  lib.focus();
  lib.dispatchEvent({ type: 'click', isTrusted: true });
  assert.equal(doc.activeElement?.id, 'places-place-h', 'focus moves to the place heading, not the body');
  assert.equal(heard.at(-1), 'The library. An 8-minute walk.');
  root.querySelector('#places-back').click(); // a script's click: no isTrusted, so nothing is said
  assert.equal(heard.length, 1);
  assert.equal(doc.activeElement?.id, 'places-list-h');
});
