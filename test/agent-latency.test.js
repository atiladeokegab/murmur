// The magic bar: an ack before a slow plan, a speculative plan reused, a 1.2 s budget for the model, warm lines.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createToolkit } from '../public/vendor/toolkit/index.js';
import { createAgent, ACK } from '../public/agent/index.js';
import { planUtterance, MISSED } from '../public/agent/planner.js';
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
test('"On it." is the first thing said on every task, and the steps act while it is spoken', async () => {
  let release;
  const slowSpeech = [];
  const s = await setup({ speak: (t) => { slowSpeech.push(t); return t === ACK ? new Promise((r) => { release = r; }) : Promise.resolve(); } });
  const done = s.agent.hear('Make the text bigger');
  await new Promise((r) => setTimeout(r, 20));
  assert.equal(slowSpeech[0], ACK);
  assert.equal(s.state('look').size, 150, 'the step ran while "On it." was still being said');
  assert.equal(slowSpeech.length, 1, 'the next line waits its turn');
  release(true); await done;
  assert.ok(slowSpeech.length > 1);
});

test('Stop empties the speech queue', async () => {
  let release;
  const heard = [];
  const s = await setup({ speak: (t) => { heard.push(t); return new Promise((r) => { release = r; }); } });
  s.agent.hear('Make the text bigger');
  await new Promise((r) => setTimeout(r, 20));
  await s.agent.hear('stop');
  release(false); await new Promise((r) => setTimeout(r, 20));
  assert.deepEqual(heard, [ACK], 'nothing queued is said after Stop');
});

test('a prefetched plan is reused when the final words match, and replanned when they differ', async () => {
  let calls = 0;
  const counted = async (...a) => { calls++; return planUtterance(...a); };
  const s = await setup({ plan: counted });
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

test('demo first: known words never touch the network; the rest get one 2.5 s try, then a spoken miss', async () => {
  const p = await phone();
  const apps = describeRegistry(p.registry);
  let calls = 0;
  const gemini = (ms, steps) => async (u, o) => { calls++; await new Promise((r, j) => { const t = setTimeout(r, ms); o.signal.addEventListener('abort', () => { clearTimeout(t); j(new Error('timeout')); }); });
    return { ok: true, json: async () => ({ kind: 'task', steps, provider: 'gemini', model: 'm' }) }; };
  const bigger = [{ tool: 'look__textBigger', params: {} }];
  const known = await planUtterance('Make the text bigger', apps, {}, { fetch: gemini(1, bigger) });
  assert.equal(known.provider, 'demo'); assert.equal(calls, 0, 'no network for words the demo planner knows');
  const odd = await planUtterance('Embiggen the words please', apps, {}, { fetch: gemini(5, bigger) });
  assert.equal(odd.provider, 'gemini'); assert.equal(odd.steps[0].tool, 'look__textBigger');
  const slow = await planUtterance('Embiggen the words please', apps, {}, { fetch: gemini(200, bigger), budget: 20 });
  assert.equal(slow.steps.length, 0); assert.equal(slow.say, MISSED);
  const refused = await planUtterance('Check my bank balance', apps, {}, { fetch: gemini(1, bigger) });
  assert.equal(refused.kind, 'refuse'); assert.equal(calls, 2, 'a refusal never goes out');
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

test('ctx.type types letter by letter in a browser, instantly under reduced motion', async () => {
  const { createCtx } = await import('../public/sdk/ctx.js');
  const seen = [];
  const el = { value: '', readOnly: false, getAttribute: () => null, closest: () => null, matches: () => false, focus() {}, dispatchEvent() { seen.push(this.value); } };
  const ctx = createCtx({ app: { id: 'x', name: 'X' }, root: { contains: () => true }, bus: { emit() {} }, kv: {}, cursor: {} });
  let reduce = false;
  globalThis.matchMedia = () => ({ matches: reduce });
  try {
    const t0 = Date.now();
    await ctx.type(el, 'Hi Sam');
    assert.deepEqual(seen, ['H', 'Hi', 'Hi ', 'Hi S', 'Hi Sa', 'Hi Sam']);
    assert.ok(Date.now() - t0 >= 100, 'about 25 ms a letter');
    seen.length = 0; reduce = true;
    await ctx.type(el, 'Hi Sam');
    assert.deepEqual(seen, ['Hi Sam']);
  } finally { delete globalThis.matchMedia; }
});
