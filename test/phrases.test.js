// The demo asks in more words (build-calendar's probe of 78 wordings): each group plans the way the agent hears it.
import test from 'node:test';
import assert from 'node:assert/strict';
import { hear } from '../public/agent/words.js';
import { planUtterance } from '../public/agent/planner.js';
import { describeRegistry } from '../public/agent/plan.js';
import ids from '../public/apps/apps.js';

const apps = [];
for (const id of [...ids, 'look']) { try { apps.push((await import(`../public/apps/${id}/index.js`)).default); } catch { /* not merged */ } }
const reg = describeRegistry(apps);
async function heard(said) {
  const h = hear(said);
  if (h.words.length) return h.words.map((w) => `word:${w.kind}`);
  const p = await planUtterance(h.rest, reg, { app: null, workflows: [] }, { offline: true });
  return p.steps.length ? p.steps.map((s) => `${s.tool}${JSON.stringify(s.params)}`) : [p.say];
}
async function all(lines, check) { for (const l of lines) { const r = await heard(l); assert.ok(check(r.join(' > ')), `${l} -> ${r.join(' > ')}`); } }

test('Stop, the safety word, in its everyday forms', () => all(['stop talking', 'shush', 'enough', "That's enough.", 'shut up', 'be quiet', 'Hush'], (r) => r === 'word:stop'));
test('"tell me more about that", "and?", "what else" are "more", never a text to Me', () => all(['Tell me more about that', 'And?', 'What else', 'tell me more about it'], (r) => r === 'word:more'));
test('"go on" stays carry on (it says the more only when the last result had one)', () => all(['go on'], (r) => r === 'word:carry_on'));
test('an event and a day is a calendar move; a word and a day is still a word edit', async () => {
  await all(['Change lunch to Friday', 'Reschedule lunch for Friday', 'Put lunch on Friday', 'change my 3pm to thursday'], (r) => /^calendar__move\{"event":"[^"]+","day":"(Friday|Thursday)"\}$/.test(r));
  await all(['Change Tuesday to Wednesday'], (r) => r.startsWith('messages__replace'));
});
test('undo in other words', () => all(['cancel that', 'oops undo', 'put it back'], (r) => r === 'word:undo'));
test('what can you do', () => all(['What can you do?', 'what can Murmur do', 'help me', 'what now'], (r) => r === 'word:offer'));
test("today in other words", () => all(['anything on today', "what's my day look like", "what's in my calendar today", 'do I have anything today', 'what does my day look like'],
  (r) => /^calendar__whatsOn\{"day":"Today"\}$/.test(r)));
test("Mum's message in other words", () => all(["read me Mum's message", 'read mums message', 'any messages from Mum', 'what did my mum send'],
  (r) => r === 'messages__openChat{"who":"Mum"} > messages__read{}'));
test('bigger in other words', () => all(['make it bigger', 'bigger writing', "I can't read this, make it bigger", "I can't read this"], (r) => r === 'look__textBigger{}'));
test('the miss line names Messages, Calendar and Your look', async () => {
  const [say] = await heard('Juggle the penguins');
  assert.match(say, /Messages, Calendar, Your look/);
});

test('"go on" and "and?" after a result with more say the longer answer', async () => {
  const { createAgent } = await import('../public/agent/index.js');
  const { phone } = await import('./agent-fixtures.js');
  const p = await phone();
  const spoken = [];
  const agent = createAgent({ registry: p.registry, bus: p.bus, ctxFor: p.ctxFor, agency: () => 'just', planOpts: { offline: true }, speak: async (t) => { spoken.push(t); } });
  await agent.hear("What's on Thursday");
  const short = spoken.at(-1);
  await agent.hear('go on');
  const more = spoken.at(-1);
  assert.notEqual(more, short); assert.match(more, /Book club/);
  await agent.hear('And?');
  assert.equal(spoken.at(-1), more);
});
