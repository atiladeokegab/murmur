import test from 'node:test';
import assert from 'node:assert/strict';
import { createToolkit } from '../public/vendor/toolkit/index.js';
import { createAgent } from '../public/agent/index.js';
import { createGraph, sayAbout, graphAllowed } from '../public/agent/graph.js';
import { createBus } from '../public/sdk/index.js';
import { demoPlan } from '../public/agent/demo-plan.js';
import { describeRegistry } from '../public/agent/plan.js';
import { CONTACTS } from '../public/lib/tiles.js';
import { phone, memoryKV } from './agent-fixtures.js';

const tick = () => new Promise((r) => setImmediate(r));
async function until(f, n = 2000) { for (let i = 0; i < n; i++) { if (f()) return; await tick(); } throw new Error('timed out'); }

const on = () => true;

test('the memory graph: relate strengthens, about is strongest first, forget deletes, and each relate is an event', async () => {
  const seen = [];
  const g = createGraph({ bus: { emit: (n, e) => seen.push([n, e]) }, learning: on });
  assert.equal(g.engine, 'fallback');
  assert.equal(await g.relate('you', 'knows', 'Mum'), true);
  await g.relate('you', 'knows', 'Sam'); await g.relate('you', 'knows', 'Sam');
  assert.deepEqual(g.about()[0], { from: 'you', edge: 'knows', to: 'Sam', weight: 2 });
  assert.deepEqual(seen.at(-1), ['graph:relate', { from: 'you', edge: 'knows', to: 'Sam' }]);
  assert.equal(await g.relate('you', 'hates', 'Sam'), false, 'only the known edges');
  assert.equal(g.forget('sam'), 1);
  assert.deepEqual(g.about().map((e) => e.to), ['Mum']);
});

test('learning off (or no Librarian answer) means no write at all', async () => {
  let learning = false;
  const g = createGraph({ learning: async () => learning });
  assert.equal(await g.relate('you', 'prefers', 'short answers'), false);
  await g.seed({ look: { answers: 'short' } });
  assert.deepEqual(g.about(), []);
  assert.equal(await createGraph().relate('you', 'prefers', 'short answers'), false, 'off unless told learning is on');
  learning = true;
  assert.equal(await g.relate('you', 'prefers', 'short answers'), true);
});

test('only what the Librarian accepts: a Yes to the habit proposal, never a verified send', async () => {
  const bus = createBus();
  const g = createGraph({ learning: on });
  g.listen((n, f) => bus.on(n, f));
  bus.emit('step:verified', { action: 'messages__send', app: 'messages', n: 1, of: 1 });
  bus.emit('memory', { response: { id: 'first:transit', answer: 'Not now' } });
  await tick();
  assert.deepEqual(g.about(), []);
  bus.emit('memory', { response: { id: 'first:transit', answer: 'Yes' } });
  await until(() => g.about().length);
  assert.deepEqual(g.about().map((e) => [e.edge, e.to]), [['usually', 'check the bus first in the morning']]);
});

test('health, money and government never enter the graph', async () => {
  const g = createGraph({ learning: on });
  for (const t of ['diabetes', 'back pain', 'her medication', 'a diagnosis', 'a symptom', 'the doctor', 'my bank', '£40', 'card number',
    'my £20', '20 pounds', 'renew my passport', 'claim benefits', 'universal credit', 'the council tax'])
    assert.equal(await g.relate('you', 'usually', t), false, t);
  assert.equal(await g.relate('Diabetes clinic', 'lives_at', 'Elm Road'), false);
  assert.equal(graphAllowed('you', 'usually', 'renew my passport'), false);
  assert.deepEqual(g.about(), []);
});

test('seed and look: your look only; a look change swaps the preference', async () => {
  const g = createGraph({ learning: on });
  const look = { answers: 'short', size: 100, speaker: 'murmur' };
  await g.seed({ look, contacts: CONTACTS });
  assert.ok(g.about().every((e) => e.edge === 'prefers'), 'contacts are not copied in');
  await g.relate('you', 'usually', 'check the bus first in the morning');
  assert.equal(sayAbout(g.about()).short, 'You like short answers, and you check the bus first in the morning.');
  await g.lookChanged({ ...look, answers: 'detailed' });
  const prefs = g.about().filter((e) => e.edge === 'prefers').map((e) => e.to);
  assert.ok(prefs.includes('long answers') && !prefs.includes('short answers'));
});

test('"what do you know about me" and "forget that I check the bus" plan to the graph tools', () => {
  const apps = describeRegistry([]);
  assert.deepEqual(demoPlan('What do you know about me?', apps).plan, [{ tool: 'recall', params: {} }]);
  assert.deepEqual(demoPlan('Forget that I check the bus', apps).plan, [{ tool: 'forget_fact', params: { what: 'check the bus' } }]);
  assert.notEqual(demoPlan('forget that', apps).plan[0]?.tool, 'forget_fact', 'the look rule keeps "forget that"');
});

async function setup() {
  const clock = { t: Date.UTC(2026, 10, 7, 8, 40), now() { return this.t; } };
  const sleep = async (ms) => { clock.t += ms; await tick(); };
  const { librarian } = createToolkit({ kv: memoryKV(), clock });
  const p = await phone();
  const graph = createGraph({ bus: p.bus, learning: on });
  await graph.seed({ look: { answers: 'short' } });
  await graph.relate('you', 'knows', 'Mum'); // as if mirrored from an accepted proposal
  await graph.relate('you', 'usually', 'check the bus first in the morning');
  const spoken = [];
  const agent = createAgent({ registry: p.registry, bus: p.bus, ctxFor: p.ctxFor, librarian, clock, sleep, graph,
    planOpts: { offline: true }, speak: async (t) => { spoken.push(t); } });
  return { agent, graph, spoken };
}

test('the agent answers short, tells more, and forget asks first: No keeps it, Yes forgets it', async () => {
  const s = await setup();
  await s.agent.hear('What do you know about me?');
  await until(() => s.spoken.some((t) => t.startsWith('You text Mum most')));
  assert.ok(s.spoken.includes('You text Mum most, you like short answers, and you check the bus first in the morning.'));
  await s.agent.hear('tell me more');
  await until(() => s.spoken.some((t) => t.includes('Murmur speaking')));

  let p = s.agent.hear('Forget that I check the bus');
  await until(() => s.agent.gates.current);
  assert.equal(s.agent.gates.current.gate, 'delete');
  assert.match(s.agent.gates.current.readback, /^Forget that you check the bus first in the morning\?$/);
  s.agent.no(); await p;
  assert.equal(s.graph.find('check the bus').length, 1, 'a No does nothing');

  p = s.agent.hear('Forget that I check the bus');
  await until(() => s.agent.gates.current);
  await s.agent.yes(); await p;
  assert.equal(s.graph.find('check the bus').length, 0);
});
