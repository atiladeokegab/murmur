import test from 'node:test';
import assert from 'node:assert/strict';
import { createTally, COLUMNS } from '../public/inside/tally.js';
import { forward, roomFrom } from '../public/inside/forward.js';
import { createBus } from '../public/sdk/bus.js';
import { server } from '../server.js';
import { _rings, allowed } from '../lib/relay.js';

const run = (events) => { const m = createTally(); for (const [type, p] of events) m.add({ type, ...p }); return m; };

test('a scripted task fills the five columns and the tally, with no gate bypassed', () => {
  const m = run([
    ['heard', { text: 'buy the usual', raw: 'uh buy the usual', path: 'speech', ms: 120 }],
    ['task:start', { task: 't-1', utterance: 'buy the usual', plan: [{ name: 'shop.add', params: { item: 'milk' } }, { name: 'shop.pay', params: {} }] }],
    ['step:start', { task: 't-1', action: 'add', app: 'shop', n: 1, of: 2, label: 'Adding milk', params: { item: 'milk' }, gate: null, dropped: ['colour'] }],
    ['tap', { app: 'shop', control: 'add-milk' }],
    ['step:verified', { task: 't-1', action: 'add', app: 'shop', n: 1, of: 2, ms: 40 }],
    ['step:start', { task: 't-1', action: 'pay', app: 'shop', n: 2, of: 2, label: 'Paying', params: {}, gate: 'pay', dropped: [] }],
    ['confirm', { task: 't-1', app: 'shop', gate: 'pay', readback: 'Pay £3?', result: true }],
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
  _rings.clear();
  await new Promise((r) => server.listen(0, r));
  const ctl = new AbortController();
  t.after(() => { ctl.abort(); server.closeAllConnections?.(); server.close(); });
  const base = `http://127.0.0.1:${server.address().port}`;
  const post = (body, room = 'stage') => fetch(`${base}/api/bus?room=${room}`, { method: 'POST', headers: { 'content-type': 'application/json', origin: base }, body: JSON.stringify(body) }).then((r) => r.json());
  // A forged `heard` from anywhere but this page is refused: no Origin, another site, or another site's fetch metadata.
  for (const h of [{}, { origin: 'https://evil.example' }, { origin: base, 'sec-fetch-site': 'cross-site' }]) {
    const r = await fetch(`${base}/api/bus`, { method: 'POST', headers: { 'content-type': 'application/json', ...h }, body: JSON.stringify({ type: 'heard', text: 'forged' }) });
    assert.equal(r.status, 403, JSON.stringify(h));
  }

  assert.deepEqual(await post({ events: [{ type: 'heard', text: 'hi', path: 'typed' }, { type: 'task:start', task: 't', utterance: 'hi', plan: [] }, { type: 'model:call' }] }), { accepted: 2 });
  assert.deepEqual(await post({ type: 'nope' }), { accepted: 0 });

  // Rooms: a judge's phone (no room, or another room) never reaches the stage's projector.
  assert.deepEqual(await post({ type: 'heard', text: 'judge' }, ''), { accepted: 0 }, 'no room: nothing published');
  assert.deepEqual(await post({ type: 'heard', text: 'judge' }, 'table-4'), { accepted: 1 });

  const res = await fetch(`${base}/api/bus/stream?room=stage`, { signal: ctl.signal });
  assert.match(res.headers.get('content-type'), /text\/event-stream/);
  const reader = res.body.getReader(), dec = new TextDecoder();
  let buf = '';
  while ((buf.match(/^data: /gm) || []).length < 2) buf += dec.decode((await reader.read()).value, { stream: true });
  const got = buf.split('\n').filter((l) => l.startsWith('data: ')).map((l) => JSON.parse(l.slice(6)));
  assert.deepEqual(got.map((e) => e.type), ['heard', 'task:start']);
  assert.equal(got[0].text, 'hi');
  assert.ok(!buf.includes('judge'), 'another room stays out of the stage');
});

test('rooms: only ?room=stage or #stage turns forwarding on; a plain phone has no room', () => {
  assert.equal(roomFrom({ search: '?room=stage', hash: '' }), 'stage');
  assert.equal(roomFrom({ search: '', hash: '#stage' }), 'stage');
  assert.equal(roomFrom({ search: '', hash: '' }), null);
  assert.equal(roomFrom({ search: '?room=<x>', hash: '' }), null);
  assert.equal(roomFrom({}), null);
});

test('relay: with MURMUR_TOKEN set, the POST needs x-murmur-token and the stream needs ?t=', () => {
  const req = (method, headers = {}) => ({ method, headers: { host: 'h', origin: 'http://h', ...headers } });
  const u = (q = '') => new URL(`http://h/api/bus${q}`);
  assert.equal(allowed(req('POST'), u(), 'k'), false);
  assert.equal(allowed(req('POST', { 'x-murmur-token': 'nope' }), u(), 'k'), false);
  assert.equal(allowed(req('POST', { 'x-murmur-token': 'k' }), u(), 'k'), true);
  assert.equal(allowed(req('POST', { 'x-murmur-token': 'k', origin: 'http://evil' }), u(), 'k'), false);
  assert.equal(allowed(req('GET'), u('/stream'), 'k'), false);
  assert.equal(allowed(req('GET'), u('/stream?t=k'), 'k'), true);
  assert.equal(allowed(req('GET'), u('/stream'), ''), true);
});

test('tally: a yes for another app or another task does not let a gated step through', () => {
  for (const other of [{ app: 'travel', task: 't1' }, { app: 'shop', task: 't0' }, { app: 'shop' }]) {
    const m = createTally();
    for (const [type, e] of [['task:start', { task: 't1', plan: [] }], ['step:start', { task: 't1', action: 'pay', app: 'shop', gate: 'pay' }],
      ['confirm', { gate: 'pay', result: true, ...other }], ['step:verified', { task: 't1', action: 'pay', app: 'shop' }]]) m.add({ type, ...e });
    assert.equal(m.tally().bypassed, 1, JSON.stringify(other));
  }
  const ok = createTally();
  for (const [type, e] of [['step:start', { task: 't1', action: 'pay', app: 'shop', gate: 'pay' }], ['confirm', { task: 't1', app: 'shop', gate: 'pay', result: true }],
    ['step:verified', { task: 't1', action: 'pay', app: 'shop' }]]) ok.add({ type, ...e });
  assert.equal(ok.tally().bypassed, 0);
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

test('app:import shows in the Plan column as the app coming over', () => {
  const m = run([['app:import', { name: 'Camera' }]]);
  assert.equal(m.columns().Plan.at(-1).plan[0].name, 'Bringing Camera over from the phone');
});
