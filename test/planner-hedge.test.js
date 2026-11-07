// The hedge: a second Gemini call at 1.2 s when the first is slow, first answer wins, the loser is aborted,
// and the second call is counted against the daily cap.
import test from 'node:test';
import assert from 'node:assert/strict';
import { describeRegistry } from '../public/agent/plan.js';
import { plan } from '../lib/agent/planner.js';
import { createGuard } from '../lib/guard.js';
import messages from '../public/apps/messages/index.js';

const apps = describeRegistry([messages]);
const answer = () => ({ ok: true, json: async () => ({ candidates: [{ content: { parts: [{ functionCall: { name: 'messages__openChat', args: { who: 'Sam' } } }] } }] }) });
// Each call answers after its own delay (null = never), or rejects when aborted.
function fakeGemini(delays) {
  const calls = [];
  const fetch = (url, o) => new Promise((resolve, reject) => {
    const ms = delays[calls.length], call = { at: Date.now(), aborted: false };
    calls.push(call);
    const t = ms == null ? null : setTimeout(() => resolve(answer()), ms);
    o.signal.addEventListener('abort', () => { clearTimeout(t); call.aborted = true; reject(o.signal.reason); }, { once: true });
  });
  return { calls, fetch };
}
async function withFetch(f, run) {
  const real = globalThis.fetch;
  globalThis.fetch = f;
  try { return await run(); } finally { globalThis.fetch = real; }
}

test('a slow first call gets a second at 1.2 s; the second answer wins and the first is aborted', async () => {
  const g = fakeGemini([null, 50]);
  let spent = 0;
  const t0 = Date.now();
  const out = await withFetch(g.fetch, () => plan({ key: 'k', utterance: 'open Sam', apps, spend: () => { spent++; return true; } }));
  assert.equal(out.provider, 'gemini');
  assert.deepEqual(out.steps.map((s) => s.tool), ['messages__openChat']);
  assert.equal(g.calls.length, 2);
  assert.ok(g.calls[1].at - t0 >= 1150, 'the second call waits about 1.2 s');
  assert.ok(Date.now() - t0 < 2000, 'the answer arrives well inside the 2.4 s deadline');
  assert.equal(g.calls[0].aborted, true, 'the loser is aborted');
  assert.equal(spent, 1, 'the second call is counted');
});

test('a fast first call is the only call, and nothing extra is counted', async () => {
  const g = fakeGemini([30, 30]);
  let spent = 0;
  const out = await withFetch(g.fetch, () => plan({ key: 'k', utterance: 'open Sam', apps, spend: () => { spent++; return true; } }));
  await new Promise((r) => setTimeout(r, 1300));
  assert.equal(out.provider, 'gemini');
  assert.equal(g.calls.length, 1);
  assert.equal(spent, 0);
});

test('at the daily cap there is no second call; the 2.4 s deadline still falls back to the demo plan', async () => {
  const guard = createGuard({ dailyCap: 1 });
  assert.equal(guard.spend(), true, 'the request itself used the last call');
  const g = fakeGemini([null, 50]);
  const t0 = Date.now();
  const out = await withFetch(g.fetch, () => plan({ key: 'k', utterance: "Text Sam I'm ten minutes late", apps, spend: () => guard.spend() }));
  assert.equal(g.calls.length, 1, 'the cap refused the second call');
  assert.equal(out.provider, 'demo');
  assert.ok(Date.now() - t0 >= 2300, 'it waited for the deadline');
  assert.equal(g.calls[0].aborted, true);
});

test('the guard and the hedge share one daily count', () => {
  const guard = createGuard({ dailyCap: 2 });
  const req = { headers: {}, socket: { remoteAddress: '1.2.3.4' } };
  assert.equal(guard(req, { model: true }), null);
  assert.equal(guard.spend(), true, 'a hedge call takes the second slot');
  assert.equal(guard(req, { model: true })?.error, 'cap');
});
