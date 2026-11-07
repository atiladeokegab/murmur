// The GUI-to-MCP adapter: every registered app action is an MCP tool, and a gated call can never skip the phone's yes.
import test from 'node:test';
import assert from 'node:assert/strict';
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { createToolkit } from '../public/vendor/toolkit/index.js';
import { createAgent } from '../public/agent/index.js';
import { describeRegistry } from '../public/agent/plan.js';
import { createRemoteRun } from '../public/os/remote-run.js';
import { loadRegistry, toolsFrom, createMcpServer, relayCall } from '../mcp/server.js';
import { phone, memoryKV } from './agent-fixtures.js';

const tick = () => new Promise((r) => setImmediate(r));
async function until(f, n = 2000) { for (let i = 0; i < n; i++) { if (f()) return; await tick(); } throw new Error('timed out'); }

async function connect(opts) {
  const [a, b] = InMemoryTransport.createLinkedPair();
  await createMcpServer(opts).connect(a);
  const client = new Client({ name: 'test', version: '0' });
  await client.connect(b);
  return client;
}

async function setup({ fingerprint = async () => true } = {}) {
  const clock = { t: Date.UTC(2026, 10, 7, 8, 40), now() { return this.t; } };
  const sleep = async (ms) => { clock.t += ms; await tick(); };
  const { librarian } = createToolkit({ kv: memoryKV(), clock });
  const p = await phone();
  const agent = createAgent({ registry: p.registry, bus: p.bus, ctxFor: p.ctxFor, librarian, fingerprint, agency: () => 'just', clock, sleep,
    planOpts: { offline: true }, speak: async () => {} });
  return { ...p, agent };
}

test('tools/list is the registry: one tool per app action, its own schema plus room, gates named', async () => {
  const described = await loadRegistry();
  const client = await connect({ tools: toolsFrom(described), call: async () => ({ ok: true }) });
  const { tools } = await client.listTools();
  assert.deepEqual(tools.map((t) => t.name), described.flatMap((a) => a.actions.map((x) => `${a.id}__${x.name}`)));
  assert.ok(tools.length > 20);
  for (const a of described) for (const x of a.actions) {
    const t = tools.find((y) => y.name === `${a.id}__${x.name}`);
    assert.equal(t.inputSchema.type, 'object');
    assert.ok(t.inputSchema.properties.room);
    for (const k of Object.keys(x.params.properties || {})) assert.deepEqual(t.inputSchema.properties[k], x.params.properties[k]);
    assert.equal(/Gated/.test(t.description), !!x.gate, t.name);
  }
  assert.match(tools.find((t) => t.name === 'messages__send').description, /Gated \(send\)/);
});

test('a call passes the room and returns the phone result; a bad room or unknown tool is refused', async () => {
  const seen = [];
  const client = await connect({ tools: [{ name: 'a__b', inputSchema: { type: 'object', properties: {} } }],
    call: async (name, params, room) => { seen.push({ name, params, room }); return { ok: true, status: 'verified' }; } });
  const r = await client.callTool({ name: 'a__b', arguments: { x: 1, room: 'Demo' } });
  assert.equal(r.isError, false);
  assert.equal(JSON.parse(r.content[0].text).status, 'verified');
  assert.deepEqual(seen, [{ name: 'a__b', params: { x: 1 }, room: 'demo' }]);
  assert.equal((await client.callTool({ name: 'a__b', arguments: { room: '../x' } })).isError, true);
  assert.equal((await client.callTool({ name: 'nope', arguments: {} })).isError, true);
  assert.equal(seen.length, 1);
});

test('a gated call with no yes comes back declined, and the app is untouched', async () => {
  const s = await setup();
  const run = createRemoteRun({ agent: s.agent, registry: s.registry });
  const p = run({ id: 'x1', tool: 'shop__pay', params: {} });
  await until(() => s.agent.gates.current);
  s.agent.no();
  const r = await p;
  assert.equal(r.status, 'declined');
  assert.equal(r.ok, false);
  assert.equal(r.gate, 'pay');
  assert.equal(s.registry.get('shop').state().orders.length, 0);
});

test('a send-gated call is never auto-yessed by its own tool name', async () => {
  const s = await setup();
  const run = createRemoteRun({ agent: s.agent, registry: s.registry });
  for (const tool of ['hello__send', 'messages__send']) {
    if (!s.registry.get(tool.split('__')[0])?.actions?.send?.gate) continue;
    const p = run({ id: tool, tool, params: {} });
    const r = await Promise.race([p, until(() => s.agent.gates.current).then(() => { s.agent.no(); return p; })]);
    assert.equal(r.status, "declined", tool);
  }
});

test('a gated call nobody answers times out as a No', async () => {
  const s = await setup();
  let fire;
  const run = createRemoteRun({ agent: s.agent, registry: s.registry, setTimer: (f) => { fire = f; return 1; }, clearTimer: () => {} });
  const p = run({ id: 'x2', tool: 'shop__pay', params: {} });
  await until(() => s.agent.gates.current);
  fire();
  const r = await p;
  assert.equal(r.status, 'timed out');
  assert.equal(s.registry.get('shop').state().orders.length, 0);
});

test('a gated call with the yes and the fingerprint is verified; an ungated one runs straight through', async () => {
  const s = await setup();
  const run = createRemoteRun({ agent: s.agent, registry: s.registry });
  assert.equal((await run({ id: 'u', tool: 'shop__orderUsual', params: {} })).status, 'verified');
  const p = run({ id: 'y', tool: 'shop__pay', params: {} });
  await until(() => s.agent.gates.current);
  s.agent.yes();
  const r = await p;
  assert.equal(r.status, 'verified', JSON.stringify(r));
  assert.equal(s.registry.get('shop').state().orders.length, 1);
  assert.equal((await run({ id: 'z', tool: 'shop__nothing', params: {} })).status, 'rejected');
});

test('relayCall: publishes remote:run to the room and resolves on the matching remote:result only', async () => {
  const fns = new Set(); const sent = [];
  const relay = { watching: (room) => room === 'demo', listen: (f) => { fns.add(f); return () => fns.delete(f); },
    publish: (ev, room) => sent.push({ ev, room }) };
  const call = relayCall(relay, { waitMs: 1000 });
  assert.equal((await call('shop__pay', {}, 'empty')).status, 'no phone');
  const p = call('shop__pay', { a: 1 }, 'demo');
  const { ev } = sent[0];
  assert.equal(ev.type, 'remote:run');
  assert.deepEqual(ev.params, { a: 1 });
  for (const f of fns) { f({ type: 'remote:result', id: 'other', ok: true }, 'demo'); f({ type: 'remote:result', id: ev.id, ok: true }, 'stage'); }
  for (const f of [...fns]) f({ type: 'remote:result', id: ev.id, ok: false, status: 'declined' }, 'demo');
  assert.equal((await p).status, 'declined');
  assert.equal(fns.size, 0);
  const t = await relayCall(relay, { waitMs: 5 })('shop__pay', {}, 'demo');
  assert.equal(t.status, 'timed out');
});
