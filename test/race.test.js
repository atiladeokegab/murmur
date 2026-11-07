import test from 'node:test';
import assert from 'node:assert/strict';
import { fmt } from '../public/lib/race.js';
test('race clock reads m:ss.t', () => {
  assert.equal(fmt(0), '0:00.0');
  assert.equal(fmt(12_345), '0:12.3');
  assert.equal(fmt(61_999), '1:01.9');
  assert.equal(fmt(-5), '0:00.0');
});
