// Native access: every Your look setting and every OS verb is a voice tool, pressed on its visible row and verified.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createToolkit } from '../public/vendor/toolkit/index.js';
import { createAgent } from '../public/agent/index.js';
import { describeRegistry, toolsFor, BUILTINS } from '../public/agent/plan.js';
import { demoPlan } from '../public/agent/demo-plan.js';
import { phone, memoryKV } from './agent-fixtures.js';

const tick = () => new Promise((r) => setImmediate(r));
async function until(f, n = 2000) { for (let i = 0; i < n; i++) { if (f()) return; await tick(); } throw new Error('timed out'); }

async function setup({ os = {} } = {}) {
  const clock = { t: Date.UTC(2026, 10, 7, 8, 40), now() { return this.t; } };
  const sleep = async (ms) => { clock.t += ms; await tick(); };
  const kv = memoryKV();
  const { librarian } = createToolkit({ kv, clock });
  const p = await phone();
  const spoken = [];
  let current = null;
  const agent = createAgent({ registry: p.registry, bus: p.bus, ctxFor: p.ctxFor, librarian, clock, sleep, agency: () => 'just',
    os: { open: (id) => { current = id; }, current: () => current, ...os }, fingerprint: async () => true,
    planOpts: { offline: true }, speak: async (t) => { spoken.push(t); } });
  return { ...p, agent, spoken, ev: (n) => p.bus.log.filter((e) => e.name === n) };
}

// One eval line per setting: what is said, then the Your look state it must leave.
const SETTINGS = [
  ['Make the text bigger', { size: 150 }],
  ['Make the text smaller', { size: 100 }], // after bigger, below
  ['Set the text to 300 percent', { size: 300 }],
  ['Switch to yellow on black', { theme: 'yellow' }],
  ['Change the colours to light', { theme: 'light' }],
  ['Dark mode', { theme: 'dark' }],
  ['Make the voice faster', { rate: 1.25 }],
  ['Speak slower', { rate: 1 }],
  ['Let my screen reader speak', { speaker: 'reader' }],
  ['Murmur speaks', { speaker: 'murmur' }],
  ['Just do it', { agency: 'do' }],
  ['Teach me', { agency: 'teach' }],
  ['Ask me first', { agency: 'ask' }],
  ['Stop learning', { learning: false }],
  ['Start learning again', { learning: true }],
];

test('every setting said aloud presses its row in Your look and is verified', async () => {
  const s = await setup();
  for (const [said, want] of SETTINGS) {
    const before = s.ev('step:verified').length;
    await s.agent.hear(said);
    const look = s.state('look');
    for (const [k, v] of Object.entries(want)) assert.equal(look[k], v, `"${said}" left ${k}=${look[k]}`);
    assert.equal(s.ev('step:verified').length, before + 1, `"${said}" verified one step`);
    assert.equal(s.ev('step:verified').at(-1).app, 'look');
  }
  assert.ok(s.taps.some((t) => /^Text: bigger/.test(t)), 'the cursor pressed the visible Text row');
});

test('content that only mentions a setting is still a message', () => {
  const apps = describeRegistry([{ id: 'messages', name: 'Messages', actions: { openChat: {}, reply: {}, send: {} } }, { id: 'look', name: 'Your look', actions: { colours: {}, textBigger: {} } }]);
  for (const said of ["Text Sam I'm speeding up", 'Tell Mum to turn off the light', 'Text Sam the dark one is fine']) {
    const p = demoPlan(said, apps);
    assert.ok(p.plan.every((x) => !x.tool.startsWith('look')), `${said} -> ${p.plan.map((x) => x.tool)}`);
  }
});

test('the planner sees every registered app and every OS verb as a tool', async () => {
  const s = await setup();
  const names = toolsFor(describeRegistry(s.registry)).map((t) => t.name);
  for (const a of s.registry.list()) for (const k of Object.keys(a.actions)) assert.ok(names.includes(`${a.id}__${k}`), `${a.id}__${k}`);
  for (const b of ['open_app', 'where', 'go_home', 'sound', 'stop', 'undo', 'carry_on', 'save_workflow', 'run_workflow', 'explain', 'list_workflows', 'remove_workflow']) {
    assert.ok(BUILTINS[b] && names.includes(b), b);
  }
  assert.deepEqual(toolsFor(describeRegistry(s.registry)).find((t) => t.name === 'open_app').parameters.properties.app.enum, s.registry.list().map((a) => a.id));
});

test('routines by voice: list, then remove asks first and No keeps it', async () => {
  const s = await setup();
  const sent = s.agent.hear('Text Mum: running late');
  await until(() => s.agent.gates.current); await s.agent.yes(); await sent;
  await s.agent.hear('Save that as late');
  await s.agent.hear('What are my tiles');
  assert.match(s.spoken.at(-1), /Your tiles: .*Late/);
  let p = s.agent.hear('Remove late');
  await until(() => s.agent.gates.current?.gate === 'delete');
  assert.match(s.spoken.at(-1), /Remove the Late tile\. Delete it\?/);
  s.agent.no(); await p;
  assert.equal((await s.agent.workflows.all()).length, 1);
  p = s.agent.hear('Delete the late tile');
  await until(() => s.agent.gates.current); await s.agent.yes(); await p;
  assert.equal((await s.agent.workflows.all()).length, 0);
});

test('OS verbs: home, sound off, and undo said in other words', async () => {
  const calls = [];
  const s = await setup({ os: { home: () => calls.push('home'), sound: (on) => calls.push(`sound ${on}`) } });
  await s.agent.hear('Go home');
  await s.agent.hear('Turn the sounds off');
  await s.agent.hear('Sounds on');
  assert.deepEqual(calls, ['home', 'sound false', 'sound true']);
  await s.agent.runner.run({ utterance: 'write', steps: [{ tool: 'hello__write', app: 'hello', action: 'write', params: { text: 'Lunch.' } }] });
  const r = await s.agent.hear('Undo the last thing');
  assert.equal(r.status, 'reserved');
  assert.equal(s.ev('undo').at(-1)?.ok, true);
  assert.equal(s.state('hello').draft, '');
});
