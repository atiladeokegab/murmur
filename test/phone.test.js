import test from 'node:test';
import assert from 'node:assert/strict';
import { createBus, createRegistry, createCtx, appKv, mountApp, runAction } from '../public/sdk/index.js';
import { browserKV } from '../public/ports/browser-kv.js';
import { demoPlan } from '../public/agent/demo-plan.js';
import { describeRegistry } from '../public/agent/plan.js';
import calls from '../public/apps/calls/index.js';
import appIds from '../public/apps/apps.js';
import { fakeDocument, fakeStorage } from './fake-dom.js';

// One phone with only Calls on it. answers: the ask-first sheet's yes/no, in order.
async function phone({ answers = [], signal = new AbortController().signal } = {}) {
  const doc = fakeDocument(), bus = createBus(), registry = createRegistry();
  registry.register(calls);
  const kv = appKv('calls', browserKV({ storage: fakeStorage(), prefix: 'murmur' }));
  const asked = [];
  // The shell's os.confirm says yes at once when the agent pressed the control (the runner already asked).
  const root = await mountApp(calls, doc.body, { kv, bus, say: (text) => bus.emit('say', { text }), confirm: async () => true });
  await calls.reset();
  const ask = async (a) => { asked.push(a); return answers.shift() ?? false; };
  const ctxFor = (app) => createCtx({ app, root, bus, kv, cursor: { async moveTo() {}, hide() {} }, ask, signal });
  const run = (name, params) => runAction({ registry, name, params, bus, ctxFor, n: 1, of: 1 });
  const said = () => bus.log.filter((e) => e.name === 'say').map((e) => e.payload?.text ?? e.text);
  return { root, run, said, asked, registry, s: () => calls.state() };
}

test('calls: on the board, a real heading, call and call back are gated "call"', async () => {
  assert.ok(appIds.includes('calls'));
  const { root } = await phone();
  assert.equal(root.querySelector('h2').textContent, 'Calls');
  assert.equal(calls.actions.call.gate, 'call');
  assert.equal(calls.actions.callBack.gate, 'call');
  assert.equal(calls.actions.missed.gate, null);
  assert.equal(calls.actions.hangUp.gate, null);
});

test('calls: a call asks "Call Mum?", and a No does nothing', async () => {
  const p = await phone({ answers: [false] });
  const r = await p.run('calls__call', { who: 'Mum' });
  assert.deepEqual([r.ok, r.cancelled, r.reason], [false, true, 'Not called.']);
  assert.deepEqual(p.asked.map((a) => [a.gate, a.readback]), [['call', 'Call Mum?']]);
  assert.equal(p.s().status, 'idle');
  assert.equal(p.s().with, null);
});

test('calls: Stop at the gate does nothing', async () => {
  const stop = new AbortController();
  stop.abort();
  const p = await phone({ answers: [true], signal: stop.signal });
  const r = await p.run('calls__call', { who: 'Mum' });
  assert.equal(r.ok, false);
  assert.equal(p.s().status, 'idle');
  assert.equal(p.asked.length, 0, 'the sheet never even opened');
});

test('calls: yes, then "Calling Mum…", then no answer and the text suggestion', async () => {
  const p = await phone({ answers: [true] });
  p.root.querySelector('[data-call="mum"]').focus();
  const going = p.run('calls__call', { who: 'mum' });
  await new Promise((r) => setTimeout(r, 300));
  assert.equal(p.s().status, 'calling');
  assert.equal(p.root.querySelector('p').textContent, 'Calling Mum…');
  assert.equal(p.said().at(-1), 'Calling Mum.', 'said once, no live region');
  assert.equal(p.root.querySelector('[role="status"]'), null);
  assert.equal(p.root.ownerDocument.activeElement?.id, 'calls-hangup', 'focus moves to Hang up, never to body');
  assert.equal(calls.read(), 'Calling Mum.');
  const r = await going;
  assert.equal(r.ok, true, r.reason);
  assert.equal(p.s().status, 'noanswer');
  assert.equal(p.said().at(-1), "Mum isn't picking up. Say 'text Mum' to send a message.");
  assert.ok(!/\?/.test(p.said().at(-1)), 'no question without a gate behind it');
  assert.equal((await p.run('calls__hangUp', {})).ok, true);
  assert.equal(p.s().status, 'idle');
  assert.equal((await p.run('calls__hangUp', {})).ok, false, 'nothing to hang up');
});

test('calls: missed calls read back, and call back asks for the last caller', async () => {
  const p = await phone({ answers: [false] });
  assert.equal((await p.run('calls__missed', {})).ok, true);
  assert.equal(p.said().at(-1), 'Three missed calls. Mum, twenty minutes ago. Sam, an hour ago. Mum, yesterday.');
  const r = await p.run('calls__callBack', {});
  assert.equal(r.cancelled, true);
  assert.equal(p.asked[0].readback, 'Call Mum back?');
  assert.equal(p.root.querySelector('[data-back="mum"]').getAttribute('aria-label'), 'Mum, twenty minutes ago. Call back');
  assert.equal(p.s().status, 'idle');
});

test('calls: every say phrase plans to its own calls__ tool, and "text Mum" plans to Messages', async () => {
  const { registry } = await phone();
  const apps = describeRegistry(registry);
  for (const [k, a] of Object.entries(calls.actions)) {
    assert.deepEqual(demoPlan(a.say, apps).plan.map((x) => x.tool), [`calls__${k}`], a.say);
  }
  assert.deepEqual(demoPlan('call Sam back', apps).plan, [{ tool: 'calls__callBack', params: { who: 'Sam' } }]);
  assert.deepEqual(demoPlan('missed calls', apps).plan.map((x) => x.tool), ['calls__missed']);
  assert.equal(demoPlan('text Mum', apps).plan[0].tool, 'messages__openChat');
});
