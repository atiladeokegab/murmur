// Undo's panel affordance follows the runner's original change window across tasks.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createToolkit } from '../../public/vendor/toolkit/index.js';
import { createAgent } from '../../public/agent/index.js';
import { IDLE, reduce } from '../../public/os/panel.js';
import { phone, memoryKV } from '../agent-fixtures.js';

const tick = () => new Promise((resolve) => setImmediate(resolve));
async function until(fn) {
  for (let i = 0; i < 2000; i++) { if (fn()) return; await tick(); }
  throw new Error('timed out');
}

async function setup() {
  const clock = { t: Date.UTC(2026, 10, 7, 8, 40), now() { return this.t; } };
  const sleep = async (ms) => { clock.t += ms; await tick(); };
  const kv = memoryKV();
  const { librarian } = createToolkit({ kv, clock });
  const p = await phone();
  const agent = createAgent({ registry: p.registry, bus: p.bus, ctxFor: p.ctxFor, librarian,
    agency: () => 'just', fingerprint: async () => true, clock, sleep, planOpts: { offline: true }, speak: async () => {} });
  let panel = IDLE;
  p.bus.on('*', (name, event) => { panel = reduce(panel, name, event); });
  return { ...p, agent, clock, panel: () => panel };
}

async function payShop(s) {
  const running = s.agent.hear('Order my usual from Demo Café.');
  await until(() => s.agent.gates.current);
  s.clock.t += 600;
  await s.agent.hear('pay');
  return running;
}

test('read-only work retains the original Undo deadline', async () => {
  const s = await setup();
  const write = [{ tool: 'hello__write', app: 'hello', action: 'write', params: { text: 'Lunch on Tuesday.' } }];

  await s.agent.runner.run({ utterance: 'write', steps: write });
  const original = s.panel().done.undo;
  assert.ok(original);

  // A read and a refusal must retain the same Undo affordance and deadline.
  s.clock.t += 7000;
  await s.agent.hear("Read Mum's message");
  assert.deepEqual(s.panel().done.undo, original);
});

test('a rejected task retains the available Undo affordance', async () => {
  const s = await setup();
  const write = [{ tool: 'hello__write', app: 'hello', action: 'write', params: { text: 'Lunch on Tuesday.' } }];
  await s.agent.runner.run({ utterance: 'write', steps: write });
  const original = s.panel().done.undo;
  assert.ok(original);
  await s.agent.runner.run({ utterance: 'unavailable action', steps: [
    { tool: 'messages__missing', app: 'messages', action: 'missing', params: {} },
  ] });
  assert.deepEqual(s.panel().done.undo, original);
});

test('Undo expires at its original deadline even after read-only work', async () => {
  const s = await setup();
  const write = [{ tool: 'hello__write', app: 'hello', action: 'write', params: { text: 'Lunch on Tuesday.' } }];
  await s.agent.runner.run({ utterance: 'write', steps: write });
  const original = s.panel().done.undo;
  assert.ok(original);
  s.clock.t += 7000;
  await s.agent.hear("Read Mum's message");
  s.clock.t = original.until + 1;
  assert.equal(await s.agent.undo(), false);
  assert.equal(s.state('hello').draft, 'Lunch on Tuesday.');
});

test('a pay gate clears earlier Undo and a later read-only task cannot restore it', async () => {
  const s = await setup();
  const write = [{ tool: 'hello__write', app: 'hello', action: 'write', params: { text: 'Lunch on Tuesday.' } }];
  await s.agent.runner.run({ utterance: 'write again', steps: write });
  assert.ok(s.panel().done.undo);
  const paid = await payShop(s);
  assert.equal(paid.status, 'done');
  assert.equal(s.state('shop').orders.length, 1);
  assert.equal(s.panel().done.undo, null);
  await s.agent.hear("Read Mum's message");
  assert.equal(s.panel().done.undo, null);
});
