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
  ['Speak slower', { rate: 1.15 }],
  ['Let my screen reader speak', { speaker: 'reader' }],
  ['Murmur speaks', { speaker: 'murmur' }],
  ['Just do it', { agency: 'just' }],
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

test('demo lines: install, taxi, bank, the 9:40, leave for work', () => {
  const app = (id, name, acts) => ({ id, name, actions: acts.map(([n, props]) => ({ name: n, params: { type: 'object', properties: props } })) });
  const S = { type: 'string' }, N = { type: 'number' };
  const apps = [app('shop', 'Shop', [['add', { item: S, quantity: N }]]), app('taxi', 'Northline Taxis', [['book', { to: S }]]),
    app('bank', 'Bank', [['payPerson', { who: S, amount: N }]]), app('travel', 'Travel', [['hold', { flight: S }]]), app('transit', 'Transit', [['whenToLeave', { place: S }]])];
  const plan = (u, a = apps) => demoPlan(u, a).plan;
  assert.deepEqual(plan('Add Northline Taxis', apps.filter((a) => a.id !== 'taxi')), [{ tool: 'install_app', params: { name: 'Northline Taxis' } }]);
  assert.equal(plan('Add a flat white')[0].tool, 'shop__add');
  assert.deepEqual(plan('Book me a taxi home'), [{ tool: 'taxi__book', params: { to: 'home' } }]);
  assert.deepEqual(plan('Pay Sam twenty pounds'), [{ tool: 'bank__payPerson', params: { who: 'Sam', amount: 20 } }]);
  assert.deepEqual(plan('Pick the 9:40'), [{ tool: 'travel__hold', params: { flight: '9:40' } }]);
  assert.deepEqual(plan('Book the 9:40'), [{ tool: 'travel__hold', params: { flight: '9:40' } }]);
  assert.deepEqual(plan('When should I leave for work'), [{ tool: 'transit__whenToLeave', params: { place: 'Work' } }]);
});

test('install_app goes through os.install and says its line; open_app "the board" is a no-op, not a failure', async () => {
  const s = await setup({ os: { install: async (name) => ({ ok: true, say: `${name} is on your phone.` }) } });
  await s.agent.hear('Install Corner Grocer');
  assert.ok(s.spoken.includes('Corner Grocer is on your phone.'));
  const r = await s.agent.runner.run({ utterance: 'x', steps: [{ tool: 'open_app', params: { app: 'the board' } }, { tool: 'hello__write', app: 'hello', action: 'write', params: { text: 'Hi.' } }] });
  assert.equal(r.status, 'done');
  const bad = await s.agent.runner.run({ utterance: 'x', steps: [{ tool: 'go_home', params: {} }] });
  assert.equal(bad.status, 'failed');
  assert.match(bad.line, /didn't work/, 'a failed task says so');
});

test('a gated action resolves its person before the one confirm', async () => {
  const asked = [];
  const p = await phone({ patch: { shop: (a) => ({ pay: { ...a.pay, readback: (st, prm) => `Pay ${prm.who} £3.20.`,
    params: { type: 'object', properties: { who: { type: 'string' } } },
    async resolve(prm, ctx) { const c = await ctx.choose('Sam or Samira?', [{ label: 'Sam' }, { label: 'Samira' }]); return c && { ...prm, who: c.label }; } } }) } });
  const { librarian } = createToolkit({ kv: memoryKV() });
  const agent = createAgent({ registry: p.registry, bus: p.bus, ctxFor: p.ctxFor, librarian, agency: () => 'just', fingerprint: async () => true,
    planOpts: { offline: true }, speak: async (t) => { asked.push(t); } });
  const done = agent.runner.run({ utterance: 'pay', steps: [{ tool: 'shop__pay', app: 'shop', action: 'pay', params: { who: 'Sam' } }] });
  await until(() => asked.includes('Sam or Samira?'));
  assert.equal(agent.gates.current, null, 'no confirm before the name is known');
  await agent.hear('Samira');
  await until(() => agent.gates.current);
  assert.equal(agent.gates.current.readback, 'Pay Samira £3.20.');
  await agent.yes(); await done;
  assert.equal(asked.filter((t) => t === 'Sam or Samira?').length, 1);
});
