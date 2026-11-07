// The magic bar: an ack before a slow plan, a speculative plan reused, a 1.2 s budget for the model, warm lines.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createToolkit } from '../public/vendor/toolkit/index.js';
import { createAgent, ACK } from '../public/agent/index.js';
import { planUtterance } from '../public/agent/planner.js';
import { describeRegistry } from '../public/agent/plan.js';
import { phone, memoryKV } from './agent-fixtures.js';

const wait = (ms) => new Promise((r) => setTimeout(r, ms));

async function setup(o = {}) {
  const { librarian } = createToolkit({ kv: memoryKV() });
  const p = await phone();
  const spoken = [];
  const agent = createAgent({ registry: p.registry, bus: p.bus, ctxFor: p.ctxFor, librarian, agency: () => 'just',
    planOpts: { offline: true }, speak: async (t) => { spoken.push(t); }, ...o });
  return { ...p, agent, spoken };
}
const plan200 = async (...a) => { await wait(60); return planUtterance(...a); };

test('a slow plan gets "On it." first, and the steps speak only after it', async () => {
  const s = await setup({ plan: plan200, ackMs: 10 });
  await s.agent.hear('Make the text bigger');
  assert.equal(s.spoken[0], ACK);
  assert.equal(s.spoken[1], 'Text bigger');
  assert.equal(s.state('look').size, 150);
});

test('a quick plan says no ack', async () => {
  const s = await setup({ ackMs: 50 });
  await s.agent.hear('Make the text bigger');
  assert.ok(!s.spoken.includes(ACK));
});

test('a prefetched plan is reused when the final words match, and replanned when they differ', async () => {
  let calls = 0;
  const counted = async (...a) => { calls++; return planUtterance(...a); };
  const s = await setup({ plan: counted, ackMs: -1 });
  await s.agent.prefetch('Make the text bigger');
  await s.agent.prefetch('make the text bigger.');
  assert.equal(calls, 1, 'same words, one plan');
  await s.agent.hear('Make the text bigger.');
  assert.equal(calls, 1, 'hear reused the early plan');
  assert.equal(s.state('look').size, 150);
  await s.agent.prefetch('Make the text');
  await s.agent.hear('Make the text smaller');
  assert.equal(calls, 3, 'different final words: planned again');
  assert.equal(s.state('look').size, 100);
});

test('Gemini past 1.2 s: the demo plan takes over and says so; quick Gemini wins; unknown words wait', async () => {
  const p = await phone();
  const apps = describeRegistry(p.registry);
  const gemini = (ms, steps) => async () => { await wait(ms); return { ok: true, json: async () => ({ kind: 'task', steps, provider: 'gemini', model: 'm' }) }; };
  const bigger = [{ tool: 'look__textBigger', params: {} }];
  const slow = await planUtterance('Make the text bigger', apps, {}, { fetch: gemini(200, bigger), budget: 20 });
  assert.equal(slow.provider, 'demo'); assert.equal(slow.late, 'gemini'); assert.equal(slow.steps[0].tool, 'look__textBigger');
  const quick = await planUtterance('Make the text bigger', apps, {}, { fetch: gemini(1, bigger), budget: 100 });
  assert.equal(quick.provider, 'gemini');
  const odd = await planUtterance('Embiggen the words please', apps, {}, { fetch: gemini(60, bigger), budget: 10 });
  assert.equal(odd.provider, 'gemini', 'the demo plan could not place it, so the model answer was awaited');
  const down = await planUtterance('Make the text bigger', apps, {}, { fetch: async () => { throw new Error('offline'); }, budget: 100 });
  assert.equal(down.provider, 'demo'); assert.equal(down.late, undefined);
});

test('task:start names the late provider honestly', async () => {
  const gemini = async () => { await wait(100); return { ok: true, json: async () => ({ kind: 'task', steps: [], provider: 'gemini' }) }; };
  const s = await setup({ planOpts: { fetch: gemini, budget: 5 }, ackMs: -1 });
  await s.agent.hear('Make the text bigger');
  const start = s.bus.log.find((e) => e.name === 'task:start');
  assert.equal(start.provider, 'demo'); assert.equal(start.late, 'gemini');
});

test('warm lists the fixed lines: the ack, Done, and every step label', async () => {
  const s = await setup();
  const lines = await s.agent.warm();
  for (const l of [ACK, 'Done.', 'Text bigger', 'Opening the chat']) assert.ok(lines.includes(l), l);
});

test('TTS lines are fetched once, and a failed one is fetched again', async () => {
  const { cachedTts, warmTts } = await import('../public/voice/tts-cache.js');
  let n = 0, fail = true;
  const fetch = async () => { n++; if (fail) { fail = false; return { ok: false, status: 503 }; } return { ok: true, json: async () => ({ audio: 'x', rate: 24000 }) }; };
  await assert.rejects(cachedTts('Done!', { fetch }));
  await warmTts(['Done!', 'On it!'], { fetch });
  assert.deepEqual(await cachedTts('Done!', { fetch }), { audio: 'x', rate: 24000 });
  assert.equal(n, 3);
});
