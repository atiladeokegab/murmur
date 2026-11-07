import test from 'node:test';
import assert from 'node:assert/strict';
import { createBus } from '../public/sdk/index.js';
import { firstOpen, rearm, captionIn, FIRST_WORDS, NO_EARS, FIRST_WIN, NUDGE, MIC_BLOCKED } from '../public/os/onboard/index.js';
import { fakeDocument } from './fake-dom.js';

const memKv = () => { const m = new Map(); return { get: async (k) => m.get(k), set: async (k, v) => (v === undefined ? m.delete(k) : m.set(k, v)) }; };
const tick = () => new Promise((r) => setImmediate(r));
// A phone: the welcome's voice, its caption, the bus, and a sleep the test lets go of by hand.
function phone(o = {}) {
  const said = [], shown = [], bus = createBus();
  let wake = null;
  const sleep = (ms) => new Promise((r) => { wake = () => { wake = null; r(); }; sleep.ms = ms; });
  const opts = { kv: o.kv || memKv(), bus, say: async (t) => { said.push(t); }, caption: (t) => shown.push(t), ears: true, waitTap: false, mic: null, sleep, ...o };
  return { said, shown, bus, opts, sleep, wake: async () => { await tick(); wake?.(); await tick(); await tick(); }, open: () => firstOpen(opts) };
}

test('step 1: first open says who Murmur is, how to talk and one thing to try, on screen too, once', async () => {
  const p = phone();
  assert.equal(await p.open(), true);
  assert.deepEqual(p.said, [FIRST_WORDS]);
  assert.deepEqual(p.shown, [FIRST_WORDS], 'the same line as a quiet caption');
  assert.match(FIRST_WORDS, /Tap anywhere and speak\. Try saying: read my messages\.$/);
  assert.equal(await p.open(), false, 'never twice');
  assert.deepEqual(p.said, [FIRST_WORDS]);
});

test('step 1 with no speech recognition says plainly to use Chrome or type', async () => {
  const p = phone({ ears: false });
  await p.open();
  assert.deepEqual(p.said, [NO_EARS]);
  assert.match(NO_EARS, /can't hear you.*Chrome.*type/);
});

test('step 1 waits for the first tap when the browser will not speak before one; that tap does nothing else', async () => {
  const listeners = {};
  const win = { addEventListener: (t, f) => ((listeners[t] ||= []).push(f)), removeEventListener: (t, f) => { listeners[t] = (listeners[t] || []).filter((g) => g !== f); } };
  const fire = (type, extra = {}) => { const e = { type, stopped: false, prevented: false, stopImmediatePropagation() { this.stopped = true; }, stopPropagation() { this.stopped = true; }, preventDefault() { this.prevented = true; }, ...extra }; (listeners[type] || []).forEach((f) => f(e)); return e; };
  const p = phone({ waitTap: true, win });
  await p.open();
  assert.deepEqual(p.said, [], 'nothing said into a blocked voice');
  assert.deepEqual(p.shown, [FIRST_WORDS], 'the caption is up at once');
  assert.equal(fire('keydown', { key: 'Tab' }).stopped, false, 'Tab still moves about');
  assert.equal(fire('pointerdown').stopped, true, 'the tap does not start listening');
  fire('pointerup');
  const c = fire('click');
  assert.equal(c.stopped && c.prevented, true);
  assert.deepEqual(p.said, [FIRST_WORDS], 'the first tap says the welcome');
  assert.equal(fire('click').stopped, false, 'the next tap is the shell\'s again');
});

test('steps 2 and 3: the first success gets the three trouble words, then one more thing to try; then never again', async () => {
  const kv = memKv(), p = phone({ kv });
  await p.open();
  p.bus.emit('task:done', { ok: false, line: 'Stopped.' });
  await p.wake();
  assert.deepEqual(p.said, [FIRST_WORDS], 'a failure is not a success');
  p.bus.emit('heard', { text: 'read my messages' }); p.bus.emit('task:start', {});
  p.bus.emit('task:done', { ok: true, line: 'Sam says see you at six.' });
  assert.ok(p.sleep.ms > 1500, 'waits about as long as the result takes to say');
  await p.wake();
  assert.deepEqual(p.said, [FIRST_WORDS, FIRST_WIN, NUDGE]);
  assert.equal(FIRST_WIN, "That's it. Say 'what can I do' any time, 'stop' to stop me, or 'undo' to take it back.");
  assert.equal(NUDGE, "Try: text Sam I'm ten minutes late.");
  assert.deepEqual(p.shown.slice(-2), [FIRST_WIN, NUDGE]);
  p.bus.emit('task:start', {});
  assert.equal(p.shown.at(-1), null, 'the caption goes when they try it');
  p.bus.emit('task:done', { ok: true, line: 'Sent.' });
  await p.wake();
  assert.equal(p.said.length, 3, 'once only');
  const again = phone({ kv });
  await again.open();
  again.bus.emit('task:done', { ok: true, line: 'Sent.' });
  await again.wake();
  assert.deepEqual(again.said, [], 'a later open says nothing at all');
  await rearm({ kv });
  const fresh = phone({ kv });
  await fresh.open();
  fresh.bus.emit('task:done', { ok: true, line: 'x' });
  await fresh.wake();
  assert.deepEqual(fresh.said, [FIRST_WORDS, FIRST_WIN, NUDGE], 'rearm (and Reset) bring the whole welcome back');
});

test('step 2 never talks over the person: speaking again moves it to the next success', async () => {
  const p = phone();
  await p.open();
  p.bus.emit('task:done', { ok: true, line: 'Three chats.' });
  p.bus.emit('heard', { text: 'text Sam' });
  await p.wake();
  assert.deepEqual(p.said, [FIRST_WORDS]);
  p.bus.emit('task:done', { ok: true, line: 'Sent to Sam.' });
  await p.wake();
  assert.deepEqual(p.said, [FIRST_WORDS, FIRST_WIN, NUDGE]);
});

test('a blocked microphone is said plainly, at open or when it changes', async () => {
  const st = { state: 'prompt', fns: [], addEventListener(t, f) { this.fns.push(f); } };
  const p = phone({ mic: { query: async () => st } });
  await p.open(); await tick();
  assert.ok(!p.said.includes(MIC_BLOCKED));
  st.state = 'denied'; st.fns.forEach((f) => f());
  assert.equal(p.said.at(-1), MIC_BLOCKED);
  assert.match(MIC_BLOCKED, /blocked.*Allow it.*type/);
  const q = phone({ mic: { query: async () => ({ state: 'denied' }) } });
  await q.open(); await tick();
  assert.ok(q.said.includes(MIC_BLOCKED));
});

test('the caption is quiet: hidden from screen readers, shown only while there is a line', () => {
  const doc = fakeDocument(), status = doc.createElement('span');
  doc.body.append(status);
  const show = captionIn(status);
  const p = doc.body.querySelector('p');
  assert.equal(p.getAttribute('aria-hidden'), 'true');
  assert.equal(p.hidden, true);
  show(FIRST_WORDS);
  assert.equal(p.textContent, FIRST_WORDS); assert.equal(p.hidden, false);
  show(null);
  assert.equal(p.hidden, true);
});
