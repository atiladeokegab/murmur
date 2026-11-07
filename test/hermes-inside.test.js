import test from 'node:test';
import assert from 'node:assert/strict';
import { createTally, COLUMNS } from '../public/inside/tally.js';
import { forward } from '../public/inside/forward.js';
import { createBus } from '../public/sdk/bus.js';
import { server } from '../server.js';
import { _ring } from '../lib/relay.js';

const run = (events) => { const m = createTally(); for (const [type, p] of events) m.add({ type, ...p }); return m; };

test('a scripted task fills the five columns and the tally, with no gate bypassed', () => {
  const m = run([
    ['heard', { text: 'buy the usual', raw: 'uh buy the usual', path: 'speech', ms: 120 }],
    ['task:start', { task: 't-1', utterance: 'buy the usual', plan: [{ name: 'shop.add', params: { item: 'milk' } }, { name: 'shop.pay', params: {} }] }],
    ['step:start', { task: 't-1', action: 'add', app: 'shop', n: 1, of: 2, label: 'Adding milk', params: { item: 'milk' }, gate: null, dropped: ['colour'] }],
    ['tap', { app: 'shop', control: 'add-milk' }],
    ['step:verified', { task: 't-1', action: 'add', app: 'shop', n: 1, of: 2, ms: 40 }],
    ['step:start', { task: 't-1', action: 'pay', app: 'shop', n: 2, of: 2, label: 'Paying', params: {}, gate: 'pay', dropped: [] }],
    ['confirm', { app: 'shop', gate: 'pay', readback: 'Pay £3?', result: true }],
    ['step:verified', { task: 't-1', action: 'pay', app: 'shop', n: 2, of: 2, ms: 60 }],
    ['memory', { observation: { kind: 'repeat', what: 'milk' } }],
    ['task:done', { task: 't-1', ms: 900, ok: true }],
  ]);
  const c = m.columns();
  assert.deepEqual(Object.keys(c), COLUMNS);
  assert.deepEqual(c.Heard, [{ text: 'buy the usual', raw: 'uh buy the usual', path: 'speech', ms: 120 }]);
  assert.equal(c.Plan.length, 1);
  assert.deepEqual(c.Plan[0].plan.map((p) => p.name), ['shop.add', 'shop.pay']);
  assert.deepEqual(c.Plan[0].dropped, ['add.colour']);
  assert.equal(c.Actions.length, 2);
  assert.equal(c.Actions[0].label, 'Adding milk');
  assert.equal(c.Actions[0].control, 'add-milk');
  assert.equal(c.Actions[0].result, 'verified');
  assert.equal(c.Actions[0].ms, 40);
  assert.equal(c.Actions[1].gate, 'pay');
  assert.equal(c.Actions[1].control, null);
  assert.deepEqual(c.Asked, [{ app: 'shop', gate: 'pay', readback: 'Pay £3?', result: true }]);
  assert.deepEqual(c.Memory, [{ kind: 'observation', fields: { kind: 'repeat', what: 'milk' } }]);
  assert.deepEqual(m.tally(), { tasks: 1, verified: 2, failed: 0, asked: 1, bypassed: 0, modelCalls: 0 });
});

test('task:start utterance stands in for Heard when no heard event came', () => {
  const c = run([['task:start', { task: 't-1', utterance: 'go home', plan: [] }]]).columns();
  assert.equal(c.Heard[0].text, 'go home');
});

test('a gated step verified without a yes is a bypass; a no then a cancel is not', () => {
  const bypass = run([
    ['task:start', { task: 't', utterance: 'pay', plan: [] }],
    ['confirm', { app: 'shop', gate: 'pay', readback: 'early yes', result: true }], // before the step: does not count
    ['step:start', { action: 'pay', app: 'shop', n: 1, of: 1, label: 'Paying', params: {}, gate: 'pay', dropped: [] }],
    ['step:verified', { action: 'pay', app: 'shop', n: 1, of: 1, ms: 5 }],
  ]);
  assert.equal(bypass.tally().bypassed, 1);

  const refused = run([
    ['task:start', { task: 't', utterance: 'pay', plan: [] }],
    ['step:start', { action: 'pay', app: 'shop', n: 1, of: 1, label: 'Paying', params: {}, gate: 'pay', dropped: [] }],
    ['confirm', { app: 'shop', gate: 'pay', readback: 'Pay?', result: false }],
    ['step:failed', { action: 'pay', app: 'shop', n: 1, of: 1, reason: 'You said no', cancelled: true }],
  ]);
  assert.deepEqual(refused.tally(), { tasks: 1, verified: 0, failed: 1, asked: 1, bypassed: 0, modelCalls: 0 });
  assert.equal(refused.columns().Actions[0].reason, 'You said no');
});

test('relay: posted events replay over the SSE stream; unknown types are rejected', async (t) => {
  _ring.length = 0;
  await new Promise((r) => server.listen(0, r));
  const ctl = new AbortController();
  t.after(() => { ctl.abort(); server.closeAllConnections?.(); server.close(); });
  const base = `http://127.0.0.1:${server.address().port}`;
  const post = (body) => fetch(`${base}/api/bus`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }).then((r) => r.json());

  assert.deepEqual(await post({ events: [{ type: 'heard', text: 'hi', path: 'typed' }, { type: 'task:start', task: 't', utterance: 'hi', plan: [] }, { type: 'model:call' }] }), { accepted: 2 });
  assert.deepEqual(await post({ type: 'nope' }), { accepted: 0 });

  const res = await fetch(`${base}/api/bus/stream`, { signal: ctl.signal });
  assert.match(res.headers.get('content-type'), /text\/event-stream/);
  const reader = res.body.getReader(), dec = new TextDecoder();
  let buf = '';
  while ((buf.match(/^data: /gm) || []).length < 2) buf += dec.decode((await reader.read()).value, { stream: true });
  const got = buf.split('\n').filter((l) => l.startsWith('data: ')).map((l) => JSON.parse(l.slice(6)));
  assert.deepEqual(got.map((e) => e.type), ['heard', 'task:start']);
  assert.equal(got[0].text, 'hi');
});

test('forward() posts every bus event as {events:[{type, ...payload}]} with keepalive', async () => {
  const bus = createBus(), calls = [];
  const off = forward(bus, { url: '/x', fetchFn: async (url, init) => { calls.push({ url, init }); throw new Error('offline'); } });
  bus.emit('heard', { text: 'hi', path: 'typed' });
  bus.emit('tap', { app: 'shop', control: 'buy' });
  await new Promise((r) => setTimeout(r, 60));
  off();
  bus.emit('say', { text: 'not sent' });
  await new Promise((r) => setTimeout(r, 60));
  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, '/x');
  assert.equal(calls[0].init.keepalive, true);
  const { events } = JSON.parse(calls[0].init.body);
  assert.deepEqual(events.map(({ t, ...e }) => e), [{ type: 'heard', text: 'hi', path: 'typed' }, { type: 'tap', app: 'shop', control: 'buy' }]);
  assert.ok(events.every((e) => typeof e.t === 'number'));
});
