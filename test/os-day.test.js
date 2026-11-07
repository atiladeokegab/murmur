import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createBus } from '../public/sdk/index.js';
import { createDay, HABIT, WEEK } from '../public/os/day.js';
import { fresh as messagesFresh } from '../public/apps/messages/model.js';

const calendarSeed = JSON.parse(readFileSync(new URL('../public/apps/calendar/state.example.json', import.meta.url)));

// A phone's worth of apps, reduced to what the day reads: id, state() and reset().
function phone({ withBus = true } = {}) {
  const resets = [];
  const app = (id, state = () => ({})) => ({ id, state, async reset() { resets.push(id); } });
  const apps = [app('hello'), app('messages', () => messagesFresh()), app('calendar', () => calendarSeed), ...(withBus ? [app('transit')] : [])];
  const registry = { list: () => apps, get: (id) => apps.find((a) => a.id === id) || null };
  const m = new Map(), kv = { get: async (k) => structuredClone(m.get(k)), set: async (k, v) => { m.set(k, structuredClone(v)); } };
  const bus = createBus();
  return { registry, kv, bus, resets, memory: () => bus.log.filter((e) => e.name === 'memory') };
}

test('day 1: registry order, no proposal, and Now lines from Calendar and Messages', async () => {
  const p = phone();
  const day = await createDay(p).load();
  assert.equal(day.day, 1);
  assert.deepEqual(day.order(), ['hello', 'messages', 'calendar', 'transit']);
  assert.equal(day.proposal, null);
  assert.deepEqual(day.lineFor('calendar'), { title: 'Lunch with Mum', why: 'Tuesday at 12:30 pm' });
  assert.deepEqual(day.lineFor('messages'), { title: '2 new messages', why: 'Mum: Lunch on Tuesday?' });
  assert.equal(day.lineFor('hello'), null);
  assert.deepEqual(day.now().map((x) => x.app), ['messages', 'calendar']);
});

test('next morning: day 2, a seeded week, and one proposal to put the bus first; nothing moves on its own', async () => {
  const p = phone();
  const day = await createDay(p).load();
  assert.ok(WEEK.filter((m) => m[0] === 'transit').length >= 4, 'the seeded week has the habit');
  const prop = await day.nextMorning();
  assert.equal(day.day, 2);
  assert.equal(prop.text, 'You check the bus first most mornings. Put the bus first?');
  assert.deepEqual(p.memory().at(-1).proposal, { id: 'first:transit', app: 'transit', text: HABIT.text, options: ['Yes', 'Not now', 'Never'] });
  assert.deepEqual(day.order(), ['hello', 'messages', 'calendar', 'transit'], 'proposes, never acts');
});

test('yes puts the bus first with UP for the day; it survives a reload; the next morning clears UP', async () => {
  const p = phone();
  const day = await createDay(p).load();
  await day.nextMorning();
  const r = await day.respond('Yes');
  assert.deepEqual(r, { ok: true, moved: true, order: ['transit', 'hello', 'messages', 'calendar'] });
  assert.deepEqual(day.up, ['transit']);
  assert.deepEqual(p.memory().at(-1).response, { id: 'first:transit', answer: 'yes' });
  assert.deepEqual(day.apps().map((a) => a.id), ['transit', 'hello', 'messages', 'calendar']);
  const again = await createDay(p).load();
  assert.equal(again.day, 2);
  assert.equal(again.order()[0], 'transit');
  assert.equal(await again.nextMorning(), null, 'already first: nothing to propose');
  assert.deepEqual(again.up, []);
});

test('not now asks again next morning; never does not; no bus app, no proposal', async () => {
  const p = phone();
  const day = await createDay(p).load();
  await day.nextMorning();
  assert.equal((await day.respond('not now')).moved, false);
  assert.equal(day.proposal, null);
  assert.ok(await day.nextMorning(), 'not now is only for today');
  await day.respond('never');
  assert.equal(await day.nextMorning(), null);
  assert.deepEqual((await day.respond('yes')).ok, false, 'no open proposal');
  const none = await createDay(phone({ withBus: false })).load();
  assert.equal(await none.nextMorning(), null);
});

test('reset: every app back to its seed, day 1, first order, no history', async () => {
  const p = phone();
  const day = await createDay(p).load();
  await day.nextMorning(); await day.respond('yes');
  await day.reset();
  assert.deepEqual(p.resets, ['hello', 'messages', 'calendar', 'transit']);
  assert.equal(day.day, 1);
  assert.deepEqual(day.order(), ['hello', 'messages', 'calendar', 'transit']);
  assert.deepEqual(day.up, []);
  assert.equal((await createDay(p).load()).day, 1);
});
