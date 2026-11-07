// The magic scorer on a made-up run: silence gaps, dropped frames, layout shift and a cursor teleport.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { score } from '../../scripts/magic.mjs';

test('score finds the silence, the jank, the shift and the teleport', () => {
  const t0 = 1000;
  const M = {
    sounds: [{ kind: 'earcon', start: 1000, end: 1070 }, { kind: 'voice', start: 1300, end: 2000 }, { kind: 'voice', start: 3000, end: 3500 }],
    frames: [{ t: 1016, d: 16 }, { t: 1066, d: 50 }, { t: 1082, d: 16 }],
    shifts: [{ t: 500, v: 0.5 }, { t: 1500, v: 0.1, who: '#apps' }],
    cursor: [
      { t: 1100, x: 0, y: 0 }, { t: 1116, x: 50, y: 0 }, { t: 1132, x: 200, y: 0 }, { t: 1148, x: 200, y: 0 }, // 200 px in 2 frames: teleport
      { t: 1164, hidden: true }, { t: 1180, x: 0, y: 0 }, // reappearing elsewhere is not a teleport
      { t: 1196, x: 150, y: 0 }, { t: 1212, x: 260, y: 0 }, { t: 1228, x: 330, y: 0 }, { t: 1244, x: 360, y: 0 }, { t: 1260, x: 360, y: 0 }, // fast ease-out glide
    ],
    longtasks: [], events: [],
  };
  const r = score({ t0, answers: [], M, sentAt: 4000 });
  assert.equal(r.firstSound, 0);
  assert.equal(r.firstVoice, 300);
  assert.deepEqual(r.gaps.map((g) => [g.from, g.to]), [[1000, 2000], [2500, 4000]]); // the last gap runs on to Sent
  assert.equal(r.maxGap, 1500);
  assert.equal(r.dropped, 2);
  assert.equal(r.cls, 0.1); // the shift before the transcript is not the task's
  assert.deepEqual(r.jumps.map((j) => [j.px, j.frames]), [[200, 2]]);
});
