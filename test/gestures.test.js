import test from 'node:test';
import assert from 'node:assert/strict';
import { recogniser, HOLD_MS, DOUBLE_MS } from '../public/lib/gestures.js';

function rig() {
  let now = 0, id = 0; const due = new Map(); const seen = [];
  const timers = { set: (fn, ms) => { due.set(++id, { fn, at: now + ms }); return id; }, clear: (i) => due.delete(i) };
  const advance = (ms) => { now += ms; for (const [i, d] of [...due]) if (d.at <= now) { due.delete(i); d.fn(); } };
  const on = new Proxy({}, { get: (_, name) => (...a) => seen.push([name, ...a].join(' ')) });
  return { g: recogniser(on, timers), advance, seen };
}

test('one tap fires after the double-tap window', () => {
  const { g, advance, seen } = rig();
  g.down(10, 10); g.up(12, 11); advance(DOUBLE_MS - 1);
  assert.deepEqual(seen, []);
  advance(1);
  assert.deepEqual(seen, ['tap']);
});

test('two quick taps are a double tap, not two taps', () => {
  const { g, advance, seen } = rig();
  g.down(10, 10); g.up(10, 10); advance(100); g.down(12, 12); g.up(12, 12); advance(1000);
  assert.deepEqual(seen, ['doubleTap']);
});

test('swipes report a direction', () => {
  const { g, seen } = rig();
  for (const [x, y] of [[100, 0], [-100, 5], [3, 90], [0, -90]]) { g.down(0, 0); g.move(x / 2, y / 2); g.up(x, y); }
  assert.deepEqual(seen, ['swipe right', 'swipe left', 'swipe down', 'swipe up']);
});

test('a hold starts on time, ends on release, and is not also a tap', () => {
  const { g, advance, seen } = rig();
  g.down(5, 5); advance(HOLD_MS); assert.deepEqual(seen, ['holdStart']);
  g.move(8, 8); advance(2000); g.up(8, 8); advance(1000);
  assert.deepEqual(seen, ['holdStart', 'holdEnd']);
});

test('a slow drag is not a hold', () => {
  const { g, advance, seen } = rig();
  g.down(0, 0); g.move(40, 0); advance(HOLD_MS * 2); g.up(30, 0); advance(1000);
  assert.deepEqual(seen, []);
});
