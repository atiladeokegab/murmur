// Answers by length (the co-designer's ask): a short line by default, the longer answer on "tell me more", or
// straight away when Your look's Answers row is Detailed. Each step of the chain is tested here.
import test from 'node:test';
import assert from 'node:assert/strict';
import { createToolkit } from '../public/vendor/toolkit/index.js';
import { createAgent } from '../public/agent/index.js';
import { hear } from '../public/agent/words.js';
import { demoPlan } from '../public/agent/demo-plan.js';
import { describeRegistry } from '../public/agent/plan.js';
import { createBus, createRegistry, runAction } from '../public/sdk/index.js';
import { moreLine } from '../public/apps/calendar/index.js';
import { settings } from '../public/apps/look/index.js';
import { phone, memoryKV } from './agent-fixtures.js';
import { agoWords } from '../public/apps/messages/model.js';

const tick = () => new Promise((r) => setImmediate(r));

async function setup(answers = () => 'short') {
  const clock = { t: Date.UTC(2026, 10, 7, 8, 40), now() { return this.t; } };
  const sleep = async (ms) => { clock.t += ms; await tick(); };
  const { librarian } = createToolkit({ kv: memoryKV(), clock });
  const p = await phone();
  const spoken = [];
  const agent = createAgent({ registry: p.registry, bus: p.bus, ctxFor: p.ctxFor, librarian, agency: () => 'just', answers, clock, sleep,
    planOpts: { offline: true }, speak: async (t) => { spoken.push(t); } });
  return { ...p, agent, spoken };
}

test('1. SDK: an action with more(state, params) gives runAction a `more`; one without gives none', async () => {
  const registry = createRegistry(), bus = createBus();
  let n = 0;
  const app = { id: 'sum', name: 'Sum', mount() {}, read: () => '', place: () => ({}), state: () => ({ n }), seed() {}, reset() {},
    actions: {
      add: { describe: 'Add one and one', doing: 'Adding', hint: 'x', params: { type: 'object', properties: {} },
        async run() { n = 2; }, verify: (s) => s.n === 2, more: (s) => `1 + 1 is ${s.n}: one thing and one more make two.` },
      plain: { describe: 'Nothing more', doing: 'Doing', hint: 'x', params: { type: 'object', properties: {} },
        async run() {}, verify: () => true },
    } };
  registry.register(app);
  const ctxFor = () => ({ say: async () => {}, confirm: async () => true });
  assert.equal((await runAction({ registry, name: 'sum__add', params: {}, bus, ctxFor })).more, '1 + 1 is 2: one thing and one more make two.');
  assert.equal('more' in (await runAction({ registry, name: 'sum__plain', params: {}, bus, ctxFor })), false);
});

test('2. words: "more", "tell me more", "explain" and "longer" are reserved; "explain my morning" is content', () => {
  for (const t of ['more', 'Tell me more.', 'explain', 'longer', 'um, more please']) assert.deepEqual(hear(t).words.map((w) => w.kind), ['more'], t);
  assert.deepEqual(hear('explain my morning').words, []);
  assert.deepEqual(hear('more milk in the basket').words, []);
});

test('2. "tell me more" says the last result\'s longer answer; with none, "That\'s all there is."', async () => {
  const s = await setup();
  await s.agent.hear('tell me more');
  assert.equal(s.spoken.at(-1), "That's all there is.");
  await s.agent.hear("What's on Thursday");
  const short = s.spoken.at(-1);
  assert.equal(short, 'Thursday: Book club at 7 pm.', 'short by default');
  await s.agent.hear('tell me more');
  assert.equal(s.spoken.at(-1), moreLine(s.state('calendar').events, 'Thursday'));
  assert.match(s.spoken.at(-1), /^Book club, Thursday at 7 pm for 90 minutes\. Leave by 6:45 pm, in 3 days 9 hours 45 minutes\..*say "move Book club to" another day\.$/);
});

test('1. Calendar more: the next event, when to leave, the rest of the day, and how to move it', async () => {
  const s = await setup();
  await s.agent.hear("What's on today");
  assert.equal(s.spoken.at(-1), 'Nothing today. Next is Lunch with Mum on Tuesday at 12:30 pm.');
  await s.agent.hear('more');
  assert.equal(s.spoken.at(-1), 'Nothing on Monday. Next is Lunch with Mum, Tuesday at 12:30 pm for 60 minutes. Leave by 12:15 pm, in 1 day 3 hours 15 minutes. Nothing else on Tuesday. To change it, say "move Lunch with Mum to" another day.');
});

test('1. Messages more: who it is from, what came before, who else is waiting', async () => {
  const s = await setup();
  await s.agent.hear("Read Mum's last message");
  await s.agent.hear('tell me more');
  assert.equal(s.spoken.at(-1), 'From Mum, two minutes ago, message 3 of 3 in the chat. Before it, you said: Yes, all fine. Love you. New messages also from Sam. Say "reply" and your words to answer, or "read Sam\'s messages".');
});

test('1. a message says when it came, in words', () => {
  assert.deepEqual([0, 1, 2, 45, 90, 180, 1500, 4320, undefined].map(agoWords),
    ['just now', 'a minute ago', 'two minutes ago', '45 minutes ago', 'an hour ago', 'three hours ago', 'yesterday', 'three days ago', '']);
});

test('1 and 3. Look: a change has a longer answer, and Answers is a row the voice can set', async () => {
  const s = await setup(() => settings().answers);
  await s.agent.hear('give me longer answers');
  assert.equal(settings().answers, 'detailed');
  assert.equal(s.state('look').answers, 'detailed');
  s.spoken.length = 0;
  await s.agent.hear('Make the text bigger');
  assert.equal(s.spoken.at(-2), 'Text 150 percent.', 'the short line first');
  assert.match(s.spoken.at(-1), /^You can also change voice, now 1\.15 times; colours, now .*; and answers, now detailed\./, 'Detailed: the longer answer straight away');
  await s.agent.hear('keep it short');
  assert.equal(settings().answers, 'short');
  s.spoken.length = 0;
  await s.agent.hear('Make the text smaller');
  assert.equal(s.spoken.at(-1), 'Text 100 percent.', 'short again: no longer answer');
});

test('3. Detailed speaks `more` straight after the short answer; Short waits to be asked', async () => {
  const d = await setup(() => 'detailed');
  await d.agent.hear("What's on Thursday");
  assert.deepEqual(d.spoken.slice(-2), ['Thursday: Book club at 7 pm.', moreLine(d.state('calendar').events, 'Thursday')]);
  const sh = await setup(() => 'short');
  await sh.agent.hear("What's on Thursday");
  assert.equal(sh.spoken.at(-1), 'Thursday: Book club at 7 pm.');
});

test('3. the planner maps "give me longer answers" and "keep it short" to the Answers row', async () => {
  const p = await phone();
  const apps = describeRegistry(p.registry);
  for (const [t, length] of [['give me longer answers', 'detailed'], ['detailed answers', 'detailed'], ['keep it short', 'short'], ['short answers', 'short']]) {
    assert.deepEqual(demoPlan(t, apps).plan, [{ tool: 'look__answers', params: { length } }], t);
  }
  // the lines Look's longer answer tells people to say all plan
  for (const [t, tool] of [['yellow on black', 'look__colours'], ['voice faster', 'look__voiceFaster'], ['keep it short', 'look__answers']]) {
    assert.equal(demoPlan(t, apps).plan[0]?.tool, tool, t);
  }
});

test('3. Your look has an Answers row a person can press: Short or Detailed, pressed state shown', async () => {
  const p = await phone();
  const doc = p.doc;
  const detailed = doc.getElementById('look-answers-detailed');
  assert.equal(detailed.textContent, 'Detailed');
  assert.equal(doc.getElementById('look-answers-short').getAttribute('aria-pressed'), 'true');
  detailed.click();
  await tick();
  assert.equal(settings().answers, 'detailed');
  assert.equal(detailed.getAttribute('aria-pressed'), 'true');
  await p.registry.get('look').reset();
});

test('3. Look\'s longer answer falls back to the default on a saved value that is not an option', async () => {
  const { default: lookApp } = await import('../public/apps/look/index.js');
  const line = lookApp.actions.answers.more({ size: 100, rate: 1.15, theme: 'neon', speaker: 'nobody', agency: 'ask', answers: 'huge' });
  assert.match(line, /colours, now match my phone/);
  assert.match(line, /who speaks, now murmur/);
});
