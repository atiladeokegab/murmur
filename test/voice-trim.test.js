// Murmur's clips play without their silent ends: cut below about -48 dBFS, 30 ms kept each side.
import test from 'node:test';
import assert from 'node:assert/strict';
import { voiced } from '../public/live.js';

test('leading and trailing silence is cut, 30 ms kept, a soft tail kept', () => {
  const rate = 24000, pcm = new Int16Array(rate); // one second
  for (let i = 4800; i < 12000; i++) pcm[i] = 8000;      // speech from 200 to 500 ms
  for (let i = 12000; i < 13200; i++) pcm[i] = 200;      // a soft consonant tail to 550 ms (-44 dBFS)
  assert.deepEqual(voiced(pcm, rate), [4800 - 720, 13200 + 720]);
  assert.deepEqual(voiced(new Int16Array(100), rate), [0, 0], 'all silence plays nothing');
});
