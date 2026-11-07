import test from 'node:test';
import assert from 'node:assert/strict';
import { describeRegistry } from '../public/agent/plan.js';
import { plan, cleanApps } from '../lib/agent/planner.js';
import { stubMessages } from './agent-fixtures.js';

const apps = describeRegistry([stubMessages()]);

test('POST /api/plan returns a validated plan offline', async () => {
  delete process.env.GEMINI_API_KEY;
  const { server } = await import('../server.js');
  await new Promise((r) => server.listen(0, r));
  try {
    const res = await fetch(`http://localhost:${server.address().port}/api/plan`, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ utterance: "Text Sam I'm ten minutes late", apps, context: { app: 'messages' } }),
    });
    const j = await res.json();
    assert.equal(res.status, 200);
    assert.equal(j.provider, 'demo');
    assert.deepEqual(j.steps.map((s) => s.tool), ['messages__openChat', 'messages__reply', 'messages__send']);
    assert.equal(j.steps[2].gate, 'send');
  } finally { server.close(); }
});

test('a Gemini failure falls back to the demo plan; the registry from the browser is cleaned', async () => {
  const realFetch = globalThis.fetch;
  globalThis.fetch = async () => ({ ok: false, status: 500 });
  try {
    const out = await plan({ key: 'k', utterance: "Read Mum's message", apps });
    assert.equal(out.provider, 'demo');
    assert.deepEqual(out.steps.map((s) => s.tool), ['messages__openChat', 'messages__read']);
  } finally { globalThis.fetch = realFetch; }
  const dirty = cleanApps([{ id: 'x y', actions: [] }, { id: 'ok', name: 'OK', actions: [{ name: 'go', gate: 'nuke' }, { name: '<script>' }] }]);
  assert.deepEqual(dirty.map((a) => a.id), ['ok']);
  assert.deepEqual(dirty[0].actions.map((x) => [x.name, x.gate]), [['go', null]]);
});

test('Gemini function calls become the plan, validated', async () => {
  const realFetch = globalThis.fetch;
  globalThis.fetch = async () => ({ ok: true, json: async () => ({ candidates: [{ content: { parts: [
    { functionCall: { name: 'messages__openChat', args: { name: 'Sam', evil: 1 } } },
    { functionCall: { name: 'messages__wipe', args: {} } },
  ] } }] }) });
  try {
    const out = await plan({ key: 'k', utterance: 'open Sam', apps });
    assert.equal(out.provider, 'gemini');
    assert.deepEqual(out.steps.map((s) => [s.tool, s.params]), [['messages__openChat', { name: 'Sam' }]]);
    assert.ok(out.dropped.some((d) => d.reason === 'unknown action'));
  } finally { globalThis.fetch = realFetch; }
});
