// Atlas P1: a bank task is never remembered, through the real bus, attachMemory and Librarian.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createToolkit } from '../public/vendor/toolkit/index.js';
import { createBus } from '../public/sdk/index.js';
import { attachMemory, observationOf } from '../public/agent/memory.js';
import { memoryKV } from './agent-fixtures.js';

async function runTask(bus, id, steps, ok = true) {
  bus.emit('task:start', { task: id, utterance: 'x', plan: [] });
  for (const [app, action] of steps) bus.emit('step:verified', { task: id, app, action, n: 1, of: 1 });
  bus.emit('task:done', { task: id, ok, ms: 1, line: '' });
  for (let i = 0; i < 50; i++) await new Promise((r) => setImmediate(r));
}

test('bank tasks never reach the Librarian, alone or mixed with another app; other apps still log', async () => {
  const kv = memoryKV();
  const { librarian } = createToolkit({ kv });
  const bus = createBus();
  attachMemory({ librarian, bus });
  const stored = async () => JSON.stringify(await kv.getAll('local')) + JSON.stringify(await kv.getAll('sync')) + JSON.stringify(await kv.getAll('session'));
  await runTask(bus, 't1', [['bank', 'bank__payPerson']]);
  await runTask(bus, 't2', [['messages', 'messages__openChat'], ['bank', 'bank__payPerson']]);
  assert.ok(!/bank|payPerson/.test(await stored()), 'nothing about the bank is stored');
  assert.ok(!bus.log.some((e) => e.name === 'memory' && e.observation), 'no observation event either');
  await runTask(bus, 't3', [['messages', 'messages__openChat']]);
  assert.ok((await stored()).includes('openChat'), 'a messages task still logs');
  assert.equal(observationOf({ apps: ['bank'], actions: ['bank__payPerson'] }).category, 'finance');
});
