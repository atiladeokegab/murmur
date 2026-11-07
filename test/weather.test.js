import test from 'node:test';
import assert from 'node:assert/strict';
import { createBus, createRegistry, createCtx, appKv, mountApp, runAction } from '../public/sdk/index.js';
import { browserKV } from '../public/ports/browser-kv.js';
import weather, { whenOf } from '../public/apps/weather/index.js';
import calendar from '../public/apps/calendar/index.js';
import places from '../public/apps/places/index.js';
import appIds from '../public/apps/apps.js';
import { describeRegistry } from '../public/agent/plan.js';
import { demoPlan } from '../public/agent/demo-plan.js';
import { fakeDocument, fakeStorage } from './fake-dom.js';

async function phone() {
  const doc = fakeDocument(), bus = createBus(), registry = createRegistry();
  registry.register(weather);
  const kv = appKv('weather', browserKV({ storage: fakeStorage(), prefix: 'murmur' }));
  const root = await mountApp(weather, doc.body, { kv, bus, say: (text) => bus.emit('say', { text }) });
  await weather.reset();
  const ctxFor = (app) => createCtx({ app, root, bus, kv, cursor: { async moveTo() {}, hide() {} }, ask: async () => false, choose: async () => null, signal: new AbortController().signal });
  const run = (name, params) => runAction({ registry, name, params, bus, ctxFor, n: 1, of: 1 });
  const said = () => bus.log.filter((e) => e.name === 'say').map((e) => e.payload?.text ?? e.text).at(-1);
  return { root, run, said, s: () => weather.state() };
}

test('weather: on the board, read-only, every action has describe, doing and hint', async () => {
  assert.ok(appIds.includes('weather'));
  const { root } = await phone();
  assert.equal(root.querySelector('h2').textContent, 'Weather');
  assert.equal(root.querySelector('#weather-today').getAttribute('aria-pressed'), 'true');
  for (const [k, a] of Object.entries(weather.actions)) {
    assert.equal(a.gate ?? null, null, k);
    assert.ok(a.describe && a.hint, k);
    assert.ok(a.doing.split(' ').length >= 2 && a.doing.split(' ').length <= 5, k);
  }
});

test("weather: what's the weather is short; more is three-hourly plus the wind", async () => {
  const { run, said, s } = await phone();
  const r = await run('weather__forecast', {});
  assert.equal(r.ok, true);
  assert.equal(said(), 'Dry, 12 degrees. Rain from 3.');
  assert.equal(r.more, '9 am: dry, 12 degrees. 12 pm: cloudy, 14 degrees. 3 pm: light rain, 12 degrees. 6 pm: rain, 10 degrees. 9 pm: dry, 8 degrees. Wind from the south-west, 15 miles an hour, gusting 25 after 3.');
  assert.equal(weather.read(), 'Today: Dry, 12 degrees. Rain from 3.');
  await run('weather__forecast', { when: 'this afternoon' });
  assert.equal(said(), 'Cloudy, up to 14 degrees. Rain from 3.');
  assert.equal(s().shown, 'afternoon');
  await run('weather__forecast', { when: 'tomorrow' });
  assert.equal(said(), 'Sunny, up to 16 degrees. Dry all day.');
  await run('weather__forecast', { when: 'tonight' });
  assert.equal(said(), 'Rain, up to 10 degrees. Dry from 9.');
});

test('weather: do I need a coat, and will it rain', async () => {
  const { run, said } = await phone();
  const r = await run('weather__coat', {});
  assert.equal(r.ok, true);
  assert.equal(said(), 'Yes, a light one: rain from 3.');
  assert.match(r.more, /Wind from the south-west/);
  await run('weather__coat', { when: 'tomorrow' });
  assert.equal(said(), 'No: dry, up to 16 degrees.');
  await run('weather__rain', {});
  assert.equal(said(), 'Yes. Rain from 3.');
  await run('weather__rain', { when: 'tomorrow' });
  assert.equal(said(), 'No. Dry all day.');
  await run('weather__rain', { when: 'tonight' });
  assert.equal(said(), "Yes, it's raining now. Dry from 9.");
});

test('weather: whenOf', () => {
  for (const [q, k] of [[undefined, 'today'], ['now', 'today'], ['this afternoon', 'afternoon'], ['tomorrow', 'tomorrow'], ['this evening', 'tonight']]) assert.equal(whenOf(q), k, q);
});

test('weather: every say phrase plans to its own weather__ tool', () => {
  const apps = describeRegistry([calendar, places, weather]);
  for (const [said, tool, when] of [
    ["What's the weather?", 'weather__forecast', undefined],
    ["What's the weather tomorrow?", 'weather__forecast', 'tomorrow'],
    ["What's the weather like this afternoon?", 'weather__forecast', 'this afternoon'],
    ['Weather tonight', 'weather__forecast', 'tonight'],
    ['Do I need a coat?', 'weather__coat', undefined],
    ['Do I need a coat tomorrow?', 'weather__coat', 'tomorrow'],
    ['Will it rain this afternoon?', 'weather__rain', 'this afternoon'],
    ['Is it going to rain?', 'weather__rain', undefined],
  ]) {
    const p = demoPlan(said, apps);
    assert.equal(p.kind, 'task', said);
    assert.deepEqual(p.plan.map((x) => x.tool), [tool], said);
    assert.equal(p.plan[0].params.when, when, said);
  }
});
