import test from 'node:test';
import assert from 'node:assert/strict';
import { publish, stream, _rings, _screens } from '../lib/relay.js';
import { mirror } from '../public/os/mirror.js';

const sink = () => { const lines = []; return { lines, res: { writeHead() {}, write: (l) => lines.push(l) }, req: { on: (_, fn) => closers.push(fn) } }; };
const closers = [];
const data = (lines) => lines.filter((l) => l.startsWith('data: ')).map((l) => JSON.parse(l.slice(6)));

test('relay: mirror:frame keeps only the latest per room, never enters the ring, and greets a new laptop', () => {
  _rings.clear(); _screens.clear();
  const a = sink(); stream(a.req, a.res, 'stage');
  assert.ok(publish({ type: 'tap', control: 'x' }, 'stage'));
  for (const n of [1, 2, 3]) assert.ok(publish({ type: 'mirror:frame', html: `<body>${n}</body>`, w: 412, h: 915 }, 'stage'));
  assert.ok(publish({ type: 'mirror:frame', html: '<body>other</body>' }, 'table-4'));
  publish({ type: 'mirror:frame', html: '<body>3</body>', t: 42 }, 'stage');
  assert.equal(publish({ type: 'mirror:frame', html: 7 }, 'stage'), false, 'html must be a string');
  assert.deepEqual(data(a.lines).map((e) => e.html ?? e.type), ['tap', '<body>1</body>', '<body>2</body>', '<body>3</body>', '<body>3</body>'], 'live: every frame, this room only');
  assert.deepEqual(_rings.get('stage').map((e) => e.type), ['tap'], 'frames never in the replay ring');
  publish({ type: 'reset' }, 'stage');
  const b = sink(); stream(b.req, b.res, 'stage');
  assert.deepEqual(data(b.lines).map((e) => e.html ?? e.type), ['reset', '<body>3</body>'], 'a new laptop: the ring, then the one latest frame');
  assert.equal(data(b.lines).at(-1).t, 42, 'the phone\'s t rides through the relay');
  for (const c of closers) c(); // stop the streams' pings
});

test('mirror: at most one frame per 150 ms, none when nothing changed, none over 200 KB', async () => {
  let obs = null, t = 0, html = 'a';
  const win = { MutationObserver: class { constructor(fn) { obs = fn; } observe() {} disconnect() {} }, addEventListener() {}, removeEventListener() {} };
  const doc = { defaultView: win, addEventListener() {}, removeEventListener() {} };
  const sent = [], timers = [];
  const real = globalThis.setTimeout, realI = globalThis.setInterval, realC = globalThis.clearInterval; let tick = null;
  globalThis.setTimeout = (fn, ms) => { timers.push({ fn, ms }); return timers.length; };
  globalThis.setInterval = (fn) => { tick = fn; return 1; }; globalThis.clearInterval = () => {};
  try {
    const stop = mirror({ doc, room: 'stage', every: 150, now: () => t, send: (f) => sent.push(f.html), frame: () => ({ html, cx: null, cy: null }) });
    const settle = () => new Promise((r) => real(r, 0)); // let the send's promise finish
    const fire = async () => { timers.shift().fn(); await settle(); };
    await fire(); assert.deepEqual(sent, ['a'], 'the first frame at once');
    html = 'b'; obs(); obs(); obs();
    assert.equal(timers.length, 1, 'a burst of mutations is one frame');
    assert.equal(timers[0].ms, 150, 'and it waits out the 150 ms');
    t = 150; await fire(); assert.deepEqual(sent, ['a', 'b']);
    t = 400; obs(); assert.equal(timers[0].ms, 0, 'late enough: right away'); await fire();
    assert.deepEqual(sent, ['a', 'b'], 'nothing changed: no frame');
    html = 'x'.repeat(200 * 1024 + 1); t = 600; obs(); await fire();
    assert.deepEqual(sent, ['a', 'b'], 'over 200 KB: dropped');
    t = 5000; tick(); await settle(); assert.deepEqual(sent, ['a', 'b'], 'not yet 5 s since the last frame');
    html = 'b'; t = 5200; tick(); await settle(); assert.deepEqual(sent, ['a', 'b', 'b'], 'idle 5 s: a heartbeat of the same screen');
    t = 5300; tick(); await settle(); assert.equal(sent.length, 3, 'one heartbeat, then quiet again');
    stop();
  } finally { globalThis.setTimeout = real; globalThis.setInterval = realI; globalThis.clearInterval = realC; }
});

test('mirror: one POST in flight at a time; a change meanwhile goes right after, never out of order', async () => {
  let obs = null, html = 'a', done = null;
  const win = { MutationObserver: class { constructor(fn) { obs = fn; } observe() {} disconnect() {} }, addEventListener() {}, removeEventListener() {} };
  const doc = { defaultView: win, addEventListener() {}, removeEventListener() {} };
  const sent = [];
  const stop = mirror({ doc, room: 'stage', every: 1, beat: 1e9, send: (f) => { sent.push(f.html); return new Promise((r) => { done = r; }); }, frame: () => ({ html, cx: null, cy: null }) });
  const wait = (ms) => new Promise((r) => setTimeout(r, ms));
  await wait(10); assert.deepEqual(sent, ['a']);
  html = 'b'; obs(); await wait(10); html = 'c'; obs(); await wait(10);
  assert.deepEqual(sent, ['a'], 'held while the first is in flight');
  done(); await wait(10);
  assert.deepEqual(sent, ['a', 'c'], 'then the newest screen');
  html = 'd'; obs(); await wait(10); stop(); done(); await wait(10);
  assert.deepEqual(sent, ['a', 'c'], 'nothing after stop, even with a change queued behind a POST');
});

test('relay: a stalled laptop skips frames instead of buffering them', () => {
  _screens.clear();
  const slow = sink(); slow.res.writableLength = 2e6; stream(slow.req, slow.res, 'slow');
  const n = slow.lines.length;
  publish({ type: 'mirror:frame', html: '<body>x</body>' }, 'slow');
  assert.equal(slow.lines.length, n);
  for (const c of closers) c();
});
