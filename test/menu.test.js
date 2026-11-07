import test from 'node:test';
import assert from 'node:assert/strict';
import { rankMenu, dailyMenu, proposals, seedWeek, reason, daypart, usualTime } from '../public/lib/menu.js';
import { TILES } from '../public/lib/tiles.js';

const START = TILES.filter((t) => t.start).map((t) => t.id);
const at = (h, m = 0) => new Date(2026, 10, 7, h, m).getTime();

test('no history keeps the starter order', () => {
  assert.deepEqual(rankMenu([], START, at(9)), START);
});

test('a week of use moves Order beans up and keeps notes Now, at any hour', () => {
  for (const h of [0, 4, 5, 8, 11, 12, 16, 17, 20, 23]) {
    for (const min of [0, 59]) {
      const now = at(h, min);
      const log = seedWeek(now);
      const { state, moved } = dailyMenu({ day: 'old', order: START }, log, START, now);
      assert.equal(state.order[0], 'notes', `notes first at ${h}:${min}`);
      assert.equal(state.order[1], 'beans', `beans second at ${h}:${min}`);
      assert.ok(moved.some((m) => m.id === 'beans'), 'beans reported as moved');
      assert.ok(log.every((e) => daypart(new Date(e.t)) === daypart(new Date(now))), `seed stays in the daypart at ${h}:${min}`);
    }
  }
});

test('the order only changes once a day', () => {
  const now = at(9);
  const log = seedWeek(now);
  const first = dailyMenu(null, [], START, now);
  const same = dailyMenu(first.state, log, START, now + 3600000);
  assert.deepEqual(same.state.order, START);
  assert.deepEqual(same.moved, []);
  const next = dailyMenu(first.state, log, START, now + 86400000);
  assert.notDeepEqual(next.state.order, START);
});

test('reasons are written for people', () => {
  const now = at(9);
  const log = seedWeek(now);
  assert.equal(reason(log, 'notes', now, 'x'), 'You do this most mornings');
  assert.equal(reason(log, 'beans', now, 'x'), 'You did this 3 mornings this week');
  assert.equal(reason([], 'beans', now, 'Starter'), 'Starter');
  assert.match(usualTime(log, 'notes', now), /^\d\d:\d\d$/);
  assert.equal(usualTime([], 'notes', now), '');
});

test('a voice habit becomes one proposal, and never comes back once declined', () => {
  const now = at(18);
  const log = seedWeek(now);
  const p = proposals(log, TILES, START, now);
  assert.deepEqual(p, [{ id: 'weather', text: 'You ask for the weather most evenings. Add a tile?' }]);
  assert.deepEqual(proposals(log, TILES, [...START, 'weather'], now), []);
  assert.deepEqual(proposals([], TILES, START, now), []);
});
